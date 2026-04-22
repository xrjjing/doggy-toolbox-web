import { contextBridge, ipcRenderer } from 'electron'
import type {
  AiStreamEvent,
  AiStartChatInput,
  BackupExportInput,
  BackupImportInput,
  BridgeApi,
  CommandSaveInput,
  CommandTabSaveInput,
  CredentialSaveInput,
  PromptCategorySaveInput,
  PromptTemplateSaveInput,
  PromptTemplateUseInput
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
  deleteCommand: (commandId: string) => ipcRenderer.invoke('commands:delete-command', commandId),
  getCredentialsState: () => ipcRenderer.invoke('credentials:get-state'),
  saveCredential: (input: CredentialSaveInput) => ipcRenderer.invoke('credentials:save', input),
  deleteCredential: (credentialId: string) =>
    ipcRenderer.invoke('credentials:delete', credentialId),
  getPromptState: () => ipcRenderer.invoke('prompts:get-state'),
  savePromptCategory: (input: PromptCategorySaveInput) =>
    ipcRenderer.invoke('prompts:save-category', input),
  deletePromptCategory: (categoryId: string) =>
    ipcRenderer.invoke('prompts:delete-category', categoryId),
  savePromptTemplate: (input: PromptTemplateSaveInput) =>
    ipcRenderer.invoke('prompts:save-template', input),
  deletePromptTemplate: (templateId: string) =>
    ipcRenderer.invoke('prompts:delete-template', templateId),
  togglePromptFavorite: (templateId: string) =>
    ipcRenderer.invoke('prompts:toggle-favorite', templateId),
  usePromptTemplate: (input: PromptTemplateUseInput) =>
    ipcRenderer.invoke('prompts:use-template', input),
  parsePromptVariables: (content: string) => ipcRenderer.invoke('prompts:parse-variables', content),
  exportBackup: (input?: BackupExportInput) => ipcRenderer.invoke('backup:export', input),
  importBackup: (input: BackupImportInput) => ipcRenderer.invoke('backup:import', input)
}

contextBridge.exposeInMainWorld('doggy', api)
