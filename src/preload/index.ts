import { contextBridge, ipcRenderer } from 'electron'
import type { AiStreamEvent, AiStartChatInput, BridgeApi } from '../shared/ipc-contract'

const api: BridgeApi = {
  getRuntimeInfo: () => ipcRenderer.invoke('runtime:get-info'),
  aiStartChat: (input: AiStartChatInput) => ipcRenderer.invoke('ai:start-chat', input),
  aiCancelChat: (sessionId: string) => ipcRenderer.invoke('ai:cancel-chat', sessionId),
  onAiStreamEvent: (handler: (event: AiStreamEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: AiStreamEvent): void => {
      handler(payload)
    }
    ipcRenderer.on('ai:stream-event', listener)
    return () => ipcRenderer.removeListener('ai:stream-event', listener)
  }
}

contextBridge.exposeInMainWorld('doggy', api)
