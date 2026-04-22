import { contextBridge, ipcRenderer } from 'electron'
import type {
  AiStreamEvent,
  AiStartChatInput,
  BridgeApi,
  CommandSaveInput,
  CommandTabSaveInput
} from '../shared/ipc-contract'

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
  },
  getCommandsState: () => ipcRenderer.invoke('commands:get-state'),
  saveCommandTab: (input: CommandTabSaveInput) => ipcRenderer.invoke('commands:save-tab', input),
  saveCommand: (input: CommandSaveInput) => ipcRenderer.invoke('commands:save-command', input),
  deleteCommand: (commandId: string) => ipcRenderer.invoke('commands:delete-command', commandId)
}

contextBridge.exposeInMainWorld('doggy', api)
