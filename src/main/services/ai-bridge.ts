import type { BrowserWindow } from 'electron'
import type { AiStartChatInput, AiStartChatResult, AiStreamEvent } from '../../shared/ipc-contract'
import type { AiSessionService } from './ai-session-service'

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
    this.getWindow()?.webContents.send('ai:stream-event', event)
  }
}
