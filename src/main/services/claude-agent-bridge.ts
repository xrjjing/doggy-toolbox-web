import type {
  AiSessionRuntime,
  AiStartChatInput,
  AiStreamEvent,
  AiToolCallSummary
} from '../../shared/ipc-contract'
import type { AiProviderBridge, AiProviderRunContext } from './ai-provider-router'
import { LocalAiRuntimeService } from './local-ai-runtime-service'

function buildPrompt(messages: AiStartChatInput['messages']): string {
  return messages.map((message) => `${message.role}: ${message.content}`).join('\n\n')
}

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

export class ClaudeAgentBridge implements AiProviderBridge {
  constructor(private readonly runtimeService: LocalAiRuntimeService) {}

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
    const { query } = await import('@anthropic-ai/claude-agent-sdk')
    const abortController = new AbortController()
    context.abortSignal.addEventListener('abort', () => abortController.abort(), { once: true })

    const stream = query({
      prompt: buildPrompt(context.input.messages),
      options: {
        cwd: runtime.workingDirectory,
        abortController,
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
