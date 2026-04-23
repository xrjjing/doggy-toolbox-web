import { randomUUID } from 'node:crypto'
import type {
  AiStartChatInput,
  AiStartChatResult,
  AiStreamEvent,
  AiSessionRuntime
} from '../../shared/ipc-contract'
import type { AiChatHistoryService } from './ai-chat-history-service'
import type { AiProviderRouter } from './ai-provider-router'

/**
 * 运行中的会话只保存取消控制柄。
 * 历史内容不放内存 Map，而是实时落盘到历史服务，保证窗口刷新后仍能回看。
 */
type RunningSession = {
  abortController: AbortController
  cancelled: boolean
}

/**
 * 会话标题用于历史列表快速识别。
 * 优先取用户自定义标题，再退化到第一条 user message。
 */
function deriveTitle(input: AiStartChatInput): string {
  const candidate =
    input.title ||
    input.messages.find((message) => message.role === 'user')?.content ||
    input.messages[0]?.content ||
    `${input.provider} 会话`

  return candidate.replace(/\s+/g, ' ').trim().slice(0, 48) || `${input.provider} 会话`
}

/**
 * 会话服务是 AI 生命周期的总编排层。
 * 它位于 IPC bridge 与 provider bridge 之间，负责：
 * 1. 生成 sessionId 和取消控制器。
 * 2. 先写历史骨架，再启动真实运行。
 * 3. 统一收口成功、失败、取消三种结局。
 */
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

    // 先落一条历史骨架，确保 SDK 初始化失败时也能在历史里看到会话记录。
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

    // 真正执行异步放到后台，IPC 立即返回 sessionId 给 renderer 建立流式消费。
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
    // 取消同样要落到历史里，否则刷新后用户无法判断是失败还是主动中止。
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

      // provider 只负责产生流事件，最终会话完成态由这里统一定义。
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
      // 错误统一在这里转成历史记录和事件，避免各 provider 输出风格不一致。
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
    // 先持久化再广播，保证窗口刷新时仍可从历史恢复已发生的流事件。
    await this.historyService.applyEvent(event)
    this.emit(event)
  }
}
