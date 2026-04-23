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

export class CodexSdkBridge implements AiProviderBridge {
  constructor(private readonly runtimeService: LocalAiRuntimeService) {}

  async getRuntime(input: AiStartChatInput): Promise<AiSessionRuntime> {
    const snapshot = await this.runtimeService.getCodexSnapshot()
    return {
      transport: 'codex-sdk',
      workingDirectory: input.workingDirectory ?? process.cwd(),
      model: snapshot.model,
      baseUrl: snapshot.baseUrl,
      configPath: snapshot.configPath,
      authPath: snapshot.authPath,
      serviceTier: snapshot.serviceTier,
      approvalPolicy: snapshot.approvalPolicy,
      sandboxMode: snapshot.sandboxMode
    }
  }

  async run(context: AiProviderRunContext): Promise<void> {
    const runtime = await this.getRuntime(context.input)
    const { Codex } = await import('@openai/codex-sdk')
    const codex = new Codex({
      baseUrl: runtime.baseUrl,
      env: process.env.PATH ? { PATH: process.env.PATH } : undefined
    })
    const thread = codex.startThread({
      workingDirectory: runtime.workingDirectory,
      approvalPolicy:
        runtime.approvalPolicy === 'never' ||
        runtime.approvalPolicy === 'on-failure' ||
        runtime.approvalPolicy === 'untrusted' ||
        runtime.approvalPolicy === 'on-request'
          ? runtime.approvalPolicy
          : 'never',
      sandboxMode:
        runtime.sandboxMode === 'read-only' ||
        runtime.sandboxMode === 'danger-full-access' ||
        runtime.sandboxMode === 'workspace-write'
          ? runtime.sandboxMode
          : 'workspace-write',
      skipGitRepoCheck: true,
      model: runtime.model,
      networkAccessEnabled: true
    })
    const stream = await thread.runStreamed(buildPrompt(context.input.messages), {
      signal: context.abortSignal
    })
    const seenTextByItem = new Map<string, string>()

    const emitTextDelta = async (
      itemId: string,
      text: string,
      type: 'delta' | 'thinking'
    ): Promise<void> => {
      const previous = seenTextByItem.get(itemId) ?? ''
      const next = text || ''
      if (!next.trim()) {
        return
      }
      const delta = next.startsWith(previous) ? next.slice(previous.length) : next
      if (!delta) {
        return
      }
      seenTextByItem.set(itemId, next)
      await context.emit({ type, sessionId: context.sessionId, text: delta })
    }

    for await (const rawEvent of stream.events) {
      if (context.abortSignal.aborted) break

      if (rawEvent.type === 'thread.started') {
        await context.emit({
          type: 'session-ref',
          sessionId: context.sessionId,
          providerSessionId: rawEvent.thread_id
        })
        continue
      }

      if (rawEvent.type === 'turn.started') {
        await context.emit({
          type: 'status',
          sessionId: context.sessionId,
          phase: 'streaming',
          message: 'Codex 会话已开始'
        })
        continue
      }

      if (rawEvent.type === 'turn.completed') {
        await context.emit({
          type: 'usage',
          sessionId: context.sessionId,
          inputTokens: rawEvent.usage.input_tokens,
          outputTokens: rawEvent.usage.output_tokens
        })
        continue
      }

      if (rawEvent.type === 'turn.failed' || rawEvent.type === 'error') {
        throw new Error(rawEvent.type === 'error' ? rawEvent.message : rawEvent.error.message)
      }

      if (rawEvent.type === 'item.started' || rawEvent.type === 'item.updated') {
        const item = rawEvent.item
        if (item.type === 'reasoning' && item.text) {
          await emitTextDelta(item.id, item.text, 'thinking')
          continue
        }
        if (item.type === 'agent_message' && item.text) {
          await emitTextDelta(item.id, item.text, 'delta')
          continue
        }
        if (item.type === 'command_execution') {
          await context.emit(
            createToolEvent(
              context.sessionId,
              item.id,
              item.command || 'command_execution',
              item.status === 'in_progress' ? 'start' : item.status === 'failed' ? 'error' : 'done',
              item.aggregated_output
            )
          )
          continue
        }
        if (item.type === 'mcp_tool_call') {
          await context.emit(
            createToolEvent(
              context.sessionId,
              item.id,
              `${item.server}:${item.tool}`,
              item.status === 'in_progress' ? 'start' : item.status === 'failed' ? 'error' : 'done',
              item.error?.message
            )
          )
          continue
        }
        if (item.type === 'web_search') {
          await context.emit(
            createToolEvent(context.sessionId, item.id, 'web_search', 'start', item.query)
          )
          continue
        }
      }

      if (rawEvent.type === 'item.completed') {
        const item = rawEvent.item
        if (item.type === 'agent_message' && item.text) {
          await emitTextDelta(item.id, item.text, 'delta')
          continue
        }
        if (item.type === 'reasoning' && item.text) {
          await emitTextDelta(item.id, item.text, 'thinking')
          continue
        }
        if (item.type === 'command_execution') {
          await context.emit(
            createToolEvent(
              context.sessionId,
              item.id,
              item.command || 'command_execution',
              item.status === 'failed' ? 'error' : 'done',
              item.aggregated_output
            )
          )
          continue
        }
        if (item.type === 'file_change') {
          await context.emit(
            createToolEvent(
              context.sessionId,
              item.id,
              'file_change',
              item.status === 'failed' ? 'error' : 'done',
              item.changes.map((change) => `${change.kind}:${change.path}`).join('\n')
            )
          )
          continue
        }
        if (item.type === 'mcp_tool_call') {
          await context.emit(
            createToolEvent(
              context.sessionId,
              item.id,
              `${item.server}:${item.tool}`,
              item.status === 'failed' ? 'error' : 'done',
              item.error?.message
            )
          )
          continue
        }
        if (item.type === 'todo_list') {
          await context.emit(
            createToolEvent(
              context.sessionId,
              item.id,
              'todo_list',
              'done',
              item.items.map((todo) => `${todo.completed ? '[x]' : '[ ]'} ${todo.text}`).join('\n')
            )
          )
        }
      }
    }
  }
}
