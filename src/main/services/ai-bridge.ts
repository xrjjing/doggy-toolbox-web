import type { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import type { AiStartChatInput, AiStartChatResult, AiStreamEvent } from '../../shared/ipc-contract'

type RunningSession = {
  abortController: AbortController
}

export class AiBridgeService {
  private readonly sessions = new Map<string, RunningSession>()

  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  async startChat(input: AiStartChatInput): Promise<AiStartChatResult> {
    const sessionId = randomUUID()
    const abortController = new AbortController()
    this.sessions.set(sessionId, { abortController })
    this.emit({ type: 'start', sessionId, provider: input.provider })

    void this.runChat(sessionId, input, abortController.signal)

    return { sessionId }
  }

  cancelChat(sessionId: string): { ok: boolean } {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return { ok: false }
    }

    session.abortController.abort()
    this.sessions.delete(sessionId)
    this.emit({ type: 'done', sessionId })
    return { ok: true }
  }

  private async runChat(
    sessionId: string,
    input: AiStartChatInput,
    abortSignal: AbortSignal
  ): Promise<void> {
    try {
      if (input.provider === 'claude-code') {
        await this.runClaudeCode(sessionId, input, abortSignal)
      } else {
        await this.runCodex(sessionId, input, abortSignal)
      }

      this.emit({ type: 'done', sessionId })
    } catch (error) {
      this.emit({
        type: 'error',
        sessionId,
        message: error instanceof Error ? error.message : String(error)
      })
    } finally {
      this.sessions.delete(sessionId)
    }
  }

  private async runCodex(
    sessionId: string,
    input: AiStartChatInput,
    abortSignal: AbortSignal
  ): Promise<void> {
    const { Codex } = await import('@openai/codex-sdk')
    const prompt = input.messages
      .map((message) => `${message.role}: ${message.content}`)
      .join('\n\n')
    const codex = new Codex()

    // Codex SDK 负责读取本机 ~/.codex 配置。这里保留统一事件层，避免 UI 绑定 SDK 私有事件。
    const thread = codex.startThread({
      workingDirectory: input.workingDirectory,
      approvalPolicy: 'never',
      sandboxMode: 'workspace-write'
    })
    const stream = await thread.runStreamed(prompt, { signal: abortSignal })

    for await (const event of stream.events) {
      if (abortSignal.aborted) break
      this.emitCodexEvent(sessionId, event)
    }
  }

  private async runClaudeCode(
    sessionId: string,
    input: AiStartChatInput,
    abortSignal: AbortSignal
  ): Promise<void> {
    const { query } = await import('@anthropic-ai/claude-agent-sdk')
    const abortController = new AbortController()
    abortSignal.addEventListener('abort', () => abortController.abort(), { once: true })
    const prompt = input.messages
      .map((message) => `${message.role}: ${message.content}`)
      .join('\n\n')
    const stream = query({
      prompt,
      options: {
        cwd: input.workingDirectory,
        abortController
      }
    })

    for await (const message of stream) {
      if (abortSignal.aborted) break
      this.emitClaudeEvent(sessionId, message)
    }
  }

  private emitCodexEvent(sessionId: string, rawEvent: unknown): void {
    const event = rawEvent as Record<string, unknown>
    const text = this.pickText(event)
    if (text) {
      this.emit({ type: 'delta', sessionId, text })
      return
    }

    const type = typeof event.type === 'string' ? event.type : 'codex-event'
    this.emit({ type: 'tool', sessionId, name: type, status: 'done' })
  }

  private emitClaudeEvent(sessionId: string, rawMessage: unknown): void {
    const message = rawMessage as Record<string, unknown>
    if (message.type === 'stream_event') {
      const event = message.event as Record<string, unknown> | undefined
      const delta = event?.delta as Record<string, unknown> | undefined
      if (event?.type === 'content_block_delta' && delta?.type === 'text_delta') {
        this.emit({ type: 'delta', sessionId, text: String(delta.text ?? '') })
        return
      }
      if (event?.type === 'content_block_delta' && delta?.type === 'thinking_delta') {
        this.emit({ type: 'thinking', sessionId, text: String(delta.thinking ?? '') })
        return
      }
    }

    if (message.type === 'result' && typeof message.result === 'string') {
      this.emit({ type: 'delta', sessionId, text: message.result })
      return
    }

    const text = this.pickText(message)
    if (text) {
      this.emit({ type: 'delta', sessionId, text })
      return
    }

    const type = typeof message.type === 'string' ? message.type : 'claude-event'
    this.emit({ type: 'tool', sessionId, name: type, status: 'done' })
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

  private emit(event: AiStreamEvent): void {
    this.getWindow()?.webContents.send('ai:stream-event', event)
  }
}
