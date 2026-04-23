import type { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import type { AiStartChatInput, AiStartChatResult, AiStreamEvent } from '../../shared/ipc-contract'
import type { AiChatHistoryService } from './ai-chat-history-service'

type RunningSession = {
  abortController: AbortController
  cancelled: boolean
}

type RunnerContext = {
  sessionId: string
  input: AiStartChatInput
  abortSignal: AbortSignal
  emit: (event: AiStreamEvent) => Promise<void>
}

type AiBridgeRunners = {
  codex: (context: RunnerContext) => Promise<void>
  claudeCode: (context: RunnerContext) => Promise<void>
}

function buildPrompt(messages: AiStartChatInput['messages']): string {
  return messages.map((message) => `${message.role}: ${message.content}`).join('\n\n')
}

function deriveTitle(input: AiStartChatInput): string {
  const candidate =
    input.title ||
    input.messages.find((message) => message.role === 'user')?.content ||
    input.messages[0]?.content ||
    `${input.provider} 会话`

  return candidate.replace(/\s+/g, ' ').trim().slice(0, 48) || `${input.provider} 会话`
}

export class AiBridgeService {
  private readonly sessions = new Map<string, RunningSession>()
  private readonly runners: AiBridgeRunners

  constructor(
    private readonly getWindow: () => BrowserWindow | null,
    private readonly historyService: AiChatHistoryService,
    runners?: Partial<AiBridgeRunners>
  ) {
    this.runners = {
      codex: runners?.codex ?? this.runCodexStream.bind(this),
      claudeCode: runners?.claudeCode ?? this.runClaudeCodeStream.bind(this)
    }
  }

  async startChat(input: AiStartChatInput): Promise<AiStartChatResult> {
    const sessionId = randomUUID()
    const abortController = new AbortController()
    this.sessions.set(sessionId, { abortController, cancelled: false })

    await this.historyService.createSession({
      id: sessionId,
      provider: input.provider,
      title: deriveTitle(input),
      workingDirectory: input.workingDirectory,
      messages: input.messages
    })
    await this.emitAndPersist({ type: 'start', sessionId, provider: input.provider })

    void this.runChat(sessionId, input, abortController.signal)

    return { sessionId }
  }

  async cancelChat(sessionId: string): Promise<{ ok: boolean }> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return { ok: false }
    }

    session.cancelled = true
    session.abortController.abort()
    this.sessions.delete(sessionId)
    await this.historyService.finishSession(sessionId, 'cancelled')
    this.emit({ type: 'done', sessionId })
    return { ok: true }
  }

  private async runChat(
    sessionId: string,
    input: AiStartChatInput,
    abortSignal: AbortSignal
  ): Promise<void> {
    try {
      const runner = input.provider === 'claude-code' ? this.runners.claudeCode : this.runners.codex
      await runner({
        sessionId,
        input,
        abortSignal,
        emit: (event) => this.emitAndPersist(event)
      })

      if (!this.sessions.get(sessionId)?.cancelled) {
        await this.historyService.finishSession(sessionId, 'done')
        this.emit({ type: 'done', sessionId })
      }
    } catch (error) {
      if (abortSignal.aborted || this.sessions.get(sessionId)?.cancelled) {
        return
      }

      const message = error instanceof Error ? error.message : String(error)
      await this.historyService.finishSession(sessionId, 'error', message)
      this.emit({
        type: 'error',
        sessionId,
        message
      })
    } finally {
      this.sessions.delete(sessionId)
    }
  }

  private async runCodexStream(context: RunnerContext): Promise<void> {
    const { Codex } = await import('@openai/codex-sdk')
    const codex = new Codex()
    const thread = codex.startThread({
      workingDirectory: context.input.workingDirectory,
      approvalPolicy: 'never',
      sandboxMode: 'workspace-write'
    })
    const stream = await thread.runStreamed(buildPrompt(context.input.messages), {
      signal: context.abortSignal
    })

    for await (const rawEvent of stream.events) {
      if (context.abortSignal.aborted) break
      await this.emitCodexEvent(context.sessionId, rawEvent, context.emit)
    }
  }

  private async runClaudeCodeStream(context: RunnerContext): Promise<void> {
    const { query } = await import('@anthropic-ai/claude-agent-sdk')
    const abortController = new AbortController()
    context.abortSignal.addEventListener('abort', () => abortController.abort(), { once: true })
    const stream = query({
      prompt: buildPrompt(context.input.messages),
      options: {
        cwd: context.input.workingDirectory,
        abortController
      }
    })

    for await (const rawMessage of stream) {
      if (context.abortSignal.aborted) break
      await this.emitClaudeEvent(context.sessionId, rawMessage, context.emit)
    }
  }

  private async emitCodexEvent(
    sessionId: string,
    rawEvent: unknown,
    emit: (event: AiStreamEvent) => Promise<void>
  ): Promise<void> {
    const event = rawEvent as Record<string, unknown>
    const text = this.pickText(event)
    if (text) {
      await emit({ type: 'delta', sessionId, text })
      return
    }

    const type = typeof event.type === 'string' ? event.type : 'codex-event'
    await emit({ type: 'tool', sessionId, name: type, status: 'done' })
  }

  private async emitClaudeEvent(
    sessionId: string,
    rawMessage: unknown,
    emit: (event: AiStreamEvent) => Promise<void>
  ): Promise<void> {
    const message = rawMessage as Record<string, unknown>
    if (message.type === 'stream_event') {
      const event = message.event as Record<string, unknown> | undefined
      const delta = event?.delta as Record<string, unknown> | undefined
      if (event?.type === 'content_block_delta' && delta?.type === 'text_delta') {
        await emit({ type: 'delta', sessionId, text: String(delta.text ?? '') })
        return
      }
      if (event?.type === 'content_block_delta' && delta?.type === 'thinking_delta') {
        await emit({ type: 'thinking', sessionId, text: String(delta.thinking ?? '') })
        return
      }
    }

    if (message.type === 'result' && typeof message.result === 'string') {
      await emit({ type: 'delta', sessionId, text: message.result })
      return
    }

    const text = this.pickText(message)
    if (text) {
      await emit({ type: 'delta', sessionId, text })
      return
    }

    const type = typeof message.type === 'string' ? message.type : 'claude-event'
    await emit({ type: 'tool', sessionId, name: type, status: 'done' })
  }

  private pickText(payload: Record<string, unknown>): string {
    const candidates = [payload.delta, payload.text, payload.content, payload.message]

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate
      }
      if (Array.isArray(candidate)) {
        const text = candidate
          .map((item) => {
            if (typeof item === 'string') return item
            if (item && typeof item === 'object' && 'text' in item) {
              return String((item as { text?: unknown }).text ?? '')
            }
            return ''
          })
          .join('')
        if (text.trim()) return text
      }
    }

    return ''
  }

  private async emitAndPersist(event: AiStreamEvent): Promise<void> {
    if (event.type === 'delta' || event.type === 'thinking') {
      await this.historyService.appendOutput(event.sessionId, event.text)
    }
    this.emit(event)
  }

  private emit(event: AiStreamEvent): void {
    this.getWindow()?.webContents.send('ai:stream-event', event)
  }
}
