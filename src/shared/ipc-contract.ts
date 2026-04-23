export type RuntimeInfo = {
  appName: string
  appVersion: string
  platform: NodeJS.Platform
  dataDir: string
  codex: LocalRuntimeStatus
  claude: LocalRuntimeStatus
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

export type LocalRuntimeStatus = {
  available: boolean
  checkedAt: string
  details: string
  configPath?: string
  authPath?: string
  files: LocalRuntimeFileState[]
  facts: LocalRuntimeFact[]
}

export type AiProviderKind = 'codex' | 'claude-code'

export type AiTransportKind = 'codex-sdk' | 'claude-agent-sdk'

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

export type CommandModuleState = {
  storageFile: string
  defaultTabId: string
  updatedAt: string
  tabs: CommandTab[]
  commands: CommandRecord[]
}

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

export type BackupSectionKey = 'commands' | 'credentials' | 'prompts' | 'nodes' | 'httpCollections'

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

export type BridgeApi = {
  getRuntimeInfo: () => Promise<RuntimeInfo>
  getAiChatHistoryState: () => Promise<AiChatHistoryState>
  getAiChatSession: (sessionId: string) => Promise<AiChatSessionRecord | null>
  aiStartChat: (input: AiStartChatInput) => Promise<AiStartChatResult>
  aiCancelChat: (sessionId: string) => Promise<{ ok: boolean }>
  onAiStreamEvent: (handler: (event: AiStreamEvent) => void) => () => void
  getCommandsState: () => Promise<CommandModuleState>
  saveCommandTab: (input: CommandTabSaveInput) => Promise<CommandTab>
  saveCommand: (input: CommandSaveInput) => Promise<CommandRecord>
  deleteCommand: (commandId: string) => Promise<{ ok: boolean }>
  getCredentialsState: () => Promise<CredentialModuleState>
  saveCredential: (input: CredentialSaveInput) => Promise<CredentialRecord>
  deleteCredential: (credentialId: string) => Promise<{ ok: boolean }>
  getNodesState: () => Promise<NodeModuleState>
  saveNode: (input: NodeSaveInput) => Promise<NodeRecord>
  deleteNode: (nodeId: string) => Promise<{ ok: boolean }>
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
  deletePromptCategory: (categoryId: string) => Promise<{ ok: boolean }>
  savePromptTemplate: (input: PromptTemplateSaveInput) => Promise<PromptTemplate>
  deletePromptTemplate: (templateId: string) => Promise<{ ok: boolean }>
  togglePromptFavorite: (templateId: string) => Promise<{ isFavorite: boolean }>
  usePromptTemplate: (input: PromptTemplateUseInput) => Promise<PromptTemplateUseResult>
  parsePromptVariables: (content: string) => Promise<PromptVariable[]>
  exportBackup: (input?: BackupExportInput) => Promise<BackupDocument>
  importBackup: (input: BackupImportInput) => Promise<BackupImportResult>
  analyzeLegacyImport: (json: string) => Promise<LegacyImportAnalysis>
  importLegacyData: (input: LegacyImportInput) => Promise<LegacyImportResult>
}
