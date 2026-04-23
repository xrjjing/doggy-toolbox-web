import type { BrowserWindow } from 'electron'
import type { AiStartChatInput, AiStartChatResult, AiStreamEvent } from '../../shared/ipc-contract'
import type { AiSessionService } from './ai-session-service'

/**
 * AI Bridge 负责把主进程内部的 AI 会话能力挂到窗口事件流上。
 * 它只做转发，不承担 provider 选择、历史落盘或 SDK 解析逻辑。
 */
export class AiBridgeService {
  constructor(
    private readonly getWindow: () => BrowserWindow | null,
    private readonly sessionService: AiSessionService
  ) {}

  async startChat(input: AiStartChatInput): Promise<AiStartChatResult> {
    return this.sessionService.startChat(input)
  }

  async cancelChat(sessionId: string): Promise<{ ok: boolean }> {
    return this.sessionService.cancelChat(sessionId)
  }

  emit(event: AiStreamEvent): void {
    // 窗口可能已经关闭，这里按 best-effort 广播，不把 UI 缺席视作业务失败。
    this.getWindow()?.webContents.send('ai:stream-event', event)
  }
}
