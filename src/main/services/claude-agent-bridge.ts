import type {
  AiSessionRuntime,
  AiStartChatInput,
  AiStreamEvent,
  AiToolCallSummary
} from '../../shared/ipc-contract'
import type { AiProviderBridge, AiProviderRunContext } from './ai-provider-router'
import { AiSdkRuntimeManager } from './ai-sdk-runtime-manager'
import { LocalAiRuntimeService } from './local-ai-runtime-service'

type ClaudeQueryInput = {
  prompt: string
  options: {
    cwd: string
    abortController: AbortController
    settingSources: Array<'user' | 'project' | 'local'>
    permissionMode: 'acceptEdits'
  }
}

type ClaudeQuery = (input: ClaudeQueryInput) => AsyncIterable<ClaudeRawMessage>

type ClaudeRawMessage =
  | { type: 'system'; subtype: 'init'; session_id: string; permissionMode: string }
  | { type: 'system'; subtype: 'session_state_changed'; state: string }
  | { type: 'stream_event'; event?: unknown }
  | { type: 'assistant'; message?: { content?: unknown[] } }
  | {
      type: 'tool_progress'
      tool_use_id: string
      tool_name: string
      elapsed_time_seconds: number
    }
  | { type: 'tool_use_summary'; uuid: string; summary: string }
  | {
      type: 'result'
      subtype: 'success' | string
      errors: string[]
      result?: string
      session_id?: string
      usage: { input_tokens?: number; output_tokens?: number }
      total_cost_usd?: number
    }

async function loadClaudeAgentSdk(runtimeManager: AiSdkRuntimeManager): Promise<{
  query: ClaudeQuery
}> {
  const importUrl = await runtimeManager.getImportUrl('claude-code')
  return import(importUrl) as Promise<{ query: ClaudeQuery }>
}

/**
 * 与 Codex Bridge 保持同一输入策略，便于 renderer 复用完全相同的调用模型。
 */
function buildPrompt(messages: AiStartChatInput['messages']): string {
  return messages.map((message) => `${message.role}: ${message.content}`).join('\n\n')
}

/**
 * 把 Claude Agent 的工具进度统一转成项目内部 `tool` 事件。
 */
function createToolEvent(
  sessionId: string,
  toolId: string,
  name: string,
  status: AiToolCallSummary['status'],
  text?: string
): AiStreamEvent {
  return {
    type: 'tool',
    sessionId,
    toolId,
    name,
    status,
    text
  }
}

/**
 * Claude Agent Bridge 负责适配 `@anthropic-ai/claude-agent-sdk`。
 * 上层无需理解它的专有消息类型，只消费统一流事件。
 */
export class ClaudeAgentBridge implements AiProviderBridge {
  constructor(
    private readonly runtimeService: LocalAiRuntimeService,
    private readonly sdkRuntimeManager: AiSdkRuntimeManager
  ) {}

  async getRuntime(input: AiStartChatInput): Promise<AiSessionRuntime> {
    const snapshot = await this.runtimeService.getClaudeSnapshot()
    return {
      transport: 'claude-agent-sdk',
      workingDirectory: input.workingDirectory ?? process.cwd(),
      configPath: snapshot.configPath
    }
  }

  async run(context: AiProviderRunContext): Promise<void> {
    const runtime = await this.getRuntime(context.input)
    const { query } = await loadClaudeAgentSdk(this.sdkRuntimeManager)
    const abortController = new AbortController()
    // 把上层 abort 信号桥接给 Claude SDK，避免维护两套取消状态。
    context.abortSignal.addEventListener('abort', () => abortController.abort(), { once: true })

    const stream = query({
      prompt: buildPrompt(context.input.messages),
      options: {
        cwd: runtime.workingDirectory,
        abortController,
        // 优先复用用户已有的 Claude Code 多层配置。
        settingSources: ['user', 'project', 'local'],
        permissionMode: 'acceptEdits'
      }
    })

    for await (const rawMessage of stream) {
      if (context.abortSignal.aborted) break

      if (rawMessage.type === 'system' && rawMessage.subtype === 'init') {
        await context.emit({
          type: 'session-ref',
          sessionId: context.sessionId,
          providerSessionId: rawMessage.session_id
        })
        await context.emit({
          type: 'status',
          sessionId: context.sessionId,
          phase: 'starting',
          message: `Claude 会话已初始化，权限模式 ${rawMessage.permissionMode}`
        })
        continue
      }

      if (rawMessage.type === 'system' && rawMessage.subtype === 'session_state_changed') {
        const phase =
          rawMessage.state === 'running'
            ? 'streaming'
            : rawMessage.state === 'requires_action'
              ? 'starting'
              : 'completed'
        await context.emit({
          type: 'status',
          sessionId: context.sessionId,
          phase,
          message: `Claude 会话状态：${rawMessage.state}`
        })
        continue
      }

      if (rawMessage.type === 'stream_event') {
        // 增量文本和 thinking 都藏在 stream_event 里，需要手动拆成统一事件。
        const event = rawMessage.event as unknown as Record<string, unknown> | undefined
        const delta = event?.delta as Record<string, unknown> | undefined
        if (event?.type === 'content_block_delta' && delta?.type === 'text_delta') {
          await context.emit({
            type: 'delta',
            sessionId: context.sessionId,
            text: String(delta.text ?? '')
          })
          continue
        }
        if (event?.type === 'content_block_delta' && delta?.type === 'thinking_delta') {
          await context.emit({
            type: 'thinking',
            sessionId: context.sessionId,
            text: String(delta.thinking ?? '')
          })
          continue
        }
      }

      if (rawMessage.type === 'assistant') {
        // assistant 结果可能由多个 block 组成，统一拼接后再上抛。
        const blocks = Array.isArray(rawMessage.message?.content) ? rawMessage.message.content : []
        const text = blocks
          .map((block) => {
            if (block && typeof block === 'object' && 'text' in block) {
              return String((block as { text?: unknown }).text ?? '')
            }
            return ''
          })
          .join('')
        if (text.trim()) {
          await context.emit({ type: 'delta', sessionId: context.sessionId, text })
        }
        continue
      }

      if (rawMessage.type === 'tool_progress') {
        await context.emit(
          createToolEvent(
            context.sessionId,
            rawMessage.tool_use_id,
            rawMessage.tool_name,
            'start',
            `运行 ${rawMessage.tool_name}，已用时 ${rawMessage.elapsed_time_seconds}s`
          )
        )
        continue
      }

      if (rawMessage.type === 'tool_use_summary') {
        await context.emit(
          createToolEvent(
            context.sessionId,
            rawMessage.uuid,
            'tool_use_summary',
            'done',
            rawMessage.summary
          )
        )
        continue
      }

      if (rawMessage.type === 'result') {
        if (rawMessage.subtype !== 'success') {
          // 失败统一交给会话层写历史和 failed 状态。
          throw new Error(rawMessage.errors.join('\n') || 'Claude Agent 执行失败')
        }
        if (rawMessage.result) {
          await context.emit({
            type: 'delta',
            sessionId: context.sessionId,
            text: rawMessage.result
          })
        }
        await context.emit({
          type: 'usage',
          sessionId: context.sessionId,
          inputTokens: rawMessage.usage.input_tokens,
          outputTokens: rawMessage.usage.output_tokens,
          totalCostUsd: rawMessage.total_cost_usd
        })
      }
    }
  }
}
