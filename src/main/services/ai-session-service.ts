import { randomUUID } from 'node:crypto'
import type {
  AiStartChatInput,
  AiStartChatResult,
  AiStreamEvent,
  AiSessionRuntime
} from '../../shared/ipc-contract'
import type { AiChatHistoryService } from './ai-chat-history-service'
import type { AiProviderRouter } from './ai-provider-router'

type RunningSession = {
  abortController: AbortController
  cancelled: boolean
}

function deriveTitle(input: AiStartChatInput): string {
  const candidate =
    input.title ||
    input.messages.find((message) => message.role === 'user')?.content ||
    input.messages[0]?.content ||
    `${input.provider} 会话`

  return candidate.replace(/\s+/g, ' ').trim().slice(0, 48) || `${input.provider} 会话`
}

export class AiSessionService {
  private readonly sessions = new Map<string, RunningSession>()

  constructor(
    private readonly historyService: AiChatHistoryService,
    private readonly providerRouter: AiProviderRouter,
    private readonly emit: (event: AiStreamEvent) => void
  ) {}

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

    const runtime = await this.providerRouter.getRuntime(input.provider, input)
    await this.emitAndPersist({
      type: 'start',
      sessionId,
      provider: input.provider,
      runtime
    })
    await this.emitAndPersist({
      type: 'status',
      sessionId,
      phase: 'starting',
      message: '已创建 AI 会话，准备连接本机运行时'
    })

    void this.runChat(sessionId, input, runtime, abortController.signal)

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
    await this.emitAndPersist({
      type: 'status',
      sessionId,
      phase: 'cancelled',
      message: '会话已取消'
    })
    this.emit({ type: 'done', sessionId })
    return { ok: true }
  }

  private async runChat(
    sessionId: string,
    input: AiStartChatInput,
    _runtime: AiSessionRuntime,
    abortSignal: AbortSignal
  ): Promise<void> {
    try {
      await this.providerRouter.run(input.provider, {
        sessionId,
        input,
        abortSignal,
        emit: (event) => this.emitAndPersist(event)
      })

      if (!abortSignal.aborted && !this.sessions.get(sessionId)?.cancelled) {
        await this.historyService.finishSession(sessionId, 'done')
        await this.emitAndPersist({
          type: 'status',
          sessionId,
          phase: 'completed',
          message: 'AI 会话已完成'
        })
        this.emit({ type: 'done', sessionId })
      }
    } catch (error) {
      if (abortSignal.aborted || this.sessions.get(sessionId)?.cancelled) {
        return
      }

      const message = error instanceof Error ? error.message : String(error)
      await this.historyService.finishSession(sessionId, 'error', message)
      await this.emitAndPersist({
        type: 'status',
        sessionId,
        phase: 'failed',
        message
      })
      this.emit({
        type: 'error',
        sessionId,
        message
      })
    } finally {
      this.sessions.delete(sessionId)
    }
  }

  private async emitAndPersist(event: AiStreamEvent): Promise<void> {
    await this.historyService.applyEvent(event)
    this.emit(event)
  }
}
