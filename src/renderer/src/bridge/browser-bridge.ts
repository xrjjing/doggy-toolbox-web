import { fillPromptTemplate, parsePromptVariables } from '@shared/prompt-template-core'
import type {
  AiChatHistoryState,
  AiChatSessionRecord,
  AiProviderKind,
  AiSdkRuntimeOperationResult,
  AiSettings,
  AiSettingsSaveInput,
  AiSettingsState,
  AiStartChatInput,
  AiStartChatResult,
  AiStreamEvent,
  AppAppearance,
  BackupDocument,
  BackupExportInput,
  BackupImportInput,
  BackupImportResult,
  BackupSectionKey,
  BackupSummary,
  BridgeApi,
  CommandImportInput,
  CommandImportResult,
  CommandModuleState,
  CommandMoveInput,
  CommandRecord,
  CommandReorderInput,
  CommandSaveInput,
  CommandTab,
  CommandTabSaveInput,
  CredentialImportInput,
  CredentialImportResult,
  CredentialModuleState,
  CredentialRecord,
  CredentialSaveInput,
  HttpBatchExecuteInput,
  HttpBatchExecuteResult,
  HttpCollection,
  HttpCollectionReorderInput,
  HttpCollectionModuleState,
  HttpCollectionSaveInput,
  HttpEnvironment,
  HttpEnvironmentSaveInput,
  HttpExecuteRequestInput,
  HttpExecuteRequestResult,
  HttpExecutionHistoryRecord,
  HttpKeyValue,
  HttpRequestRecord,
  HttpRequestSaveInput,
  LegacyImportAnalysis,
  LegacyImportInput,
  LegacyImportResult,
  LegacySqliteImportAnalysis,
  LegacySqliteImportInput,
  LocalRuntimeStatus,
  PromptCategory,
  PromptCategorySaveInput,
  PromptExportDocument,
  PromptExportInput,
  PromptImportInput,
  PromptImportResult,
  PromptModuleState,
  PromptSaveAsTemplateInput,
  PromptTemplate,
  PromptTemplateReorderInput,
  PromptTemplateSaveInput,
  PromptTemplateUseInput,
  PromptTemplateUseResult,
  RuntimeInfo
} from '@shared/ipc-contract'

const STORAGE_PREFIX = 'doggy-toolbox-web:browser-bridge'
const COMMANDS_KEY = `${STORAGE_PREFIX}:commands`
const CREDENTIALS_KEY = `${STORAGE_PREFIX}:credentials`
const PROMPTS_KEY = `${STORAGE_PREFIX}:prompts`
const HTTP_KEY = `${STORAGE_PREFIX}:http`
const AI_SETTINGS_KEY = `${STORAGE_PREFIX}:ai-settings`
const AI_HISTORY_KEY = `${STORAGE_PREFIX}:ai-history`
const APPEARANCE_KEY = `${STORAGE_PREFIX}:appearance-preview`

type BrowserBridgeState = {
  commands: CommandModuleState
  credentials: CredentialModuleState
  prompts: PromptModuleState
  httpCollections: HttpCollectionModuleState
  aiSettings: AiSettingsState
  aiHistory: AiChatHistoryState
  aiSessions: Record<string, AiChatSessionRecord>
}

type JsonRecord = Record<string, unknown>

const DEFAULT_WORKDIR = '/Users/xrj/PycharmProjects/doggy-toolbox-web'

function nowIso(): string {
  return new Date().toISOString()
}

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function sanitizeText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\r/g, '').trim() : ''
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeStorage<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value))
}

function createRuntimeStatus(label: 'codex' | 'claude'): LocalRuntimeStatus {
  return {
    available: false,
    checkedAt: nowIso(),
    details:
      '当前是浏览器开发模式，没有 Electron preload 与主进程能力，因此这里只能提供开发态说明，不能代表本机 SDK 真实状态。',
    configPath: label === 'codex' ? '~/.codex/config.toml' : '~/.claude.json',
    authPath: label === 'codex' ? '~/.codex/auth.json' : undefined,
    files:
      label === 'codex'
        ? [
            { label: 'config.toml', path: '~/.codex/config.toml', exists: false },
            { label: 'auth.json', path: '~/.codex/auth.json', exists: false }
          ]
        : [{ label: '~/.claude.json', path: '~/.claude.json', exists: false }],
    facts: [
      { label: 'mode', value: 'browser-dev-fallback' },
      { label: 'note', value: '请用 Electron 窗口查看真实本机检测结果' }
    ],
    configDetected: false,
    runtimeInstalled: false,
    runtimeInstallPath: '',
    runtimeVersion: '',
    runtimePackageManager: 'unavailable',
    runtimeLastError: '浏览器开发模式不具备本机 runtime 探测能力',
    probe: {
      status: 'skipped',
      checkedAt: nowIso(),
      message: '当前是浏览器开发模式，未接入 Electron preload，跳过真实本机探测'
    }
  }
}

function createDefaultRuntimeInfo(): RuntimeInfo {
  const checkedAt = nowIso()
  const codex = createRuntimeStatus('codex')
  const claude = createRuntimeStatus('claude')
  codex.checkedAt = checkedAt
  codex.probe.checkedAt = checkedAt
  claude.checkedAt = checkedAt
  claude.probe.checkedAt = checkedAt
  return {
    appName: '狗狗百宝箱 Web',
    appVersion: 'browser-dev',
    platform: 'browser-dev' as NodeJS.Platform,
    dataDir: 'localStorage://doggy-toolbox-web',
    codex,
    claude,
    aiSdkRuntime: {
      checkedAt,
      runtimes: {
        codex: {
          provider: 'codex',
          label: 'Codex SDK',
          packageName: '@openai/codex-sdk',
          desiredVersion: '0.122.0',
          installPath: 'browser-dev',
          installed: false,
          packageManager: 'unavailable',
          lastError: '浏览器开发模式不支持按需安装 SDK runtime'
        },
        'claude-code': {
          provider: 'claude-code',
          label: 'Claude Agent SDK',
          packageName: '@anthropic-ai/claude-agent-sdk',
          desiredVersion: '0.2.118',
          installPath: 'browser-dev',
          installed: false,
          packageManager: 'unavailable',
          lastError: '浏览器开发模式不支持按需安装 SDK runtime'
        }
      }
    }
  }
}

function createDefaultAiSettings(): AiSettings {
  return {
    workingDirectory: '',
    systemPrompt: '请基于当前工具输入、输出和异常上下文，先解释结果，再指出风险和下一步建议。',
    globalEnabled: true,
    features: {
      'ai-chat': true,
      tools: true,
      http: true,
      commands: true,
      prompts: true
    }
  }
}

function createDefaultCommandState(): CommandModuleState {
  const timestamp = nowIso()
  const defaultTab: CommandTab = {
    id: 'default',
    name: '默认分组',
    order: 0,
    createdAt: timestamp,
    updatedAt: timestamp
  }
  return {
    storageFile: 'localStorage://commands',
    defaultTabId: defaultTab.id,
    updatedAt: timestamp,
    tabs: [defaultTab],
    commands: []
  }
}

function createDefaultCredentialState(): CredentialModuleState {
  return {
    storageFile: 'localStorage://credentials',
    updatedAt: nowIso(),
    secretEncoding: 'plain',
    credentials: []
  }
}

function createDefaultPromptState(): PromptModuleState {
  const timestamp = nowIso()
  const categories: PromptCategory[] = [
    {
      id: 'cat_coding',
      name: '编程开发',
      icon: '</>',
      order: 0,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      id: 'cat_analysis',
      name: '分析总结',
      icon: '📊',
      order: 1,
      createdAt: timestamp,
      updatedAt: timestamp
    }
  ]
  const templates: PromptTemplate[] = [
    {
      id: 'tpl_code_explain',
      title: '代码解释',
      content: '请解释以下代码：\n\n```{{language:ts}}\n{{code}}\n```',
      categoryId: 'cat_coding',
      description: '解释代码作用和关键逻辑',
      tags: ['代码', '解释'],
      variables: parsePromptVariables('请解释以下代码：\n\n```{{language:ts}}\n{{code}}\n```'),
      isFavorite: false,
      isSystem: true,
      usageCount: 0,
      order: 0,
      createdAt: timestamp,
      updatedAt: timestamp
    }
  ]
  return {
    storageFile: 'localStorage://prompts',
    updatedAt: timestamp,
    categories,
    templates
  }
}

function createDefaultHttpState(): HttpCollectionModuleState {
  const timestamp = nowIso()
  const collection: HttpCollection = {
    id: 'default-http-collection',
    name: '默认集合',
    description: '浏览器开发模式默认集合',
    order: 0,
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const request: HttpRequestRecord = {
    id: 'default-http-request',
    collectionId: collection.id,
    name: '健康检查',
    method: 'GET',
    url: 'https://httpbin.org/get',
    description: '用于验证浏览器开发模式的基础请求发送',
    headers: [],
    params: [],
    body: {
      type: 'none',
      content: ''
    },
    auth: {
      type: 'none',
      token: '',
      username: '',
      password: ''
    },
    tags: ['demo'],
    order: 0,
    createdAt: timestamp,
    updatedAt: timestamp
  }
  return {
    storageFile: 'localStorage://http-collections',
    defaultCollectionId: collection.id,
    updatedAt: timestamp,
    collections: [collection],
    requests: [request],
    environments: [],
    history: []
  }
}

function createDefaultAiSettingsState(): AiSettingsState {
  return {
    storageFile: 'localStorage://ai-settings',
    updatedAt: nowIso(),
    settings: createDefaultAiSettings()
  }
}

function createDefaultAiHistoryState(): AiChatHistoryState {
  return {
    storageFile: 'localStorage://ai-history',
    updatedAt: nowIso(),
    sessions: []
  }
}

function normalizeCommandsState(input: CommandModuleState | null): CommandModuleState {
  const fallback = createDefaultCommandState()
  if (!input) return fallback
  const tabs = [...(input.tabs ?? [])]
    .filter((tab) => sanitizeText(tab.id))
    .map((tab, index) => ({
      id: sanitizeText(tab.id) || createId(),
      name: sanitizeText(tab.name) || '未命名分组',
      order: Number.isFinite(tab.order) ? tab.order : index,
      createdAt: sanitizeText(tab.createdAt) || fallback.updatedAt,
      updatedAt: sanitizeText(tab.updatedAt) || fallback.updatedAt
    }))
    .sort((left, right) => left.order - right.order)
  if (!tabs.some((tab) => tab.id === 'default')) {
    tabs.unshift(fallback.tabs[0])
  }
  const validTabIds = new Set(tabs.map((tab) => tab.id))
  const commands = [...(input.commands ?? [])]
    .filter((command) => sanitizeText(command.id))
    .map((command, index) => ({
      id: sanitizeText(command.id) || createId(),
      title: sanitizeText(command.title) || '未命名命令',
      description: sanitizeText(command.description),
      lines: (command.lines ?? []).map((line) => sanitizeText(line)).filter(Boolean),
      tabId: validTabIds.has(command.tabId) ? command.tabId : 'default',
      tags: Array.from(new Set((command.tags ?? []).map((tag) => sanitizeText(tag)).filter(Boolean))),
      order: Number.isFinite(command.order) ? command.order : index,
      createdAt: sanitizeText(command.createdAt) || fallback.updatedAt,
      updatedAt: sanitizeText(command.updatedAt) || fallback.updatedAt
    }))
    .sort((left, right) => {
      if (left.tabId !== right.tabId) return left.tabId.localeCompare(right.tabId)
      if (left.order !== right.order) return left.order - right.order
      return left.createdAt.localeCompare(right.createdAt)
    })
  return {
    storageFile: input.storageFile || fallback.storageFile,
    defaultTabId: validTabIds.has(input.defaultTabId) ? input.defaultTabId : 'default',
    updatedAt: sanitizeText(input.updatedAt) || fallback.updatedAt,
    tabs,
    commands
  }
}

function normalizeCredentialsState(input: CredentialModuleState | null): CredentialModuleState {
  const fallback = createDefaultCredentialState()
  if (!input) return fallback
  const credentials = [...(input.credentials ?? [])]
    .filter((credential) => sanitizeText(credential.id))
    .map((credential, index) => ({
      id: sanitizeText(credential.id) || createId(),
      service: sanitizeText(credential.service) || '未命名服务',
      url: sanitizeText(credential.url),
      account: sanitizeText(credential.account),
      password: typeof credential.password === 'string' ? credential.password : '',
      extra: (credential.extra ?? []).map((line) => sanitizeText(line)).filter(Boolean),
      order: Number.isFinite(credential.order) ? credential.order : index,
      createdAt: sanitizeText(credential.createdAt) || fallback.updatedAt,
      updatedAt: sanitizeText(credential.updatedAt) || fallback.updatedAt
    }))
    .sort((left, right) => left.order - right.order)
  return {
    storageFile: input.storageFile || fallback.storageFile,
    updatedAt: sanitizeText(input.updatedAt) || fallback.updatedAt,
    secretEncoding: 'plain',
    credentials
  }
}

function normalizePromptsState(input: PromptModuleState | null): PromptModuleState {
  const fallback = createDefaultPromptState()
  if (!input) return fallback
  const categories = [...(input.categories ?? [])]
    .filter((category) => sanitizeText(category.id))
    .map((category, index) => ({
      id: sanitizeText(category.id) || createId(),
      name: sanitizeText(category.name) || '未命名分类',
      icon: typeof category.icon === 'string' ? category.icon : '',
      order: Number.isFinite(category.order) ? category.order : index,
      createdAt: sanitizeText(category.createdAt) || fallback.updatedAt,
      updatedAt: sanitizeText(category.updatedAt) || fallback.updatedAt
    }))
    .sort((left, right) => left.order - right.order)
  const validCategoryIds = new Set(categories.map((category) => category.id))
  const templates = [...(input.templates ?? [])]
    .filter((template) => sanitizeText(template.id))
    .map((template, index) => ({
      id: sanitizeText(template.id) || createId(),
      title: sanitizeText(template.title) || '未命名模板',
      content: typeof template.content === 'string' ? template.content.replace(/\r/g, '') : '',
      categoryId: validCategoryIds.has(template.categoryId) ? template.categoryId : '',
      description: sanitizeText(template.description),
      tags: Array.from(new Set((template.tags ?? []).map((tag) => sanitizeText(tag)).filter(Boolean))),
      variables: parsePromptVariables(template.content ?? ''),
      isFavorite: Boolean(template.isFavorite),
      isSystem: Boolean(template.isSystem),
      usageCount: Number.isFinite(template.usageCount) ? template.usageCount : 0,
      order: Number.isFinite(template.order) ? template.order : index,
      createdAt: sanitizeText(template.createdAt) || fallback.updatedAt,
      updatedAt: sanitizeText(template.updatedAt) || fallback.updatedAt
    }))
    .sort((left, right) => {
      if (left.categoryId !== right.categoryId) return left.categoryId.localeCompare(right.categoryId)
      if (left.order !== right.order) return left.order - right.order
      return left.createdAt.localeCompare(right.createdAt)
    })
  return {
    storageFile: input.storageFile || fallback.storageFile,
    updatedAt: sanitizeText(input.updatedAt) || fallback.updatedAt,
    categories,
    templates
  }
}

function normalizeHttpKeyValues(values: Array<Partial<HttpKeyValue>> | HttpKeyValue[] | undefined): HttpKeyValue[] {
  return (values ?? [])
    .map((item) => ({
      id: sanitizeText(item.id) || createId(),
      key: sanitizeText(item.key),
      value: typeof item.value === 'string' ? item.value.replace(/\r/g, '') : '',
      enabled: item.enabled !== false,
      description: sanitizeText(item.description)
    }))
    .filter((item) => item.key || item.value)
}

function normalizeHttpState(input: HttpCollectionModuleState | null): HttpCollectionModuleState {
  const fallback = createDefaultHttpState()
  if (!input) return fallback
  const collections = [...(input.collections ?? [])]
    .filter((collection) => sanitizeText(collection.id))
    .map((collection, index) => ({
      id: sanitizeText(collection.id) || createId(),
      name: sanitizeText(collection.name) || '未命名集合',
      description: sanitizeText(collection.description),
      order: Number.isFinite(collection.order) ? collection.order : index,
      createdAt: sanitizeText(collection.createdAt) || fallback.updatedAt,
      updatedAt: sanitizeText(collection.updatedAt) || fallback.updatedAt
    }))
    .sort((left, right) => left.order - right.order)
  const validCollectionIds = new Set(collections.map((collection) => collection.id))
  const requests = [...(input.requests ?? [])]
    .filter((request) => sanitizeText(request.id))
    .map((request, index) => ({
      id: sanitizeText(request.id) || createId(),
      collectionId: validCollectionIds.has(request.collectionId) ? request.collectionId : collections[0]?.id ?? fallback.defaultCollectionId,
      name: sanitizeText(request.name) || '未命名请求',
      method: request.method ?? 'GET',
      url: typeof request.url === 'string' ? request.url.trim() : '',
      description: sanitizeText(request.description),
      headers: normalizeHttpKeyValues(request.headers),
      params: normalizeHttpKeyValues(request.params),
      body: {
        type: request.body?.type ?? 'none',
        content: typeof request.body?.content === 'string' ? request.body.content.replace(/\r/g, '') : ''
      },
      auth: {
        type: request.auth?.type ?? 'none',
        token: typeof request.auth?.token === 'string' ? request.auth.token : '',
        username: typeof request.auth?.username === 'string' ? request.auth.username : '',
        password: typeof request.auth?.password === 'string' ? request.auth.password : ''
      },
      tags: Array.from(new Set((request.tags ?? []).map((tag) => sanitizeText(tag)).filter(Boolean))),
      order: Number.isFinite(request.order) ? request.order : index,
      createdAt: sanitizeText(request.createdAt) || fallback.updatedAt,
      updatedAt: sanitizeText(request.updatedAt) || fallback.updatedAt
    }))
    .sort((left, right) => {
      if (left.collectionId !== right.collectionId) return left.collectionId.localeCompare(right.collectionId)
      if (left.order !== right.order) return left.order - right.order
      return left.createdAt.localeCompare(right.createdAt)
    })
  const environments = [...(input.environments ?? [])]
    .filter((environment) => sanitizeText(environment.id))
    .map((environment, index) => ({
      id: sanitizeText(environment.id) || createId(),
      name: sanitizeText(environment.name) || '未命名环境',
      variables: normalizeHttpKeyValues(environment.variables),
      order: Number.isFinite(environment.order) ? environment.order : index,
      createdAt: sanitizeText(environment.createdAt) || fallback.updatedAt,
      updatedAt: sanitizeText(environment.updatedAt) || fallback.updatedAt
    }))
    .sort((left, right) => left.order - right.order)
  const history = [...(input.history ?? [])]
    .filter((item) => sanitizeText(item.id))
  return {
    storageFile: input.storageFile || fallback.storageFile,
    defaultCollectionId: validCollectionIds.has(input.defaultCollectionId) ? input.defaultCollectionId : collections[0]?.id ?? fallback.defaultCollectionId,
    updatedAt: sanitizeText(input.updatedAt) || fallback.updatedAt,
    collections,
    requests,
    environments,
    history
  }
}

function normalizeAiSettingsState(input: AiSettingsState | null): AiSettingsState {
  const fallback = createDefaultAiSettingsState()
  const settings = input?.settings ?? fallback.settings
  return {
    storageFile: input?.storageFile || fallback.storageFile,
    updatedAt: sanitizeText(input?.updatedAt) || fallback.updatedAt,
    settings: {
      workingDirectory: sanitizeText(settings.workingDirectory),
      systemPrompt: sanitizeText(settings.systemPrompt) || fallback.settings.systemPrompt,
      globalEnabled:
        typeof settings.globalEnabled === 'boolean'
          ? settings.globalEnabled
          : fallback.settings.globalEnabled,
      features: {
        'ai-chat': settings.features?.['ai-chat'] ?? fallback.settings.features['ai-chat'],
        tools: settings.features?.tools ?? fallback.settings.features.tools,
        http: settings.features?.http ?? fallback.settings.features.http,
        commands: settings.features?.commands ?? fallback.settings.features.commands,
        prompts: settings.features?.prompts ?? fallback.settings.features.prompts
      }
    }
  }
}

function normalizeAiHistoryState(
  history: AiChatHistoryState | null,
  sessions: Record<string, AiChatSessionRecord>
): AiChatHistoryState {
  const fallback = createDefaultAiHistoryState()
  const summaries = Object.values(sessions)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((session) => ({
      id: session.id,
      provider: session.provider,
      title: session.title,
      preview: session.output.slice(0, 120) || session.messages.at(-1)?.content.slice(0, 120) || '',
      status: session.status,
      phase: session.phase,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    }))
  return {
    storageFile: history?.storageFile || fallback.storageFile,
    updatedAt: summaries[0]?.updatedAt || sanitizeText(history?.updatedAt) || fallback.updatedAt,
    sessions: summaries
  }
}

function createEmptySummary(): BackupSummary {
  return {
    commands: 0,
    commandTabs: 0,
    credentials: 0,
    promptCategories: 0,
    promptTemplates: 0,
    httpCollections: 0,
    httpRequests: 0,
    httpEnvironments: 0,
    httpHistoryRecords: 0,
    aiSettings: 0
  }
}

function buildBackupSummary(state: BrowserBridgeState): BackupSummary {
  return {
    commands: state.commands.commands.length,
    commandTabs: state.commands.tabs.length,
    credentials: state.credentials.credentials.length,
    promptCategories: state.prompts.categories.length,
    promptTemplates: state.prompts.templates.length,
    httpCollections: state.httpCollections.collections.length,
    httpRequests: state.httpCollections.requests.length,
    httpEnvironments: state.httpCollections.environments.length,
    httpHistoryRecords: state.httpCollections.history.length,
    aiSettings: 1
  }
}

function loadState(): BrowserBridgeState {
  const aiSessions = readStorage<Record<string, AiChatSessionRecord>>(AI_HISTORY_KEY) ?? {}
  const commands = normalizeCommandsState(readStorage<CommandModuleState>(COMMANDS_KEY))
  const credentials = normalizeCredentialsState(readStorage<CredentialModuleState>(CREDENTIALS_KEY))
  const prompts = normalizePromptsState(readStorage<PromptModuleState>(PROMPTS_KEY))
  const httpCollections = normalizeHttpState(readStorage<HttpCollectionModuleState>(HTTP_KEY))
  const aiSettings = normalizeAiSettingsState(readStorage<AiSettingsState>(AI_SETTINGS_KEY))
  const aiHistory = normalizeAiHistoryState(
    readStorage<AiChatHistoryState>(`${AI_HISTORY_KEY}:meta`),
    aiSessions
  )
  return {
    commands,
    credentials,
    prompts,
    httpCollections,
    aiSettings,
    aiHistory,
    aiSessions
  }
}

function persistState(state: BrowserBridgeState): void {
  writeStorage(COMMANDS_KEY, state.commands)
  writeStorage(CREDENTIALS_KEY, state.credentials)
  writeStorage(PROMPTS_KEY, state.prompts)
  writeStorage(HTTP_KEY, state.httpCollections)
  writeStorage(AI_SETTINGS_KEY, state.aiSettings)
  writeStorage(AI_HISTORY_KEY, state.aiSessions)
  writeStorage(`${AI_HISTORY_KEY}:meta`, state.aiHistory)
}

export function installBrowserBridge(): void {
  if (typeof window === 'undefined') return
  if (window.doggy) return

  const listeners = new Set<(event: AiStreamEvent) => void>()
  const state = loadState()

  function saveAll(): void {
    state.aiHistory = normalizeAiHistoryState(state.aiHistory, state.aiSessions)
    persistState(state)
  }

  function emit(event: AiStreamEvent): void {
    for (const listener of listeners) {
      listener(event)
    }
  }

  function touchCommands(updatedAt = nowIso()): void {
    state.commands.updatedAt = updatedAt
  }

  function touchCredentials(updatedAt = nowIso()): void {
    state.credentials.updatedAt = updatedAt
  }

  function touchPrompts(updatedAt = nowIso()): void {
    state.prompts.updatedAt = updatedAt
  }

  function touchHttp(updatedAt = nowIso()): void {
    state.httpCollections.updatedAt = updatedAt
  }

  function touchAiSettings(updatedAt = nowIso()): void {
    state.aiSettings.updatedAt = updatedAt
  }

  async function runMockAiChat(input: AiStartChatInput): Promise<AiStartChatResult> {
    const sessionId = createId()
    const createdAt = nowIso()
    const session: AiChatSessionRecord = {
      id: sessionId,
      provider: input.provider,
      title: sanitizeText(input.title) || sanitizeText(input.messages.at(-1)?.content).slice(0, 48) || '浏览器开发会话',
      workingDirectory: sanitizeText(input.workingDirectory) || DEFAULT_WORKDIR,
      status: 'running',
      phase: 'starting',
      createdAt,
      updatedAt: createdAt,
      messages: cloneJson(input.messages),
      output: '',
      thinking: '',
      tools: [],
      runtime: {
        transport: input.provider === 'claude-code' ? 'claude-agent-sdk' : 'codex-sdk',
        workingDirectory: sanitizeText(input.workingDirectory) || DEFAULT_WORKDIR,
        model: 'browser-dev-fallback',
        baseUrl: 'browser://local-dev-bridge',
        configPath: 'browser-dev',
        authPath: input.provider === 'codex' ? 'browser-dev' : undefined
      }
    }
    state.aiSessions[sessionId] = session
    saveAll()

    emit({
      type: 'start',
      sessionId,
      provider: input.provider,
      runtime: session.runtime!
    })

    const userPrompt = input.messages.at(-1)?.content.trim() || '未提供提示词'
    const output = [
      '当前是浏览器开发模式回退桥。',
      '这个结果用于联机验证页面流程、历史记录和模块开关，不代表真实本机 SDK 已运行。',
      `本次 provider：${input.provider === 'codex' ? 'Codex' : 'Claude Code'}`,
      `工作目录：${sanitizeText(input.workingDirectory) || DEFAULT_WORKDIR}`,
      `提示词摘要：${userPrompt.slice(0, 120)}`
    ].join('\n')

    emit({
      type: 'status',
      sessionId,
      phase: 'streaming',
      message: '浏览器开发模式生成模拟响应'
    })
    emit({
      type: 'thinking',
      sessionId,
      text: '浏览器桥不具备本机 SDK 执行能力，因此这里只回放一段开发态说明。\n'
    })
    emit({
      type: 'delta',
      sessionId,
      text: output
    })
    emit({
      type: 'usage',
      sessionId,
      inputTokens: userPrompt.length,
      outputTokens: output.length,
      totalCostUsd: 0
    })
    emit({
      type: 'done',
      sessionId
    })

    state.aiSessions[sessionId] = {
      ...session,
      status: 'done',
      phase: 'completed',
      output,
      thinking: '浏览器开发模式模拟执行完成。',
      usage: {
        inputTokens: userPrompt.length,
        outputTokens: output.length,
        totalCostUsd: 0
      },
      updatedAt: nowIso()
    }
    saveAll()
    return { sessionId }
  }

  const bridge: BridgeApi = {
    async getRuntimeInfo() {
      return createDefaultRuntimeInfo()
    },
    async applyAppearance(appearance: AppAppearance) {
      writeStorage(APPEARANCE_KEY, appearance)
      return { ok: true }
    },
    async getAiChatHistoryState() {
      return cloneJson(state.aiHistory)
    },
    async getAiChatSession(sessionId: string) {
      return cloneJson(state.aiSessions[sanitizeText(sessionId)] ?? null)
    },
    async getAiSettingsState() {
      return cloneJson(state.aiSettings)
    },
    async saveAiSettings(input: AiSettingsSaveInput) {
      state.aiSettings = normalizeAiSettingsState({
        ...state.aiSettings,
        updatedAt: nowIso(),
        settings: {
          ...state.aiSettings.settings,
          ...input,
          features: {
            ...state.aiSettings.settings.features,
            ...(input.features ?? {})
          }
        }
      })
      touchAiSettings(state.aiSettings.updatedAt)
      saveAll()
      return cloneJson(state.aiSettings)
    },
    async getAiSdkRuntimeState() {
      return cloneJson(createDefaultRuntimeInfo().aiSdkRuntime)
    },
    async installAiSdkRuntime(provider: AiProviderKind) {
      const status = createDefaultRuntimeInfo().aiSdkRuntime.runtimes[provider]
      return {
        ok: false,
        status,
        stderr: '浏览器开发模式不支持安装本机 SDK runtime'
      } satisfies AiSdkRuntimeOperationResult
    },
    async updateAiSdkRuntime(provider: AiProviderKind) {
      const status = createDefaultRuntimeInfo().aiSdkRuntime.runtimes[provider]
      return {
        ok: false,
        status,
        stderr: '浏览器开发模式不支持更新本机 SDK runtime'
      } satisfies AiSdkRuntimeOperationResult
    },
    async uninstallAiSdkRuntime(provider: AiProviderKind) {
      const status = createDefaultRuntimeInfo().aiSdkRuntime.runtimes[provider]
      return {
        ok: false,
        status,
        stderr: '浏览器开发模式不支持卸载本机 SDK runtime'
      } satisfies AiSdkRuntimeOperationResult
    },
    aiStartChat(input: AiStartChatInput) {
      return runMockAiChat(input)
    },
    async aiCancelChat(sessionId: string) {
      const normalizedId = sanitizeText(sessionId)
      const existing = state.aiSessions[normalizedId]
      if (!existing) return { ok: false }
      state.aiSessions[normalizedId] = {
        ...existing,
        status: 'cancelled',
        phase: 'cancelled',
        updatedAt: nowIso()
      }
      saveAll()
      emit({
        type: 'error',
        sessionId: normalizedId,
        message: '浏览器开发模式会话已取消'
      })
      return { ok: true }
    },
    onAiStreamEvent(handler) {
      listeners.add(handler)
      return () => {
        listeners.delete(handler)
      }
    },
    async getCommandsState() {
      return cloneJson(state.commands)
    },
    async saveCommandTab(input: CommandTabSaveInput) {
      const name = sanitizeText(input.name)
      if (!name) {
        throw new Error('分组名称不能为空')
      }
      const timestamp = nowIso()
      let tab: CommandTab
      const existingIndex = state.commands.tabs.findIndex((item) => item.id === input.id)
      if (existingIndex >= 0) {
        tab = {
          ...state.commands.tabs[existingIndex],
          name,
          updatedAt: timestamp
        }
        state.commands.tabs.splice(existingIndex, 1, tab)
      } else {
        tab = {
          id: createId(),
          name,
          order:
            state.commands.tabs.reduce((maxOrder, item) => Math.max(maxOrder, item.order), -1) + 1,
          createdAt: timestamp,
          updatedAt: timestamp
        }
        state.commands.tabs.push(tab)
      }
      state.commands.tabs.sort((left, right) => left.order - right.order)
      touchCommands(timestamp)
      saveAll()
      return cloneJson(tab)
    },
    async saveCommand(input: CommandSaveInput) {
      const title = sanitizeText(input.title)
      const lines = (input.lines ?? []).map((line) => sanitizeText(line)).filter(Boolean)
      if (!title) {
        throw new Error('命令标题不能为空')
      }
      if (lines.length === 0) {
        throw new Error('至少需要保留一行命令')
      }
      const timestamp = nowIso()
      const tabIds = new Set(state.commands.tabs.map((tab) => tab.id))
      const tabId = tabIds.has(input.tabId ?? '') ? (input.tabId as string) : state.commands.defaultTabId
      let command: CommandRecord
      const existingIndex = state.commands.commands.findIndex((item) => item.id === input.id)
      if (existingIndex >= 0) {
        command = {
          ...state.commands.commands[existingIndex],
          title,
          description: sanitizeText(input.description),
          lines,
          tabId,
          tags: Array.from(new Set((input.tags ?? []).map((tag) => sanitizeText(tag)).filter(Boolean))),
          updatedAt: timestamp
        }
        state.commands.commands.splice(existingIndex, 1, command)
      } else {
        command = {
          id: createId(),
          title,
          description: sanitizeText(input.description),
          lines,
          tabId,
          tags: Array.from(new Set((input.tags ?? []).map((tag) => sanitizeText(tag)).filter(Boolean))),
          order:
            state.commands.commands
              .filter((item) => item.tabId === tabId)
              .reduce((maxOrder, item) => Math.max(maxOrder, item.order), -1) + 1,
          createdAt: timestamp,
          updatedAt: timestamp
        }
        state.commands.commands.push(command)
      }
      state.commands.commands.sort((left, right) => {
        if (left.tabId !== right.tabId) return left.tabId.localeCompare(right.tabId)
        if (left.order !== right.order) return left.order - right.order
        return left.createdAt.localeCompare(right.createdAt)
      })
      touchCommands(timestamp)
      saveAll()
      return cloneJson(command)
    },
    async importCommands(input: CommandImportInput) {
      const tabIds = new Set(state.commands.tabs.map((tab) => tab.id))
      const tabId = tabIds.has(input.tabId ?? '') ? (input.tabId as string) : state.commands.defaultTabId
      const blocks = String(input.text ?? '')
        .split(/\n\s*\n/)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block) => {
          const lines = block.split('\n').map((line) => sanitizeText(line)).filter(Boolean)
          const titleLine = lines[0] ?? ''
          const inferredTitle = /[:：]$/.test(titleLine) ? titleLine.replace(/[:：]\s*$/, '') : titleLine.slice(0, 32) || '导入命令'
          return {
            title: inferredTitle,
            description: '',
            lines,
            tabId,
            tags: []
          }
        })
      const timestamp = nowIso()
      blocks.forEach((block, index) => {
        state.commands.commands.push({
          id: createId(),
          title: block.title,
          description: block.description,
          lines: block.lines,
          tabId,
          tags: [],
          order:
            state.commands.commands
              .filter((item) => item.tabId === tabId)
              .reduce((maxOrder, item) => Math.max(maxOrder, item.order), -1) + 1 + index,
          createdAt: timestamp,
          updatedAt: timestamp
        })
      })
      touchCommands(timestamp)
      saveAll()
      return {
        imported: blocks.length,
        blocks
      } satisfies CommandImportResult
    },
    async reorderCommandTabs(tabIds: string[]) {
      const idSet = new Set(tabIds.map((id) => sanitizeText(id)).filter(Boolean))
      let nextOrder = 0
      const ordered = [
        ...state.commands.tabs.filter((tab) => idSet.has(tab.id)),
        ...state.commands.tabs.filter((tab) => !idSet.has(tab.id))
      ].map((tab) => ({
        ...tab,
        order: nextOrder++,
        updatedAt: nowIso()
      }))
      state.commands.tabs = ordered
      touchCommands()
      saveAll()
      return { ok: true }
    },
    async moveCommandToTab(input: CommandMoveInput) {
      const command = state.commands.commands.find((item) => item.id === input.commandId)
      if (!command) {
        throw new Error('命令不存在')
      }
      if (!state.commands.tabs.some((tab) => tab.id === input.targetTabId)) {
        throw new Error('目标分组不存在')
      }
      command.tabId = input.targetTabId
      command.order =
        state.commands.commands
          .filter((item) => item.tabId === input.targetTabId)
          .reduce((maxOrder, item) => Math.max(maxOrder, item.order), -1) + 1
      command.updatedAt = nowIso()
      touchCommands(command.updatedAt)
      saveAll()
      return cloneJson(command)
    },
    async reorderCommands(input: CommandReorderInput) {
      const ids = new Set(input.commandIds.map((id) => sanitizeText(id)).filter(Boolean))
      let nextOrder = 0
      const currentTabCommands = state.commands.commands
        .filter((item) => item.tabId === input.tabId)
        .sort((left, right) => left.order - right.order)
      const orderedIds = [
        ...currentTabCommands.filter((item) => ids.has(item.id)),
        ...currentTabCommands.filter((item) => !ids.has(item.id))
      ]
      orderedIds.forEach((item) => {
        item.order = nextOrder++
        item.updatedAt = nowIso()
      })
      touchCommands()
      saveAll()
      return { ok: true }
    },
    async deleteCommand(commandId: string) {
      const before = state.commands.commands.length
      state.commands.commands = state.commands.commands.filter((item) => item.id !== commandId)
      const ok = state.commands.commands.length !== before
      if (ok) {
        touchCommands()
        saveAll()
      }
      return { ok }
    },
    async getCredentialsState() {
      return cloneJson(state.credentials)
    },
    async saveCredential(input: CredentialSaveInput) {
      const service = sanitizeText(input.service)
      if (!service) {
        throw new Error('服务名称不能为空')
      }
      const timestamp = nowIso()
      let credential: CredentialRecord
      const existingIndex = state.credentials.credentials.findIndex((item) => item.id === input.id)
      if (existingIndex >= 0) {
        credential = {
          ...state.credentials.credentials[existingIndex],
          service,
          url: sanitizeText(input.url),
          account: sanitizeText(input.account),
          password: typeof input.password === 'string' ? input.password : '',
          extra: (input.extra ?? []).map((line) => sanitizeText(line)).filter(Boolean),
          updatedAt: timestamp
        }
        state.credentials.credentials.splice(existingIndex, 1, credential)
      } else {
        credential = {
          id: createId(),
          service,
          url: sanitizeText(input.url),
          account: sanitizeText(input.account),
          password: typeof input.password === 'string' ? input.password : '',
          extra: (input.extra ?? []).map((line) => sanitizeText(line)).filter(Boolean),
          order:
            state.credentials.credentials.reduce((maxOrder, item) => Math.max(maxOrder, item.order), -1) + 1,
          createdAt: timestamp,
          updatedAt: timestamp
        }
        state.credentials.credentials.push(credential)
      }
      state.credentials.credentials.sort((left, right) => left.order - right.order)
      touchCredentials(timestamp)
      saveAll()
      return cloneJson(credential)
    },
    async importCredentials(input: CredentialImportInput) {
      const blocks = String(input.text ?? '')
        .split(/\n\s*\n/)
        .map((block) => block.trim())
        .filter(Boolean)
      const timestamp = nowIso()
      const imported = blocks.map((block, index) => {
        const lines = block.split('\n').map((line) => sanitizeText(line)).filter(Boolean)
        const [service = '未命名服务', account = '', password = '', ...extra] = lines
        const record: CredentialRecord = {
          id: createId(),
          service,
          url: '',
          account,
          password,
          extra,
          order:
            state.credentials.credentials.reduce((maxOrder, item) => Math.max(maxOrder, item.order), -1) + 1 + index,
          createdAt: timestamp,
          updatedAt: timestamp
        }
        state.credentials.credentials.push(record)
        return {
          service: record.service,
          url: record.url,
          account: record.account,
          password: record.password,
          extra: record.extra
        }
      })
      touchCredentials(timestamp)
      saveAll()
      return {
        imported: imported.length,
        credentials: imported
      } satisfies CredentialImportResult
    },
    async reorderCredentials(credentialIds: string[]) {
      const ids = new Set(credentialIds.map((id) => sanitizeText(id)).filter(Boolean))
      let nextOrder = 0
      state.credentials.credentials = [
        ...state.credentials.credentials.filter((item) => ids.has(item.id)),
        ...state.credentials.credentials.filter((item) => !ids.has(item.id))
      ].map((item) => ({
        ...item,
        order: nextOrder++,
        updatedAt: nowIso()
      }))
      touchCredentials()
      saveAll()
      return { ok: true }
    },
    async deleteCredential(credentialId: string) {
      const before = state.credentials.credentials.length
      state.credentials.credentials = state.credentials.credentials.filter(
        (item) => item.id !== credentialId
      )
      const ok = state.credentials.credentials.length !== before
      if (ok) {
        touchCredentials()
        saveAll()
      }
      return { ok }
    },
    async getHttpCollectionsState() {
      return cloneJson(state.httpCollections)
    },
    async saveHttpCollection(input: HttpCollectionSaveInput) {
      const name = sanitizeText(input.name)
      if (!name) {
        throw new Error('集合名称不能为空')
      }
      const timestamp = nowIso()
      let collection: HttpCollection
      const existingIndex = state.httpCollections.collections.findIndex((item) => item.id === input.id)
      if (existingIndex >= 0) {
        collection = {
          ...state.httpCollections.collections[existingIndex],
          name,
          description: sanitizeText(input.description),
          updatedAt: timestamp
        }
        state.httpCollections.collections.splice(existingIndex, 1, collection)
      } else {
        collection = {
          id: createId(),
          name,
          description: sanitizeText(input.description),
          order:
            state.httpCollections.collections.reduce((maxOrder, item) => Math.max(maxOrder, item.order), -1) + 1,
          createdAt: timestamp,
          updatedAt: timestamp
        }
        state.httpCollections.collections.push(collection)
      }
      state.httpCollections.collections.sort((left, right) => left.order - right.order)
      if (!state.httpCollections.defaultCollectionId) {
        state.httpCollections.defaultCollectionId = collection.id
      }
      touchHttp(timestamp)
      saveAll()
      return cloneJson(collection)
    },
    async reorderHttpCollections(input: HttpCollectionReorderInput) {
      const ids = new Set(input.collectionIds.map((id) => sanitizeText(id)).filter(Boolean))
      let nextOrder = 0
      state.httpCollections.collections = [
        ...state.httpCollections.collections.filter((item) => ids.has(item.id)),
        ...state.httpCollections.collections.filter((item) => !ids.has(item.id))
      ].map((item) => ({
        ...item,
        order: nextOrder++,
        updatedAt: nowIso()
      }))
      touchHttp()
      saveAll()
      return { ok: true }
    },
    async saveHttpRequest(input: HttpRequestSaveInput) {
      const name = sanitizeText(input.name)
      if (!name) {
        throw new Error('请求名称不能为空')
      }
      const collectionIds = new Set(state.httpCollections.collections.map((item) => item.id))
      const collectionId = collectionIds.has(input.collectionId ?? '')
        ? (input.collectionId as string)
        : state.httpCollections.defaultCollectionId
      const timestamp = nowIso()
      let request: HttpRequestRecord
      const existingIndex = state.httpCollections.requests.findIndex((item) => item.id === input.id)
      if (existingIndex >= 0) {
        request = {
          ...state.httpCollections.requests[existingIndex],
          collectionId,
          name,
          method: input.method ?? 'GET',
          url: typeof input.url === 'string' ? input.url.trim() : '',
          description: sanitizeText(input.description),
          headers: normalizeHttpKeyValues(input.headers),
          params: normalizeHttpKeyValues(input.params),
          body: {
            type: input.body?.type ?? 'none',
            content: typeof input.body?.content === 'string' ? input.body.content.replace(/\r/g, '') : ''
          },
          auth: {
            type: input.auth?.type ?? 'none',
            token: typeof input.auth?.token === 'string' ? input.auth.token : '',
            username: typeof input.auth?.username === 'string' ? input.auth.username : '',
            password: typeof input.auth?.password === 'string' ? input.auth.password : ''
          },
          tags: Array.from(new Set((input.tags ?? []).map((tag) => sanitizeText(tag)).filter(Boolean))),
          updatedAt: timestamp
        }
        state.httpCollections.requests.splice(existingIndex, 1, request)
      } else {
        request = {
          id: createId(),
          collectionId,
          name,
          method: input.method ?? 'GET',
          url: typeof input.url === 'string' ? input.url.trim() : '',
          description: sanitizeText(input.description),
          headers: normalizeHttpKeyValues(input.headers),
          params: normalizeHttpKeyValues(input.params),
          body: {
            type: input.body?.type ?? 'none',
            content: typeof input.body?.content === 'string' ? input.body.content.replace(/\r/g, '') : ''
          },
          auth: {
            type: input.auth?.type ?? 'none',
            token: typeof input.auth?.token === 'string' ? input.auth.token : '',
            username: typeof input.auth?.username === 'string' ? input.auth.username : '',
            password: typeof input.auth?.password === 'string' ? input.auth.password : ''
          },
          tags: Array.from(new Set((input.tags ?? []).map((tag) => sanitizeText(tag)).filter(Boolean))),
          order:
            state.httpCollections.requests
              .filter((item) => item.collectionId === collectionId)
              .reduce((maxOrder, item) => Math.max(maxOrder, item.order), -1) + 1,
          createdAt: timestamp,
          updatedAt: timestamp
        }
        state.httpCollections.requests.push(request)
      }
      state.httpCollections.requests.sort((left, right) => {
        if (left.collectionId !== right.collectionId) return left.collectionId.localeCompare(right.collectionId)
        if (left.order !== right.order) return left.order - right.order
        return left.createdAt.localeCompare(right.createdAt)
      })
      touchHttp(timestamp)
      saveAll()
      return cloneJson(request)
    },
    async deleteHttpRequest(requestId: string) {
      const before = state.httpCollections.requests.length
      state.httpCollections.requests = state.httpCollections.requests.filter((item) => item.id !== requestId)
      const ok = state.httpCollections.requests.length !== before
      if (ok) {
        touchHttp()
        saveAll()
      }
      return { ok }
    },
    async saveHttpEnvironment(input: HttpEnvironmentSaveInput) {
      const name = sanitizeText(input.name)
      if (!name) {
        throw new Error('环境名称不能为空')
      }
      const timestamp = nowIso()
      let environment: HttpEnvironment
      const existingIndex = state.httpCollections.environments.findIndex((item) => item.id === input.id)
      if (existingIndex >= 0) {
        environment = {
          ...state.httpCollections.environments[existingIndex],
          name,
          variables: normalizeHttpKeyValues(input.variables),
          updatedAt: timestamp
        }
        state.httpCollections.environments.splice(existingIndex, 1, environment)
      } else {
        environment = {
          id: createId(),
          name,
          variables: normalizeHttpKeyValues(input.variables),
          order:
            state.httpCollections.environments.reduce((maxOrder, item) => Math.max(maxOrder, item.order), -1) + 1,
          createdAt: timestamp,
          updatedAt: timestamp
        }
        state.httpCollections.environments.push(environment)
      }
      state.httpCollections.environments.sort((left, right) => left.order - right.order)
      touchHttp(timestamp)
      saveAll()
      return cloneJson(environment)
    },
    async deleteHttpEnvironment(environmentId: string) {
      const before = state.httpCollections.environments.length
      state.httpCollections.environments = state.httpCollections.environments.filter(
        (item) => item.id !== environmentId
      )
      const ok = state.httpCollections.environments.length !== before
      if (ok) {
        touchHttp()
        saveAll()
      }
      return { ok }
    },
    async executeHttpRequest(input: HttpExecuteRequestInput) {
      const request = state.httpCollections.requests.find((item) => item.id === input.requestId)
      if (!request) {
        throw new Error('请求不存在')
      }
      const environment = state.httpCollections.environments.find(
        (item) => item.id === input.environmentId
      )
      const resolvedHeaders = request.headers
        .filter((item) => item.enabled !== false)
        .map((item) => ({ key: item.key, value: item.value }))
      const resolvedRequest = {
        requestId: request.id,
        environmentId: environment?.id,
        method: request.method,
        url: request.url,
        headers: resolvedHeaders,
        bodyType: request.body.type,
        body: request.body.content,
        unresolvedVariables: []
      }
      const startedAt = Date.now()
      let result: HttpExecuteRequestResult
      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: Object.fromEntries(resolvedHeaders.map((item) => [item.key, item.value])),
          body: request.body.type === 'none' || request.method === 'GET' ? undefined : request.body.content
        })
        const body = await response.text()
        result = {
          requestId: request.id,
          environmentId: environment?.id,
          executedAt: nowIso(),
          durationMs: Date.now() - startedAt,
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          headers: Array.from(response.headers.entries()).map(([key, value]) => ({ key, value })),
          body,
          bodySizeBytes: new TextEncoder().encode(body).length,
          resolvedRequest
        }
      } catch (error) {
        result = {
          requestId: request.id,
          environmentId: environment?.id,
          executedAt: nowIso(),
          durationMs: Date.now() - startedAt,
          ok: false,
          status: 0,
          statusText: 'Network Error',
          headers: [],
          body: '',
          bodySizeBytes: 0,
          resolvedRequest,
          errorMessage: error instanceof Error ? error.message : String(error)
        }
      }
      const historyRecord: HttpExecutionHistoryRecord = {
        id: createId(),
        requestId: request.id,
        requestName: request.name,
        environmentId: environment?.id,
        environmentName: environment?.name,
        method: request.method,
        url: request.url,
        executedAt: result.executedAt,
        durationMs: result.durationMs,
        ok: result.ok,
        status: result.status,
        statusText: result.statusText,
        responseHeaders: result.headers,
        responseBody: result.body,
        responseBodySizeBytes: result.bodySizeBytes,
        responseBodyTruncated: false,
        resolvedRequest,
        errorMessage: result.errorMessage
      }
      state.httpCollections.history.unshift(historyRecord)
      state.httpCollections.history = state.httpCollections.history.slice(0, 500)
      touchHttp(result.executedAt)
      saveAll()
      return result
    },
    async executeHttpBatch(input: HttpBatchExecuteInput) {
      const requestIds =
        input.requestIds && input.requestIds.length > 0
          ? input.requestIds
          : state.httpCollections.requests
              .filter((item) =>
                input.collectionId ? item.collectionId === input.collectionId : true
              )
              .map((item) => item.id)
      const startedAt = Date.now()
      const results: HttpExecuteRequestResult[] = []
      for (const requestId of requestIds) {
        results.push(
          await bridge.executeHttpRequest({
            requestId,
            environmentId: input.environmentId
          })
        )
      }
      const succeeded = results.filter((item) => item.ok).length
      return {
        collectionId: input.collectionId,
        environmentId: input.environmentId,
        executedAt: nowIso(),
        summary: {
          total: results.length,
          succeeded,
          failed: results.length - succeeded,
          durationMs: Date.now() - startedAt
        },
        results
      } satisfies HttpBatchExecuteResult
    },
    async clearHttpHistory(input) {
      const before = state.httpCollections.history.length
      state.httpCollections.history = input?.requestId
        ? state.httpCollections.history.filter((item) => item.requestId !== input.requestId)
        : []
      const removed = before - state.httpCollections.history.length
      if (removed > 0) {
        touchHttp()
        saveAll()
      }
      return { ok: true, removed }
    },
    async getPromptState() {
      return cloneJson(state.prompts)
    },
    async savePromptCategory(input: PromptCategorySaveInput) {
      const name = sanitizeText(input.name)
      if (!name) {
        throw new Error('分类名称不能为空')
      }
      const timestamp = nowIso()
      let category: PromptCategory
      const existingIndex = state.prompts.categories.findIndex((item) => item.id === input.id)
      if (existingIndex >= 0) {
        category = {
          ...state.prompts.categories[existingIndex],
          name,
          icon: typeof input.icon === 'string' ? input.icon : '',
          updatedAt: timestamp
        }
        state.prompts.categories.splice(existingIndex, 1, category)
      } else {
        category = {
          id: createId(),
          name,
          icon: typeof input.icon === 'string' ? input.icon : '',
          order:
            state.prompts.categories.reduce((maxOrder, item) => Math.max(maxOrder, item.order), -1) + 1,
          createdAt: timestamp,
          updatedAt: timestamp
        }
        state.prompts.categories.push(category)
      }
      state.prompts.categories.sort((left, right) => left.order - right.order)
      touchPrompts(timestamp)
      saveAll()
      return cloneJson(category)
    },
    async reorderPromptCategories(categoryIds: string[]) {
      const ids = new Set(categoryIds.map((id) => sanitizeText(id)).filter(Boolean))
      let nextOrder = 0
      state.prompts.categories = [
        ...state.prompts.categories.filter((item) => ids.has(item.id)),
        ...state.prompts.categories.filter((item) => !ids.has(item.id))
      ].map((item) => ({
        ...item,
        order: nextOrder++,
        updatedAt: nowIso()
      }))
      touchPrompts()
      saveAll()
      return { ok: true }
    },
    async deletePromptCategory(categoryId: string) {
      const before = state.prompts.categories.length
      state.prompts.categories = state.prompts.categories.filter((item) => item.id !== categoryId)
      const ok = state.prompts.categories.length !== before
      if (ok) {
        state.prompts.templates = state.prompts.templates.map((template) =>
          template.categoryId === categoryId
            ? {
                ...template,
                categoryId: '',
                updatedAt: nowIso()
              }
            : template
        )
        touchPrompts()
        saveAll()
      }
      return { ok }
    },
    async savePromptTemplate(input: PromptTemplateSaveInput) {
      const title = sanitizeText(input.title)
      const content = typeof input.content === 'string' ? input.content.replace(/\r/g, '') : ''
      if (!title || !content.trim()) {
        throw new Error('模板标题和内容不能为空')
      }
      const timestamp = nowIso()
      const validCategoryIds = new Set(state.prompts.categories.map((item) => item.id))
      const categoryId = validCategoryIds.has(input.categoryId ?? '') ? (input.categoryId as string) : ''
      let template: PromptTemplate
      const existingIndex = state.prompts.templates.findIndex((item) => item.id === input.id)
      if (existingIndex >= 0) {
        template = {
          ...state.prompts.templates[existingIndex],
          title,
          content,
          categoryId,
          description: sanitizeText(input.description),
          tags: Array.from(new Set((input.tags ?? []).map((tag) => sanitizeText(tag)).filter(Boolean))),
          variables: parsePromptVariables(content),
          updatedAt: timestamp
        }
        state.prompts.templates.splice(existingIndex, 1, template)
      } else {
        template = {
          id: createId(),
          title,
          content,
          categoryId,
          description: sanitizeText(input.description),
          tags: Array.from(new Set((input.tags ?? []).map((tag) => sanitizeText(tag)).filter(Boolean))),
          variables: parsePromptVariables(content),
          isFavorite: false,
          isSystem: false,
          usageCount: 0,
          order:
            state.prompts.templates
              .filter((item) => (item.categoryId || '') === categoryId)
              .reduce((maxOrder, item) => Math.max(maxOrder, item.order), -1) + 1,
          createdAt: timestamp,
          updatedAt: timestamp
        }
        state.prompts.templates.push(template)
      }
      state.prompts.templates.sort((left, right) => {
        if ((left.categoryId || '') !== (right.categoryId || '')) {
          return (left.categoryId || '').localeCompare(right.categoryId || '')
        }
        if (left.order !== right.order) return left.order - right.order
        return left.createdAt.localeCompare(right.createdAt)
      })
      touchPrompts(timestamp)
      saveAll()
      return cloneJson(template)
    },
    async savePromptAsTemplate(input: PromptSaveAsTemplateInput) {
      return bridge.savePromptTemplate({
        title: sanitizeText(input.title) || sanitizeText(input.content).slice(0, 30) || '未命名模板',
        content: input.content,
        categoryId: input.categoryId,
        description: input.description,
        tags: input.tags
      })
    },
    async reorderPromptTemplates(input: PromptTemplateReorderInput) {
      const ids = new Set(input.templateIds.map((id) => sanitizeText(id)).filter(Boolean))
      let nextOrder = 0
      const categoryId = sanitizeText(input.categoryId)
      const visible = state.prompts.templates.filter(
        (item) => (item.categoryId || '') === categoryId
      )
      const ordered = [
        ...visible.filter((item) => ids.has(item.id)),
        ...visible.filter((item) => !ids.has(item.id))
      ]
      ordered.forEach((item) => {
        item.order = nextOrder++
        item.updatedAt = nowIso()
      })
      touchPrompts()
      saveAll()
      return { ok: true }
    },
    async deletePromptTemplate(templateId: string) {
      const before = state.prompts.templates.length
      state.prompts.templates = state.prompts.templates.filter((item) => item.id !== templateId)
      const ok = state.prompts.templates.length !== before
      if (ok) {
        touchPrompts()
        saveAll()
      }
      return { ok }
    },
    async togglePromptFavorite(templateId: string) {
      const template = state.prompts.templates.find((item) => item.id === templateId)
      if (!template) {
        throw new Error('模板不存在')
      }
      template.isFavorite = !template.isFavorite
      template.updatedAt = nowIso()
      touchPrompts(template.updatedAt)
      saveAll()
      return { isFavorite: template.isFavorite }
    },
    async usePromptTemplate(input: PromptTemplateUseInput) {
      const template = state.prompts.templates.find((item) => item.id === input.templateId)
      if (!template) {
        throw new Error('模板不存在')
      }
      template.usageCount += 1
      template.updatedAt = nowIso()
      touchPrompts(template.updatedAt)
      saveAll()
      return {
        content: fillPromptTemplate(template.content, input.values ?? {}),
        template: cloneJson(template)
      } satisfies PromptTemplateUseResult
    },
    async parsePromptVariables(content: string) {
      return parsePromptVariables(content)
    },
    async exportPromptTemplates(input?: PromptExportInput) {
      const selected = new Set((input?.templateIds ?? []).map((id) => sanitizeText(id)).filter(Boolean))
      const templates = selected.size
        ? state.prompts.templates.filter((template) => selected.has(template.id))
        : state.prompts.templates
      const categoryIds = new Set(templates.map((template) => template.categoryId).filter(Boolean))
      const document: PromptExportDocument = {
        version: '1.0',
        export_time: nowIso(),
        templates: templates.map((template) => ({
          title: template.title,
          content: template.content,
          description: template.description,
          tags: template.tags,
          category_id: template.categoryId || undefined
        }))
      }
      if (input?.includeCategories !== false && categoryIds.size > 0) {
        document.categories = state.prompts.categories
          .filter((category) => categoryIds.has(category.id))
          .map((category) => ({
            id: category.id,
            name: category.name,
            icon: category.icon
          }))
      }
      return document
    },
    async importPromptTemplates(input: PromptImportInput) {
      let parsed: JsonRecord
      try {
        parsed = JSON.parse(input.json) as JsonRecord
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'Prompt 导入 JSON 解析失败')
      }
      const categories = Array.isArray(parsed.categories)
        ? (parsed.categories as Array<JsonRecord>)
        : []
      const templates = Array.isArray(parsed.templates)
        ? (parsed.templates as Array<JsonRecord>)
        : []
      const timestamp = nowIso()
      const result: PromptImportResult = {
        imported: 0,
        skipped: 0,
        errors: []
      }
      const categoryIdMap = new Map<string, string>()
      for (const category of categories) {
        const name = sanitizeText(category.name)
        if (!name) continue
        const existing = state.prompts.categories.find((item) => item.name === name)
        if (existing) {
          if (sanitizeText(category.id)) {
            categoryIdMap.set(sanitizeText(category.id), existing.id)
          }
          continue
        }
        const created: PromptCategory = {
          id: createId(),
          name,
          icon: typeof category.icon === 'string' ? category.icon : '',
          order:
            state.prompts.categories.reduce((maxOrder, item) => Math.max(maxOrder, item.order), -1) + 1,
          createdAt: timestamp,
          updatedAt: timestamp
        }
        state.prompts.categories.push(created)
        if (sanitizeText(category.id)) {
          categoryIdMap.set(sanitizeText(category.id), created.id)
        }
      }
      for (const item of templates) {
        const title = sanitizeText(item.title)
        const content = typeof item.content === 'string' ? item.content.replace(/\r/g, '') : ''
        if (!title || !content.trim()) {
          result.errors.push('模板缺少标题或内容')
          continue
        }
        const existing = state.prompts.templates.find((template) => template.title === title)
        if (existing && !input.overwrite) {
          result.skipped += 1
          continue
        }
        const categoryId = sanitizeText(item.category_id)
          ? (categoryIdMap.get(sanitizeText(item.category_id)) ?? '')
          : ''
        if (existing) {
          existing.content = content
          existing.description = sanitizeText(item.description)
          existing.tags = Array.from(
            new Set(((item.tags as string[]) ?? []).map((tag) => sanitizeText(tag)).filter(Boolean))
          )
          existing.categoryId = categoryId
          existing.variables = parsePromptVariables(content)
          existing.updatedAt = timestamp
          result.imported += 1
          continue
        }
        state.prompts.templates.push({
          id: createId(),
          title,
          content,
          categoryId,
          description: sanitizeText(item.description),
          tags: Array.from(
            new Set(((item.tags as string[]) ?? []).map((tag) => sanitizeText(tag)).filter(Boolean))
          ),
          variables: parsePromptVariables(content),
          isFavorite: false,
          isSystem: false,
          usageCount: 0,
          order:
            state.prompts.templates.reduce((maxOrder, template) => Math.max(maxOrder, template.order), -1) + 1,
          createdAt: timestamp,
          updatedAt: timestamp
        })
        result.imported += 1
      }
      touchPrompts(timestamp)
      saveAll()
      return result
    },
    async exportBackup(input?: BackupExportInput) {
      const sections =
        input?.sections && input.sections.length > 0
          ? input.sections
          : (['commands', 'credentials', 'prompts', 'httpCollections', 'aiSettings'] satisfies BackupSectionKey[])
      return {
        version: '1.0',
        app: 'doggy-toolbox-web',
        exportedAt: nowIso(),
        sections,
        summary: buildBackupSummary(state),
        data: {
          commands: sections.includes('commands')
            ? {
                tabs: cloneJson(state.commands.tabs),
                commands: cloneJson(state.commands.commands)
              }
            : undefined,
          credentials: sections.includes('credentials')
            ? {
                credentials: cloneJson(state.credentials.credentials)
              }
            : undefined,
          prompts: sections.includes('prompts')
            ? {
                categories: cloneJson(state.prompts.categories),
                templates: cloneJson(state.prompts.templates)
              }
            : undefined,
          httpCollections: sections.includes('httpCollections')
            ? {
                collections: cloneJson(state.httpCollections.collections),
                requests: cloneJson(state.httpCollections.requests),
                environments: cloneJson(state.httpCollections.environments),
                history: cloneJson(state.httpCollections.history)
              }
            : undefined,
          aiSettings: sections.includes('aiSettings')
            ? {
                settings: cloneJson(state.aiSettings.settings)
              }
            : undefined
        }
      } satisfies BackupDocument
    },
    async importBackup(input: BackupImportInput) {
      const parsed = JSON.parse(input.json) as BackupDocument
      const sections =
        input.sections && input.sections.length > 0 ? input.sections : parsed.sections ?? []
      if (sections.includes('commands') && parsed.data.commands) {
        state.commands = normalizeCommandsState({
          ...state.commands,
          tabs: parsed.data.commands.tabs,
          commands: parsed.data.commands.commands,
          updatedAt: nowIso()
        })
      }
      if (sections.includes('credentials') && parsed.data.credentials) {
        state.credentials = normalizeCredentialsState({
          ...state.credentials,
          credentials: parsed.data.credentials.credentials,
          updatedAt: nowIso()
        })
      }
      if (sections.includes('prompts') && parsed.data.prompts) {
        state.prompts = normalizePromptsState({
          ...state.prompts,
          categories: parsed.data.prompts.categories,
          templates: parsed.data.prompts.templates,
          updatedAt: nowIso()
        })
      }
      if (sections.includes('httpCollections') && parsed.data.httpCollections) {
        state.httpCollections = normalizeHttpState({
          ...state.httpCollections,
          collections: parsed.data.httpCollections.collections,
          requests: parsed.data.httpCollections.requests,
          environments: parsed.data.httpCollections.environments,
          history: parsed.data.httpCollections.history,
          updatedAt: nowIso()
        })
      }
      if (sections.includes('aiSettings') && parsed.data.aiSettings) {
        state.aiSettings = normalizeAiSettingsState({
          ...state.aiSettings,
          settings: parsed.data.aiSettings.settings,
          updatedAt: nowIso()
        })
      }
      saveAll()
      return {
        importedAt: nowIso(),
        sections,
        summary: buildBackupSummary(state)
      } satisfies BackupImportResult
    },
    async analyzeLegacyImport(json: string) {
      const parsed = JSON.parse(json) as JsonRecord
      const hasLegacyData =
        parsed.app === '狗狗百宝箱' &&
        parsed.data &&
        typeof parsed.data === 'object' &&
        !Array.isArray(parsed.data)
      if (hasLegacyData) {
        const data = parsed.data as JsonRecord
        return {
          sourceKind: 'doggy-toolbox-backup',
          sourceLabel: '旧项目总备份 JSON',
          availableSections: ['commands', 'credentials'],
          summary: {
            ...createEmptySummary(),
            commands: Array.isArray(data.commands) ? data.commands.length : 0,
            commandTabs: Array.isArray(data.tabs) ? data.tabs.length : 0,
            credentials: Array.isArray(data.credentials) ? data.credentials.length : 0
          },
          warnings: ['浏览器开发桥只做开发态导入，真实 Electron 导入逻辑请仍以主进程实现为准。']
        } satisfies LegacyImportAnalysis
      }
      if (Array.isArray(parsed.templates) && parsed.export_time) {
        return {
          sourceKind: 'doggy-toolbox-prompt-export',
          sourceLabel: '旧项目 Prompt 模板导出 JSON',
          availableSections: ['prompts'],
          summary: {
            ...createEmptySummary(),
            promptCategories: Array.isArray(parsed.categories) ? parsed.categories.length : 0,
            promptTemplates: parsed.templates.length
          },
          warnings: ['浏览器开发桥会按标题增量导入 Prompt 模板。']
        } satisfies LegacyImportAnalysis
      }
      throw new Error('暂不支持该 JSON 结构，请导入旧项目总备份或旧 Prompt 模板导出文件')
    },
    async importLegacyData(input: LegacyImportInput) {
      const analysis = await bridge.analyzeLegacyImport(input.json)
      const parsed = JSON.parse(input.json) as JsonRecord
      const sections =
        input.sections && input.sections.length > 0 ? input.sections : analysis.availableSections

      if (analysis.sourceKind === 'doggy-toolbox-backup') {
        const data = parsed.data as JsonRecord
        if (sections.includes('commands')) {
          state.commands = normalizeCommandsState({
            ...state.commands,
            tabs: (data.tabs as CommandTab[]) ?? [],
            commands: (data.commands as CommandRecord[]) ?? [],
            updatedAt: nowIso()
          })
        }
        if (sections.includes('credentials')) {
          state.credentials = normalizeCredentialsState({
            ...state.credentials,
            credentials: (data.credentials as CredentialRecord[]) ?? [],
            updatedAt: nowIso()
          })
        }
      } else if (analysis.sourceKind === 'doggy-toolbox-prompt-export') {
        await bridge.importPromptTemplates({
          json: input.json,
          overwrite: false
        })
      }
      saveAll()
      return {
        importedAt: nowIso(),
        sourceKind: analysis.sourceKind,
        sections,
        summary: buildBackupSummary(state),
        warnings: analysis.warnings
      } satisfies LegacyImportResult
    },
    async analyzeLegacySqliteImport(dbPath: string) {
      return {
        sourceKind: 'doggy-toolbox-sqlite-db',
        sourceLabel: '旧项目 SQLite 数据库',
        dbPath,
        availableSections: ['commands', 'credentials', 'prompts', 'httpCollections'],
        summary: createEmptySummary(),
        tables: [
          { name: 'command_tabs', rows: 0, mappedSection: 'commands' },
          { name: 'computer_commands', rows: 0, mappedSection: 'commands' },
          { name: 'credentials', rows: 0, mappedSection: 'credentials' },
          { name: 'prompt_categories', rows: 0, mappedSection: 'prompts' },
          { name: 'prompt_templates', rows: 0, mappedSection: 'prompts' },
          { name: 'http_collections', rows: 0, mappedSection: 'httpCollections' },
          { name: 'http_environments', rows: 0, mappedSection: 'httpCollections' }
        ],
        warnings: ['浏览器开发桥无法读取本机 SQLite；请在 Electron 桌面端执行真实分析。']
      } satisfies LegacySqliteImportAnalysis
    },
    async importLegacySqliteData(input: LegacySqliteImportInput) {
      const analysis = await bridge.analyzeLegacySqliteImport(input.dbPath)
      return {
        importedAt: nowIso(),
        sourceKind: 'doggy-toolbox-sqlite-db',
        sections:
          input.sections && input.sections.length > 0 ? input.sections : analysis.availableSections,
        summary: buildBackupSummary(state),
        warnings: analysis.warnings
      } satisfies LegacyImportResult
    }
  }

  window.doggy = bridge
}
