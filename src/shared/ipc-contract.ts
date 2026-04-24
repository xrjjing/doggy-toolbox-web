/**
 * 共享 IPC 合约。
 * Main / Preload / Renderer 三层都以这里作为唯一可信的数据协议来源。
 */

/**
 * 运行时总览页使用的顶层结构。
 * 只暴露“可见事实”，不包含任何敏感 token 内容。
 */
export type RuntimeInfo = {
  appName: string
  appVersion: string
  platform: NodeJS.Platform
  dataDir: string
  codex: LocalRuntimeStatus
  claude: LocalRuntimeStatus
  aiSdkRuntime: AiSdkRuntimeState
}

export type LocalRuntimeFileState = {
  label: string
  path: string
  exists: boolean
}

export type LocalRuntimeFact = {
  label: string
  value: string
}

export type LocalRuntimeProbe = {
  status: 'success' | 'failed' | 'skipped'
  checkedAt: string
  message: string
  error?: string
}

export type LocalRuntimeStatus = {
  available: boolean
  checkedAt: string
  details: string
  configPath?: string
  authPath?: string
  files: LocalRuntimeFileState[]
  facts: LocalRuntimeFact[]
  configDetected: boolean
  runtimeInstalled: boolean
  runtimeInstallPath?: string
  runtimeVersion?: string
  runtimePackageManager?: AiSdkRuntimeStatus['packageManager']
  runtimeLastError?: string
  probe: LocalRuntimeProbe
}

export type AppThemeId =
  | 'light'
  | 'cute'
  | 'office'
  | 'neon-light'
  | 'cyberpunk-light'
  | 'dark'
  | 'neon'
  | 'cyberpunk'
  | 'void'

export type TitlebarMode = 'fixed' | 'minimal'

export type AppAppearance = {
  theme: AppThemeId
  glassMode: boolean
  glassOpacity: number
  uiScale: number
  titlebarMode: TitlebarMode
}

/**
 * provider 是业务层概念；transport 是底层 SDK 适配层概念。
 * 分开建模后，UI 能同时展示“选了谁”和“底层如何跑起来的”。
 */
export type AiProviderKind = 'codex' | 'claude-code'

export type AiTransportKind = 'codex-sdk' | 'claude-agent-sdk'

/**
 * AI SDK 不再作为主应用常驻依赖，而是按 provider 安装到用户数据目录。
 * 这里的状态只描述“运行时包”本身，不包含 ~/.codex / ~/.claude.json 这类账号配置。
 */
export type AiSdkRuntimeStatus = {
  provider: AiProviderKind
  label: string
  packageName: string
  desiredVersion: string
  installPath: string
  installed: boolean
  installedVersion?: string
  packageManager?: 'bundled-pnpm' | 'pnpm' | 'corepack-pnpm' | 'npm' | 'unavailable'
  sizeBytes?: number
  updatedAt?: string
  lastError?: string
}

export type AiSdkRuntimeState = {
  checkedAt: string
  runtimes: Record<AiProviderKind, AiSdkRuntimeStatus>
}

export type AiSdkRuntimeOperationResult = {
  ok: boolean
  status: AiSdkRuntimeStatus
  command?: string
  stdout?: string
  stderr?: string
}

export type AiSessionPhase =
  | 'idle'
  | 'starting'
  | 'streaming'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type AiChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type AiStartChatInput = {
  provider: AiProviderKind
  messages: AiChatMessage[]
  workingDirectory?: string
  title?: string
}

/**
 * AI 设置里的模块开关使用固定 id，避免 renderer/main 各自维护不同命名。
 * 这些 id 同时服务于：
 * 1. 设置页的开关列表。
 * 2. 各模块发起 AI 会话时的权限判断。
 * 3. 后续文档里对“哪个页面已经接入 AI”的统一口径。
 */
export type AiFeatureModuleId = 'ai-chat' | 'tools' | 'http' | 'commands' | 'prompts' | 'nodes'

export type AiFeatureSettings = Record<AiFeatureModuleId, boolean>

/**
 * 新仓的 AI 设置只保留真正仍有价值的本机 SDK 配置：
 * - 默认工作目录
 * - 默认系统提示
 * - 全局开关
 * - 各模块 AI 入口开关
 *
 * 不再复刻旧项目那套第三方 HTTPS provider CRUD。
 */
export type AiSettings = {
  workingDirectory: string
  systemPrompt: string
  globalEnabled: boolean
  features: AiFeatureSettings
}

export type AiSettingsSaveInput = Partial<AiSettings> & {
  features?: Partial<AiFeatureSettings>
}

export type AiSettingsState = {
  storageFile: string
  updatedAt: string
  settings: AiSettings
}

/**
 * 运行时快照会被 start 事件和历史记录持久化，
 * 用来描述这次会话到底使用了什么本机环境。
 */
export type AiSessionRuntime = {
  transport: AiTransportKind
  workingDirectory: string
  model?: string
  baseUrl?: string
  configPath?: string
  authPath?: string
  serviceTier?: string
  approvalPolicy?: string
  sandboxMode?: string
  providerSessionId?: string
}

export type AiUsageSummary = {
  inputTokens?: number
  outputTokens?: number
  totalCostUsd?: number
}

export type AiToolCallSummary = {
  id: string
  name: string
  status: 'start' | 'done' | 'error'
  text?: string
}

/**
 * 统一 AI 流事件协议。
 * 各 provider 必须在主进程 bridge 层适配成这套 union，renderer 只消费这一种形状。
 */
export type AiStreamEvent =
  | {
      type: 'start'
      sessionId: string
      provider: AiProviderKind
      runtime: AiSessionRuntime
    }
  | {
      type: 'status'
      sessionId: string
      phase: Exclude<AiSessionPhase, 'idle'>
      message: string
    }
  | {
      type: 'delta'
      sessionId: string
      text: string
    }
  | {
      type: 'thinking'
      sessionId: string
      text: string
    }
  | {
      type: 'tool'
      sessionId: string
      toolId: string
      name: string
      status: 'start' | 'done' | 'error'
      text?: string
    }
  | {
      type: 'usage'
      sessionId: string
      inputTokens?: number
      outputTokens?: number
      totalCostUsd?: number
    }
  | {
      type: 'session-ref'
      sessionId: string
      providerSessionId: string
    }
  | {
      type: 'done'
      sessionId: string
    }
  | {
      type: 'error'
      sessionId: string
      message: string
    }

export type AiStartChatResult = {
  sessionId: string
}

export type AiChatSessionSummary = {
  id: string
  provider: AiProviderKind
  title: string
  preview: string
  status: 'running' | 'done' | 'error' | 'cancelled'
  phase: AiSessionPhase
  createdAt: string
  updatedAt: string
}

export type AiChatSessionRecord = {
  id: string
  provider: AiProviderKind
  title: string
  workingDirectory: string
  status: 'running' | 'done' | 'error' | 'cancelled'
  phase: AiSessionPhase
  createdAt: string
  updatedAt: string
  messages: AiChatMessage[]
  output: string
  thinking: string
  tools: AiToolCallSummary[]
  runtime?: AiSessionRuntime
  usage?: AiUsageSummary
  errorMessage?: string
}

/**
 * 历史列表只返回摘要；真正的大字段通过 sessionId 再单独读取详情。
 */
export type AiChatHistoryState = {
  storageFile: string
  updatedAt: string
  sessions: AiChatSessionSummary[]
}

export type CommandTab = {
  id: string
  name: string
  order: number
  createdAt: string
  updatedAt: string
}

export type CommandRecord = {
  id: string
  title: string
  description: string
  lines: string[]
  tabId: string
  tags: string[]
  order: number
  createdAt: string
  updatedAt: string
}

export type CommandTabSaveInput = {
  id?: string
  name: string
}

export type CommandSaveInput = {
  id?: string
  title: string
  description?: string
  lines: string[]
  tabId?: string
  tags?: string[]
}

export type CommandMoveInput = {
  commandId: string
  targetTabId: string
}

export type CommandReorderInput = {
  tabId: string
  commandIds: string[]
}

export type ImportedCommandBlock = {
  title: string
  description: string
  lines: string[]
  tabId: string
  tags: string[]
}

export type CommandImportInput = {
  text: string
  tabId?: string
}

export type CommandImportResult = {
  imported: number
  blocks: ImportedCommandBlock[]
}

export type CommandModuleState = {
  storageFile: string
  defaultTabId: string
  updatedAt: string
  tabs: CommandTab[]
  commands: CommandRecord[]
}

/**
 * 对 renderer 暴露的是可展示的明文视图；
 * 真正的密文落盘结构只存在于主进程 service 内部。
 */
export type CredentialRecord = {
  id: string
  service: string
  url: string
  account: string
  password: string
  extra: string[]
  order: number
  createdAt: string
  updatedAt: string
}

export type CredentialSaveInput = {
  id?: string
  service: string
  url?: string
  account?: string
  password?: string
  extra?: string[]
}

export type CredentialImportInput = {
  text: string
}

export type CredentialImportResult = {
  imported: number
  credentials: Array<Pick<CredentialRecord, 'service' | 'url' | 'account' | 'password' | 'extra'>>
}

export type CredentialModuleState = {
  storageFile: string
  updatedAt: string
  secretEncoding: 'plain' | 'electron-safe-storage'
  credentials: CredentialRecord[]
}

export type PromptVariable = {
  name: string
  type: 'text' | 'select'
  defaultValue: string
  options: string[]
}

export type PromptCategory = {
  id: string
  name: string
  icon: string
  order: number
  createdAt: string
  updatedAt: string
}

export type PromptTemplate = {
  id: string
  title: string
  content: string
  categoryId: string
  description: string
  tags: string[]
  variables: PromptVariable[]
  isFavorite: boolean
  isSystem: boolean
  usageCount: number
  order: number
  createdAt: string
  updatedAt: string
}

export type PromptCategorySaveInput = {
  id?: string
  name: string
  icon?: string
}

export type PromptTemplateSaveInput = {
  id?: string
  title: string
  content: string
  categoryId?: string
  description?: string
  tags?: string[]
}

export type PromptTemplateUseInput = {
  templateId: string
  values?: Record<string, string>
}

export type PromptTemplateUseResult = {
  content: string
  template: PromptTemplate
}

export type PromptTemplateReorderInput = {
  categoryId?: string
  templateIds: string[]
}

export type PromptSaveAsTemplateInput = {
  content: string
  title?: string
  categoryId?: string
  description?: string
  tags?: string[]
}

export type PromptExportCategory = {
  id: string
  name: string
  icon: string
}

export type PromptExportTemplate = {
  title: string
  content: string
  description: string
  tags: string[]
  category_id?: string
}

export type PromptExportInput = {
  templateIds?: string[]
  includeCategories?: boolean
}

export type PromptExportDocument = {
  version: '1.0'
  export_time: string
  categories?: PromptExportCategory[]
  templates: PromptExportTemplate[]
}

export type PromptImportInput = {
  json: string
  overwrite?: boolean
}

export type PromptImportResult = {
  imported: number
  skipped: number
  errors: string[]
}

export type PromptModuleState = {
  storageFile: string
  updatedAt: string
  categories: PromptCategory[]
  templates: PromptTemplate[]
}

export type NodeRecord = {
  id: string
  name: string
  type: string
  server: string
  port: number
  rawLink: string
  configText: string
  tags: string[]
  order: number
  createdAt: string
  updatedAt: string
}

export type NodeSaveInput = {
  id?: string
  name: string
  type: string
  server: string
  port: number
  rawLink?: string
  configText?: string
  tags?: string[]
}

export type NodeModuleState = {
  storageFile: string
  updatedAt: string
  nodes: NodeRecord[]
}

export type NodeConversionRecord = {
  name: string
  type: string
  server: string
  port: number
  rawLink: string
  configText: string
  tags: string[]
}

export type NodeConversionResult = {
  nodes: NodeConversionRecord[]
  yaml: string
  json: string
  errors: string[]
}

export type NodeValidationResult = {
  name: string
  type: string
  valid: boolean
  errors: string[]
  warnings: string[]
}

export type NodeSubscriptionFetchResult = NodeConversionResult & {
  sourceText: string
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

export type HttpKeyValue = {
  id: string
  key: string
  value: string
  enabled: boolean
  description: string
}

export type HttpBody = {
  type: 'none' | 'json' | 'text' | 'form'
  content: string
}

export type HttpAuth = {
  type: 'none' | 'bearer' | 'basic'
  token: string
  username: string
  password: string
}

export type HttpCollection = {
  id: string
  name: string
  description: string
  order: number
  createdAt: string
  updatedAt: string
}

export type HttpRequestRecord = {
  id: string
  collectionId: string
  name: string
  method: HttpMethod
  url: string
  description: string
  headers: HttpKeyValue[]
  params: HttpKeyValue[]
  body: HttpBody
  auth: HttpAuth
  tags: string[]
  order: number
  createdAt: string
  updatedAt: string
}

export type HttpEnvironmentVariable = HttpKeyValue

export type HttpEnvironment = {
  id: string
  name: string
  variables: HttpEnvironmentVariable[]
  order: number
  createdAt: string
  updatedAt: string
}

export type HttpCollectionSaveInput = {
  id?: string
  name: string
  description?: string
}

export type HttpRequestSaveInput = {
  id?: string
  collectionId?: string
  name: string
  method?: HttpMethod
  url?: string
  description?: string
  headers?: Array<Partial<HttpKeyValue>>
  params?: Array<Partial<HttpKeyValue>>
  body?: Partial<HttpBody>
  auth?: Partial<HttpAuth>
  tags?: string[]
}

export type HttpEnvironmentSaveInput = {
  id?: string
  name: string
  variables?: Array<Partial<HttpEnvironmentVariable>>
}

export type HttpCollectionModuleState = {
  storageFile: string
  defaultCollectionId: string
  updatedAt: string
  collections: HttpCollection[]
  requests: HttpRequestRecord[]
  environments: HttpEnvironment[]
  history: HttpExecutionHistoryRecord[]
}

/**
 * `HttpResolvedRequest` 是真正即将发出的请求快照。
 * 它保留 unresolvedVariables，方便 UI 提示哪些占位符没有成功替换。
 */
export type HttpResolvedRequest = {
  requestId: string
  environmentId?: string
  method: HttpMethod
  url: string
  headers: Array<Pick<HttpKeyValue, 'key' | 'value'>>
  bodyType: HttpBody['type']
  body: string
  unresolvedVariables: string[]
}

export type HttpExecuteRequestInput = {
  requestId: string
  environmentId?: string
  timeoutMs?: number
}

export type HttpResponseHeader = {
  key: string
  value: string
}

export type HttpExecuteRequestResult = {
  requestId: string
  environmentId?: string
  executedAt: string
  durationMs: number
  ok: boolean
  status: number
  statusText: string
  headers: HttpResponseHeader[]
  body: string
  bodySizeBytes: number
  resolvedRequest: HttpResolvedRequest
  errorMessage?: string
}

export type HttpExecutionHistoryRecord = {
  id: string
  requestId: string
  requestName: string
  environmentId?: string
  environmentName?: string
  method: HttpMethod
  url: string
  executedAt: string
  durationMs: number
  ok: boolean
  status: number
  statusText: string
  responseHeaders: HttpResponseHeader[]
  responseBody: string
  responseBodySizeBytes: number
  responseBodyTruncated: boolean
  resolvedRequest: HttpResolvedRequest
  errorMessage?: string
}

export type HttpClearHistoryInput = {
  requestId?: string
}

export type HttpBatchExecuteInput = {
  collectionId?: string
  requestIds?: string[]
  environmentId?: string
  timeoutMs?: number
}

export type HttpBatchExecuteSummary = {
  total: number
  succeeded: number
  failed: number
  durationMs: number
}

export type HttpBatchExecuteResult = {
  collectionId?: string
  environmentId?: string
  executedAt: string
  summary: HttpBatchExecuteSummary
  results: HttpExecuteRequestResult[]
}

/**
 * 统一备份协议只面向模块级数据，不直接暴露底层存储文件结构。
 */
export type BackupSectionKey =
  | 'commands'
  | 'credentials'
  | 'prompts'
  | 'nodes'
  | 'httpCollections'
  | 'aiSettings'

export type BackupSummary = {
  commands: number
  commandTabs: number
  credentials: number
  promptCategories: number
  promptTemplates: number
  nodes: number
  httpCollections: number
  httpRequests: number
  httpEnvironments: number
  httpHistoryRecords: number
  aiSettings: number
}

export type BackupDocument = {
  version: '1.0'
  app: 'doggy-toolbox-web'
  exportedAt: string
  sections: BackupSectionKey[]
  summary: BackupSummary
  data: {
    commands?: Pick<CommandModuleState, 'tabs' | 'commands'>
    credentials?: Pick<CredentialModuleState, 'credentials'>
    prompts?: Pick<PromptModuleState, 'categories' | 'templates'>
    nodes?: Pick<NodeModuleState, 'nodes'>
    httpCollections?: Pick<
      HttpCollectionModuleState,
      'collections' | 'requests' | 'environments' | 'history'
    >
    aiSettings?: Pick<AiSettingsState, 'settings'>
  }
}

export type BackupExportInput = {
  sections?: BackupSectionKey[]
}

export type BackupImportInput = {
  json: string
  sections?: BackupSectionKey[]
}

export type BackupImportResult = {
  importedAt: string
  sections: BackupSectionKey[]
  summary: BackupSummary
}

export type LegacyImportSourceKind = 'doggy-toolbox-backup' | 'doggy-toolbox-prompt-export'

export type LegacyImportAnalysis = {
  sourceKind: LegacyImportSourceKind
  sourceLabel: string
  availableSections: BackupSectionKey[]
  summary: BackupSummary
  warnings: string[]
}

export type LegacyImportInput = {
  json: string
  sections?: BackupSectionKey[]
}

export type LegacyImportResult = {
  importedAt: string
  sourceKind: LegacyImportSourceKind
  sections: BackupSectionKey[]
  summary: BackupSummary
  warnings: string[]
}

/**
 * preload 暴露给 renderer 的完整白名单 API。
 * 页面层只能依赖这里声明的方法，不能自行构造任意 IPC channel。
 */
export type BridgeApi = {
  getRuntimeInfo: () => Promise<RuntimeInfo>
  applyAppearance: (appearance: AppAppearance) => Promise<{ ok: boolean }>
  getAiChatHistoryState: () => Promise<AiChatHistoryState>
  getAiChatSession: (sessionId: string) => Promise<AiChatSessionRecord | null>
  getAiSettingsState: () => Promise<AiSettingsState>
  saveAiSettings: (input: AiSettingsSaveInput) => Promise<AiSettingsState>
  getAiSdkRuntimeState: () => Promise<AiSdkRuntimeState>
  installAiSdkRuntime: (provider: AiProviderKind) => Promise<AiSdkRuntimeOperationResult>
  updateAiSdkRuntime: (provider: AiProviderKind) => Promise<AiSdkRuntimeOperationResult>
  uninstallAiSdkRuntime: (provider: AiProviderKind) => Promise<AiSdkRuntimeOperationResult>
  aiStartChat: (input: AiStartChatInput) => Promise<AiStartChatResult>
  aiCancelChat: (sessionId: string) => Promise<{ ok: boolean }>
  onAiStreamEvent: (handler: (event: AiStreamEvent) => void) => () => void
  getCommandsState: () => Promise<CommandModuleState>
  saveCommandTab: (input: CommandTabSaveInput) => Promise<CommandTab>
  saveCommand: (input: CommandSaveInput) => Promise<CommandRecord>
  importCommands: (input: CommandImportInput) => Promise<CommandImportResult>
  reorderCommandTabs: (tabIds: string[]) => Promise<{ ok: boolean }>
  moveCommandToTab: (input: CommandMoveInput) => Promise<CommandRecord>
  reorderCommands: (input: CommandReorderInput) => Promise<{ ok: boolean }>
  deleteCommand: (commandId: string) => Promise<{ ok: boolean }>
  getCredentialsState: () => Promise<CredentialModuleState>
  saveCredential: (input: CredentialSaveInput) => Promise<CredentialRecord>
  importCredentials: (input: CredentialImportInput) => Promise<CredentialImportResult>
  reorderCredentials: (credentialIds: string[]) => Promise<{ ok: boolean }>
  deleteCredential: (credentialId: string) => Promise<{ ok: boolean }>
  getNodesState: () => Promise<NodeModuleState>
  saveNode: (input: NodeSaveInput) => Promise<NodeRecord>
  deleteNode: (nodeId: string) => Promise<{ ok: boolean }>
  convertNodeText: (input: string) => Promise<NodeConversionResult>
  fetchNodeSubscription: (input: string) => Promise<NodeSubscriptionFetchResult>
  validateConvertedNodes: (input: string) => Promise<NodeValidationResult[]>
  getHttpCollectionsState: () => Promise<HttpCollectionModuleState>
  saveHttpCollection: (input: HttpCollectionSaveInput) => Promise<HttpCollection>
  saveHttpRequest: (input: HttpRequestSaveInput) => Promise<HttpRequestRecord>
  deleteHttpRequest: (requestId: string) => Promise<{ ok: boolean }>
  saveHttpEnvironment: (input: HttpEnvironmentSaveInput) => Promise<HttpEnvironment>
  deleteHttpEnvironment: (environmentId: string) => Promise<{ ok: boolean }>
  executeHttpRequest: (input: HttpExecuteRequestInput) => Promise<HttpExecuteRequestResult>
  executeHttpBatch: (input: HttpBatchExecuteInput) => Promise<HttpBatchExecuteResult>
  clearHttpHistory: (input?: HttpClearHistoryInput) => Promise<{ ok: boolean; removed: number }>
  getPromptState: () => Promise<PromptModuleState>
  savePromptCategory: (input: PromptCategorySaveInput) => Promise<PromptCategory>
  reorderPromptCategories: (categoryIds: string[]) => Promise<{ ok: boolean }>
  deletePromptCategory: (categoryId: string) => Promise<{ ok: boolean }>
  savePromptTemplate: (input: PromptTemplateSaveInput) => Promise<PromptTemplate>
  savePromptAsTemplate: (input: PromptSaveAsTemplateInput) => Promise<PromptTemplate>
  reorderPromptTemplates: (input: PromptTemplateReorderInput) => Promise<{ ok: boolean }>
  deletePromptTemplate: (templateId: string) => Promise<{ ok: boolean }>
  togglePromptFavorite: (templateId: string) => Promise<{ isFavorite: boolean }>
  usePromptTemplate: (input: PromptTemplateUseInput) => Promise<PromptTemplateUseResult>
  parsePromptVariables: (content: string) => Promise<PromptVariable[]>
  exportPromptTemplates: (input?: PromptExportInput) => Promise<PromptExportDocument>
  importPromptTemplates: (input: PromptImportInput) => Promise<PromptImportResult>
  exportBackup: (input?: BackupExportInput) => Promise<BackupDocument>
  importBackup: (input: BackupImportInput) => Promise<BackupImportResult>
  analyzeLegacyImport: (json: string) => Promise<LegacyImportAnalysis>
  importLegacyData: (input: LegacyImportInput) => Promise<LegacyImportResult>
}
