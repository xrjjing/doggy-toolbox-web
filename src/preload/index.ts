import { contextBridge, ipcRenderer } from 'electron'
import type {
  AiProviderKind,
  AppAppearance,
  AiSettingsSaveInput,
  AiSdkRuntimeOperationResult,
  AiSdkRuntimeState,
  AiSettingsState,
  AiStreamEvent,
  AiStartChatInput,
  AiChatHistoryState,
  AiChatSessionRecord,
  BackupExportInput,
  BackupImportInput,
  BridgeApi,
  CommandImportInput,
  CommandImportResult,
  CommandMoveInput,
  CommandReorderInput,
  CommandSaveInput,
  CommandTabSaveInput,
  CredentialImportInput,
  CredentialImportResult,
  CredentialSaveInput,
  HttpBatchExecuteInput,
  HttpClearHistoryInput,
  HttpCollectionSaveInput,
  HttpEnvironmentSaveInput,
  HttpExecuteRequestInput,
  HttpRequestSaveInput,
  LegacyImportInput,
  NodeSaveInput,
  NodeConversionResult,
  NodeSubscriptionFetchResult,
  NodeValidationResult,
  PromptExportDocument,
  PromptExportInput,
  PromptImportInput,
  PromptImportResult,
  PromptCategorySaveInput,
  PromptSaveAsTemplateInput,
  PromptTemplateReorderInput,
  PromptTemplateSaveInput,
  PromptTemplateUseInput
} from '../shared/ipc-contract'

/**
 * preload 是 renderer 能接触到的唯一主进程桥。
 * 这里故意不暴露 `ipcRenderer`，只暴露按 IPC 合约定义的白名单方法。
 */
const api: BridgeApi = {
  getRuntimeInfo: () => ipcRenderer.invoke('runtime:get-info'),
  applyAppearance: (appearance: AppAppearance) =>
    ipcRenderer.invoke('appearance:apply', appearance),
  getAiChatHistoryState: (): Promise<AiChatHistoryState> =>
    ipcRenderer.invoke('ai:get-history-state'),
  getAiChatSession: (sessionId: string): Promise<AiChatSessionRecord | null> =>
    ipcRenderer.invoke('ai:get-session', sessionId),
  getAiSettingsState: (): Promise<AiSettingsState> => ipcRenderer.invoke('ai:get-settings-state'),
  saveAiSettings: (input: AiSettingsSaveInput): Promise<AiSettingsState> =>
    ipcRenderer.invoke('ai:save-settings', input),
  getAiSdkRuntimeState: (): Promise<AiSdkRuntimeState> =>
    ipcRenderer.invoke('ai-sdk-runtime:get-state'),
  installAiSdkRuntime: (provider: AiProviderKind): Promise<AiSdkRuntimeOperationResult> =>
    ipcRenderer.invoke('ai-sdk-runtime:install', provider),
  updateAiSdkRuntime: (provider: AiProviderKind): Promise<AiSdkRuntimeOperationResult> =>
    ipcRenderer.invoke('ai-sdk-runtime:update', provider),
  uninstallAiSdkRuntime: (provider: AiProviderKind): Promise<AiSdkRuntimeOperationResult> =>
    ipcRenderer.invoke('ai-sdk-runtime:uninstall', provider),
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
  importCommands: (input: CommandImportInput): Promise<CommandImportResult> =>
    ipcRenderer.invoke('commands:import', input),
  reorderCommandTabs: (tabIds: string[]) => ipcRenderer.invoke('commands:reorder-tabs', tabIds),
  moveCommandToTab: (input: CommandMoveInput) => ipcRenderer.invoke('commands:move', input),
  reorderCommands: (input: CommandReorderInput) => ipcRenderer.invoke('commands:reorder', input),
  deleteCommand: (commandId: string) => ipcRenderer.invoke('commands:delete-command', commandId),
  getCredentialsState: () => ipcRenderer.invoke('credentials:get-state'),
  saveCredential: (input: CredentialSaveInput) => ipcRenderer.invoke('credentials:save', input),
  importCredentials: (input: CredentialImportInput): Promise<CredentialImportResult> =>
    ipcRenderer.invoke('credentials:import', input),
  reorderCredentials: (credentialIds: string[]) =>
    ipcRenderer.invoke('credentials:reorder', credentialIds),
  deleteCredential: (credentialId: string) =>
    ipcRenderer.invoke('credentials:delete', credentialId),
  getNodesState: () => ipcRenderer.invoke('nodes:get-state'),
  saveNode: (input: NodeSaveInput) => ipcRenderer.invoke('nodes:save', input),
  deleteNode: (nodeId: string) => ipcRenderer.invoke('nodes:delete', nodeId),
  convertNodeText: (input: string): Promise<NodeConversionResult> =>
    ipcRenderer.invoke('nodes:convert-text', input),
  fetchNodeSubscription: (input: string): Promise<NodeSubscriptionFetchResult> =>
    ipcRenderer.invoke('nodes:fetch-subscription', input),
  validateConvertedNodes: (input: string): Promise<NodeValidationResult[]> =>
    ipcRenderer.invoke('nodes:validate-converted', input),
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
  reorderPromptCategories: (categoryIds: string[]) =>
    ipcRenderer.invoke('prompts:reorder-categories', categoryIds),
  deletePromptCategory: (categoryId: string) =>
    ipcRenderer.invoke('prompts:delete-category', categoryId),
  savePromptTemplate: (input: PromptTemplateSaveInput) =>
    ipcRenderer.invoke('prompts:save-template', input),
  savePromptAsTemplate: (input: PromptSaveAsTemplateInput) =>
    ipcRenderer.invoke('prompts:save-as-template', input),
  reorderPromptTemplates: (input: PromptTemplateReorderInput) =>
    ipcRenderer.invoke('prompts:reorder-templates', input),
  deletePromptTemplate: (templateId: string) =>
    ipcRenderer.invoke('prompts:delete-template', templateId),
  togglePromptFavorite: (templateId: string) =>
    ipcRenderer.invoke('prompts:toggle-favorite', templateId),
  usePromptTemplate: (input: PromptTemplateUseInput) =>
    ipcRenderer.invoke('prompts:use-template', input),
  parsePromptVariables: (content: string) => ipcRenderer.invoke('prompts:parse-variables', content),
  exportPromptTemplates: (input?: PromptExportInput): Promise<PromptExportDocument> =>
    ipcRenderer.invoke('prompts:export', input),
  importPromptTemplates: (input: PromptImportInput): Promise<PromptImportResult> =>
    ipcRenderer.invoke('prompts:import', input),
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
