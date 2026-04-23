import { contextBridge, ipcRenderer } from 'electron'
import type {
  AiSettingsSaveInput,
  AiSettingsState,
  AiStreamEvent,
  AiStartChatInput,
  AiChatHistoryState,
  AiChatSessionRecord,
  BackupExportInput,
  BackupImportInput,
  BridgeApi,
  CommandSaveInput,
  CommandTabSaveInput,
  CredentialSaveInput,
  HttpBatchExecuteInput,
  HttpClearHistoryInput,
  HttpCollectionSaveInput,
  HttpEnvironmentSaveInput,
  HttpExecuteRequestInput,
  HttpRequestSaveInput,
  LegacyImportInput,
  NodeSaveInput,
  PromptCategorySaveInput,
  PromptTemplateSaveInput,
  PromptTemplateUseInput
} from '../shared/ipc-contract'

/**
 * preload 是 renderer 能接触到的唯一主进程桥。
 * 这里故意不暴露 `ipcRenderer`，只暴露按 IPC 合约定义的白名单方法。
 */
const api: BridgeApi = {
  getRuntimeInfo: () => ipcRenderer.invoke('runtime:get-info'),
  getAiChatHistoryState: (): Promise<AiChatHistoryState> =>
    ipcRenderer.invoke('ai:get-history-state'),
  getAiChatSession: (sessionId: string): Promise<AiChatSessionRecord | null> =>
    ipcRenderer.invoke('ai:get-session', sessionId),
  getAiSettingsState: (): Promise<AiSettingsState> => ipcRenderer.invoke('ai:get-settings-state'),
  saveAiSettings: (input: AiSettingsSaveInput): Promise<AiSettingsState> =>
    ipcRenderer.invoke('ai:save-settings', input),
  aiStartChat: (input: AiStartChatInput) => ipcRenderer.invoke('ai:start-chat', input),
  aiCancelChat: (sessionId: string) => ipcRenderer.invoke('ai:cancel-chat', sessionId),
  onAiStreamEvent: (handler: (event: AiStreamEvent) => void) => {
    // 返回解绑函数，避免页面重复挂载后叠加监听器。
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
  getNodesState: () => ipcRenderer.invoke('nodes:get-state'),
  saveNode: (input: NodeSaveInput) => ipcRenderer.invoke('nodes:save', input),
  deleteNode: (nodeId: string) => ipcRenderer.invoke('nodes:delete', nodeId),
  getHttpCollectionsState: () => ipcRenderer.invoke('http-collections:get-state'),
  saveHttpCollection: (input: HttpCollectionSaveInput) =>
    ipcRenderer.invoke('http-collections:save-collection', input),
  saveHttpRequest: (input: HttpRequestSaveInput) =>
    ipcRenderer.invoke('http-collections:save-request', input),
  deleteHttpRequest: (requestId: string) =>
    ipcRenderer.invoke('http-collections:delete-request', requestId),
  saveHttpEnvironment: (input: HttpEnvironmentSaveInput) =>
    ipcRenderer.invoke('http-collections:save-environment', input),
  deleteHttpEnvironment: (environmentId: string) =>
    ipcRenderer.invoke('http-collections:delete-environment', environmentId),
  executeHttpRequest: (input: HttpExecuteRequestInput) =>
    ipcRenderer.invoke('http-collections:execute-request', input),
  executeHttpBatch: (input: HttpBatchExecuteInput) =>
    ipcRenderer.invoke('http-collections:execute-batch', input),
  clearHttpHistory: (input?: HttpClearHistoryInput) =>
    ipcRenderer.invoke('http-collections:clear-history', input),
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
  importBackup: (input: BackupImportInput) => ipcRenderer.invoke('backup:import', input),
  analyzeLegacyImport: (json: string) => ipcRenderer.invoke('legacy:analyze-import', json),
  importLegacyData: (input: LegacyImportInput) => ipcRenderer.invoke('legacy:import', input)
}

/**
 * `window.doggy` 是 renderer 固定入口。
 * `contextIsolation` 开启后，页面层只能通过这里访问主进程能力，安全边界比较清晰。
 */
contextBridge.exposeInMainWorld('doggy', api)
