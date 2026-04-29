import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type {
  BackupSectionKey,
  BackupSummary,
  CommandRecord,
  CommandTab,
  CredentialRecord,
  HttpAuth,
  HttpBody,
  HttpCollection,
  HttpEnvironment,
  HttpKeyValue,
  HttpMethod,
  HttpRequestRecord,
  LegacyImportAnalysis,
  LegacyImportInput,
  LegacyImportResult,
  LegacyImportSourceKind,
  LegacySqliteImportAnalysis,
  LegacySqliteImportInput,
  PromptCategory,
  PromptTemplate
} from '../../shared/ipc-contract'
import type { CommandService } from './command-service'
import type { CredentialService } from './credential-service'
import type { HttpCollectionService } from './http-collection-service'
import { parsePromptVariables } from '../../shared/prompt-template-core'
import type { PromptService } from './prompt-service'

type LegacyBackupDocument = {
  version?: string
  app?: string
  exported_at?: string
  data?: {
    tabs?: Array<Record<string, unknown>>
    commands?: Array<Record<string, unknown>>
    credentials?: Array<Record<string, unknown>>
  }
}

type LegacyPromptExportDocument = {
  version?: string
  export_time?: string
  categories?: Array<Record<string, unknown>>
  templates?: Array<Record<string, unknown>>
}

export type LegacyImportServiceDependencies = {
  commandService: CommandService
  credentialService: CredentialService
  httpCollectionService: HttpCollectionService
  promptService: PromptService
}

type SqliteRow = Record<string, unknown>

type SqliteTablePlan = {
  table: string
  section?: BackupSectionKey
}

const execFileAsync = promisify(execFile)
const SQLITE_TABLE_PLAN: SqliteTablePlan[] = [
  { table: 'command_tabs', section: 'commands' },
  { table: 'computer_commands', section: 'commands' },
  { table: 'credentials', section: 'credentials' },
  { table: 'prompt_categories', section: 'prompts' },
  { table: 'prompt_templates', section: 'prompts' },
  { table: 'http_collections', section: 'httpCollections' },
  { table: 'http_environments', section: 'httpCollections' }
]

/**
 * 先把“JSON 非法”和“结构不支持”两类问题区分开，
 * 这样 UI 才能给出更准确的导入失败原因。
 */
function nowIso(): string {
  return new Date().toISOString()
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

function sanitizeText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\r/g, '').trim() : ''
}

function sanitizeLooseText(value: unknown): string {
  if (typeof value === 'string') return value.replace(/\r/g, '').trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function sanitizeIso(value: unknown, fallback: string): string {
  const text = sanitizeLooseText(value)
  if (!text) return fallback
  const normalized = text.includes('T') ? text : text.replace(' ', 'T')
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

function sanitizeOrder(value: unknown, fallback: number): number {
  const order = Number(value)
  return Number.isFinite(order) ? order : fallback
}

function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (Array.isArray(value) || (value && typeof value === 'object')) return value as T
  if (typeof value !== 'string' || !value.trim()) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function sanitizeArray(value: unknown): string[] {
  const source = typeof value === 'string' ? parseJsonValue<unknown[]>(value, []) : value
  if (!Array.isArray(source)) return []
  return source.map((item) => sanitizeLooseText(item)).filter(Boolean)
}

function uniqueRequestedSections(
  availableSections: BackupSectionKey[],
  requestedSections?: BackupSectionKey[]
): BackupSectionKey[] {
  const requested =
    requestedSections && requestedSections.length > 0 ? requestedSections : availableSections
  return availableSections.filter((section) => requested.includes(section))
}

/**
 * 导入流程先只做 JSON 解析，不在这一步推断业务结构，
 * 便于把“语法错误”和“格式不支持”拆成两类错误提示。
 */
function parseImportJson(json: string): unknown {
  try {
    return JSON.parse(json)
  } catch (error) {
    throw new Error(`JSON 解析失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

async function runSqliteJson<T extends SqliteRow>(
  dbPath: string,
  sql: string
): Promise<T[]> {
  const { stdout } = await execFileAsync('sqlite3', ['-readonly', '-json', dbPath, sql], {
    maxBuffer: 8 * 1024 * 1024
  })
  const text = stdout.trim()
  if (!text) return []
  return JSON.parse(text) as T[]
}

function tableCountSql(tables: string[]): string {
  return tables
    .map(
      (table) =>
        `select '${table.replace(/'/g, "''")}' as name, count(*) as rows from ${table}`
    )
    .join(' union all ')
}

function normalizeHttpMethod(value: unknown): HttpMethod {
  const method = sanitizeText(value).toUpperCase()
  const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
  return methods.includes(method as HttpMethod) ? (method as HttpMethod) : 'GET'
}

function normalizeHttpKeyValues(value: unknown): HttpKeyValue[] {
  return parseJsonValue<Array<Partial<HttpKeyValue>>>(value, [])
    .map((item) => ({
      id: sanitizeText(item.id) || randomUUID(),
      key: sanitizeLooseText(item.key),
      value: sanitizeLooseText(item.value),
      enabled: item.enabled !== false,
      description: sanitizeLooseText(item.description)
    }))
    .filter((item) => item.key || item.value)
}

function normalizeHttpBody(value: unknown): HttpBody {
  const body = parseJsonValue<Partial<HttpBody>>(value, {})
  const type = body.type
  return {
    type: type === 'json' || type === 'text' || type === 'form' ? type : 'none',
    content: sanitizeLooseText(body.content)
  }
}

function normalizeHttpAuth(value: unknown): HttpAuth {
  const auth = parseJsonValue<Partial<HttpAuth>>(value, {})
  const type = auth.type
  return {
    type: type === 'bearer' || type === 'basic' ? type : 'none',
    token: sanitizeLooseText(auth.token),
    username: sanitizeLooseText(auth.username),
    password: sanitizeLooseText(auth.password)
  }
}

/**
 * 当前仅兼容两类旧数据：
 * 1. 旧项目总备份。
 * 2. 旧 Prompt 模板导出。
 *
 * 主题等 UI 配置不在这里导入，因为新仓没有沿用旧仓的同构持久化结构。
 */
function detectSourceKind(payload: unknown): LegacyImportSourceKind {
  if (!payload || typeof payload !== 'object') {
    throw new Error('导入内容不是有效 JSON 对象')
  }

  const candidate = payload as Record<string, unknown>

  if (candidate.app === '狗狗百宝箱' && candidate.data && typeof candidate.data === 'object') {
    return 'doggy-toolbox-backup'
  }

  if (Array.isArray(candidate.templates) && 'export_time' in candidate) {
    return 'doggy-toolbox-prompt-export'
  }

  throw new Error('暂不支持该 JSON 结构，请导入旧项目总备份或旧 Prompt 模板导出文件')
}

/**
 * analyze 只做影响评估，不执行真实写入。
 * 这样 renderer 可以先展示“会覆盖哪些模块、哪些不会导入”。
 */
function analyzeLegacyBackup(document: LegacyBackupDocument): LegacyImportAnalysis {
  const tabs = Array.isArray(document.data?.tabs) ? (document.data?.tabs ?? []) : []
  const commands = Array.isArray(document.data?.commands) ? (document.data?.commands ?? []) : []
  const credentials = Array.isArray(document.data?.credentials)
    ? (document.data?.credentials ?? [])
    : []
  return {
    sourceKind: 'doggy-toolbox-backup',
    sourceLabel: '旧项目总备份 JSON',
    availableSections: ['commands', 'credentials'],
    summary: {
      ...createEmptySummary(),
      commands: commands.length,
      commandTabs: tabs.length,
      credentials: credentials.length
    },
    warnings: [
      '旧项目总备份不包含 Prompt 模板。',
      '旧项目总备份里的主题配置不会导入到新仓。',
      '导入命令或凭证时会覆盖新项目当前对应模块数据。'
    ]
  }
}

/**
 * Prompt 导出的导入策略更偏向增量合并，而不是整库覆盖。
 */
function analyzeLegacyPromptExport(document: LegacyPromptExportDocument): LegacyImportAnalysis {
  const categories = Array.isArray(document.categories) ? document.categories : []
  const templates = Array.isArray(document.templates) ? document.templates : []

  return {
    sourceKind: 'doggy-toolbox-prompt-export',
    sourceLabel: '旧项目 Prompt 模板导出 JSON',
    availableSections: ['prompts'],
    summary: {
      ...createEmptySummary(),
      promptCategories: categories.length,
      promptTemplates: templates.length
    },
    warnings: [
      '旧 Prompt 导出会按分类名称和模板标题做合并导入。',
      '同名模板默认跳过，不直接覆盖现有模板。'
    ]
  }
}

/**
 * 旧数据导入编排层。
 * 它把来源识别、预分析和真实导入拆开，避免导入流程变成不可解释的黑箱。
 */
export class LegacyImportService {
  constructor(private readonly dependencies: LegacyImportServiceDependencies) {}

  async analyze(json: string): Promise<LegacyImportAnalysis> {
    const payload = parseImportJson(json)
    const sourceKind = detectSourceKind(payload)

    if (sourceKind === 'doggy-toolbox-backup') {
      return analyzeLegacyBackup(payload as LegacyBackupDocument)
    }

    return analyzeLegacyPromptExport(payload as LegacyPromptExportDocument)
  }

  async import(input: LegacyImportInput): Promise<LegacyImportResult> {
    const payload = parseImportJson(input.json)
    const sourceKind = detectSourceKind(payload)

    if (sourceKind === 'doggy-toolbox-backup') {
      return this.importLegacyBackup(payload as LegacyBackupDocument, input.sections)
    }

    return this.importLegacyPromptExport(payload as LegacyPromptExportDocument, input.sections)
  }

  async analyzeSqlite(dbPath: string): Promise<LegacySqliteImportAnalysis> {
    const normalizedPath = sanitizeText(dbPath)
    if (!normalizedPath) {
      throw new Error('SQLite DB 路径不能为空')
    }
    if (!existsSync(normalizedPath)) {
      throw new Error(`SQLite DB 不存在：${normalizedPath}`)
    }

    const tableCounts = await runSqliteJson<{ name: string; rows: number }>(
      normalizedPath,
      tableCountSql(SQLITE_TABLE_PLAN.map((item) => item.table))
    )
    const countMap = new Map(tableCounts.map((item) => [item.name, Number(item.rows) || 0]))
    const sections = new Set<BackupSectionKey>()
    for (const plan of SQLITE_TABLE_PLAN) {
      if (plan.section && (countMap.get(plan.table) ?? 0) > 0) {
        sections.add(plan.section)
      }
    }

    return {
      sourceKind: 'doggy-toolbox-sqlite-db',
      sourceLabel: '旧项目 SQLite 数据库',
      dbPath: normalizedPath,
      availableSections: ['commands', 'credentials', 'prompts', 'httpCollections'].filter(
        (section): section is BackupSectionKey => sections.has(section as BackupSectionKey)
      ),
      summary: {
        ...createEmptySummary(),
        commandTabs: countMap.get('command_tabs') ?? 0,
        commands: countMap.get('computer_commands') ?? 0,
        credentials: countMap.get('credentials') ?? 0,
        promptCategories: countMap.get('prompt_categories') ?? 0,
        promptTemplates: countMap.get('prompt_templates') ?? 0,
        httpCollections: countMap.get('http_collections') ?? 0,
        httpEnvironments: countMap.get('http_environments') ?? 0
      },
      tables: SQLITE_TABLE_PLAN.map((plan) => ({
        name: plan.table,
        rows: countMap.get(plan.table) ?? 0,
        mappedSection: plan.section
      })),
      warnings: [
        '当前识别仅做只读扫描，不会修改新项目数据。',
        '执行导入时会按模块覆盖新项目对应资料库，请先生成备份。',
        '旧库 HTTP request 行会映射到新项目 HTTP 集合，请导入后检查请求详情。'
      ]
    }
  }

  async importSqlite(input: LegacySqliteImportInput): Promise<LegacyImportResult> {
    const analysis = await this.analyzeSqlite(input.dbPath)
    const sections = uniqueRequestedSections(analysis.availableSections, input.sections)
    const summary = createEmptySummary()
    const timestamp = nowIso()

    if (sections.includes('commands')) {
      const mapped = await this.mapSqliteCommands(analysis.dbPath, timestamp)
      const state = await this.dependencies.commandService.restoreBackupSection(mapped)
      summary.commandTabs = state.tabs.length
      summary.commands = state.commands.length
    }

    if (sections.includes('credentials')) {
      const mapped = await this.mapSqliteCredentials(analysis.dbPath, timestamp)
      const state = await this.dependencies.credentialService.restoreBackupSection(mapped)
      summary.credentials = state.credentials.length
    }

    if (sections.includes('prompts')) {
      const mapped = await this.mapSqlitePrompts(analysis.dbPath, timestamp)
      const state = await this.dependencies.promptService.restoreBackupSection(mapped)
      summary.promptCategories = state.categories.length
      summary.promptTemplates = state.templates.length
    }

    if (sections.includes('httpCollections')) {
      const mapped = await this.mapSqliteHttpCollections(analysis.dbPath, timestamp)
      const state = await this.dependencies.httpCollectionService.restoreBackupSection(mapped)
      summary.httpCollections = state.collections.length
      summary.httpRequests = state.requests.length
      summary.httpEnvironments = state.environments.length
      summary.httpHistoryRecords = state.history.length
    }

    return {
      importedAt: timestamp,
      sourceKind: 'doggy-toolbox-sqlite-db',
      sections,
      summary,
      warnings: analysis.warnings
    }
  }

  private async importLegacyBackup(
    document: LegacyBackupDocument,
    requestedSections?: BackupSectionKey[]
  ): Promise<LegacyImportResult> {
    const analysis = analyzeLegacyBackup(document)
    const sections = uniqueRequestedSections(analysis.availableSections, requestedSections)
    const summary = createEmptySummary()

    // 旧总备份导入的语义是按模块整体恢复，会覆盖当前对应模块状态。
    if (sections.includes('commands')) {
      const mapped = this.mapLegacyCommands(document)
      const state = await this.dependencies.commandService.restoreBackupSection(mapped)
      summary.commands = state.commands.length
      summary.commandTabs = state.tabs.length
    }

    if (sections.includes('credentials')) {
      const mapped = this.mapLegacyCredentials(document)
      const state = await this.dependencies.credentialService.restoreBackupSection(mapped)
      summary.credentials = state.credentials.length
    }

    return {
      importedAt: nowIso(),
      sourceKind: analysis.sourceKind,
      sections,
      summary,
      warnings: analysis.warnings
    }
  }

  private async importLegacyPromptExport(
    document: LegacyPromptExportDocument,
    requestedSections?: BackupSectionKey[]
  ): Promise<LegacyImportResult> {
    const analysis = analyzeLegacyPromptExport(document)
    const sections = uniqueRequestedSections(analysis.availableSections, requestedSections)
    const summary = createEmptySummary()
    const timestamp = nowIso()

    if (sections.includes('prompts')) {
      const current = await this.dependencies.promptService.getState()
      const categories = [...current.categories]
      const templates = [...current.templates]
      const categoryIdMap = new Map<string, string>()

      for (const category of Array.isArray(document.categories) ? document.categories : []) {
        const name = sanitizeText(category.name)
        if (!name) continue

        const existing = categories.find((item) => item.name === name)
        if (existing) {
          // 分类按名称合并，避免重复导入时不断创建同名分类。
          categoryIdMap.set(sanitizeText(category.id), existing.id)
          continue
        }

        const created: PromptCategory = {
          id: randomUUID(),
          name,
          icon: sanitizeText(category.icon),
          order: categories.reduce((maxOrder, item) => Math.max(maxOrder, item.order), -1) + 1,
          createdAt: timestamp,
          updatedAt: timestamp
        }
        categories.push(created)
        categoryIdMap.set(sanitizeText(category.id), created.id)
      }

      for (const template of Array.isArray(document.templates) ? document.templates : []) {
        const title = sanitizeText(template.title)
        const content = sanitizeText(template.content)
        if (!title || !content) continue
        if (templates.some((item) => item.title === title)) {
          // 模板按标题跳过重复项，尽量保证重复导入时是幂等的。
          continue
        }

        const resolvedCategoryId = categoryIdMap.get(sanitizeText(template.category_id)) ?? ''
        const created: PromptTemplate = {
          id: randomUUID(),
          title,
          content,
          categoryId: resolvedCategoryId,
          description: sanitizeText(template.description),
          tags: sanitizeArray(template.tags),
          variables: parsePromptVariables(content),
          isFavorite: false,
          isSystem: false,
          usageCount: 0,
          order: templates.reduce((maxOrder, item) => Math.max(maxOrder, item.order), -1) + 1,
          createdAt: timestamp,
          updatedAt: timestamp
        }
        templates.push(created)
      }

      const state = await this.dependencies.promptService.restoreBackupSection({
        categories,
        templates
      })
      summary.promptCategories = state.categories.length
      summary.promptTemplates = state.templates.length
    }

    return {
      importedAt: timestamp,
      sourceKind: analysis.sourceKind,
      sections,
      summary,
      warnings: analysis.warnings
    }
  }

  private mapLegacyCommands(
    document: LegacyBackupDocument
  ): Pick<{ tabs: CommandTab[]; commands: CommandRecord[] }, 'tabs' | 'commands'> {
    const legacyTabs = Array.isArray(document.data?.tabs) ? (document.data?.tabs ?? []) : []
    const legacyCommands = Array.isArray(document.data?.commands)
      ? (document.data?.commands ?? [])
      : []
    const timestamp = nowIso()
    const tabIdMap = new Map<string, string>()
    const tabs: CommandTab[] = [
      {
        id: 'default',
        name: '默认分组',
        order: 0,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ]

    for (const [index, tab] of legacyTabs.entries()) {
      const legacyId = sanitizeText(tab.id)
      const name = sanitizeText(tab.name)

      if (!legacyId || legacyId === '0') {
        // 旧仓默认分组常见是空值或 0，这里统一折叠到新仓 default。
        tabIdMap.set(legacyId || '0', 'default')
        continue
      }

      const id = randomUUID()
      tabIdMap.set(legacyId, id)
      tabs.push({
        id,
        name: name || `导入页签 ${index + 1}`,
        order: tabs.length,
        createdAt: timestamp,
        updatedAt: timestamp
      })
    }

    const commands: CommandRecord[] = legacyCommands.map((command, index) => {
      const legacyTabId = sanitizeText(command.tab_id)
      return {
        id: randomUUID(),
        title: sanitizeText(command.title) || `导入命令 ${index + 1}`,
        description: sanitizeText(command.description),
        lines: sanitizeArray(command.commands),
        tabId: tabIdMap.get(legacyTabId) ?? 'default',
        tags: sanitizeArray(command.tags),
        order: typeof command.order === 'number' ? command.order : index,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    })

    return { tabs, commands }
  }

  private mapLegacyCredentials(
    document: LegacyBackupDocument
  ): Pick<{ credentials: CredentialRecord[] }, 'credentials'> {
    const legacyCredentials = Array.isArray(document.data?.credentials)
      ? (document.data?.credentials ?? [])
      : []
    const timestamp = nowIso()

    return {
      credentials: legacyCredentials.map((credential, index) => ({
        id: randomUUID(),
        service: sanitizeText(credential.service) || `导入凭证 ${index + 1}`,
        url: sanitizeText(credential.url),
        account: sanitizeText(credential.account),
        password: sanitizeText(credential.password),
        extra: sanitizeArray(credential.extra),
        order: typeof credential.order === 'number' ? credential.order : index,
        createdAt: timestamp,
        updatedAt: timestamp
      }))
    }
  }

  private async mapSqliteCommands(
    dbPath: string,
    timestamp: string
  ): Promise<Pick<{ tabs: CommandTab[]; commands: CommandRecord[] }, 'tabs' | 'commands'>> {
    const tabRows = await runSqliteJson<SqliteRow>(
      dbPath,
      'select * from command_tabs order by order_index asc, created_at asc'
    )
    const commandRows = await runSqliteJson<SqliteRow>(
      dbPath,
      'select * from computer_commands order by tab_id asc, order_index asc, created_at asc'
    )
    const tabIdMap = new Map<string, string>()
    const tabs: CommandTab[] = []

    for (const [index, row] of tabRows.entries()) {
      const legacyId = sanitizeLooseText(row.id)
      const id = legacyId && legacyId !== '0' ? `legacy-tab-${legacyId}` : 'default'
      tabIdMap.set(legacyId || '0', id)
      if (tabs.some((tab) => tab.id === id)) continue
      tabs.push({
        id,
        name: sanitizeLooseText(row.name) || (id === 'default' ? '默认分组' : `导入分组 ${index + 1}`),
        order: sanitizeOrder(row.order_index, index),
        createdAt: sanitizeIso(row.created_at, timestamp),
        updatedAt: sanitizeIso(row.updated_at, timestamp)
      })
    }

    if (!tabs.some((tab) => tab.id === 'default')) {
      tabs.unshift({
        id: 'default',
        name: '默认分组',
        order: 0,
        createdAt: timestamp,
        updatedAt: timestamp
      })
      tabIdMap.set('0', 'default')
    }

    const commands: CommandRecord[] = commandRows.map((row, index) => {
      const legacyTabId = sanitizeLooseText(row.tab_id)
      return {
        id: `legacy-command-${sanitizeLooseText(row.id) || randomUUID()}`,
        title: sanitizeLooseText(row.title) || `导入命令 ${index + 1}`,
        description: sanitizeLooseText(row.description),
        lines: sanitizeArray(row.commands),
        tabId: tabIdMap.get(legacyTabId) ?? 'default',
        tags: sanitizeArray(row.tags),
        order: sanitizeOrder(row.order_index, index),
        createdAt: sanitizeIso(row.created_at, timestamp),
        updatedAt: sanitizeIso(row.updated_at, timestamp)
      }
    })

    return { tabs, commands }
  }

  private async mapSqliteCredentials(
    dbPath: string,
    timestamp: string
  ): Promise<Pick<{ credentials: CredentialRecord[] }, 'credentials'>> {
    const rows = await runSqliteJson<SqliteRow>(
      dbPath,
      'select * from credentials order by order_index asc, created_at asc'
    )
    return {
      credentials: rows.map((row, index) => ({
        id: `legacy-credential-${sanitizeLooseText(row.id) || randomUUID()}`,
        service: sanitizeLooseText(row.service) || `导入凭证 ${index + 1}`,
        url: sanitizeLooseText(row.url),
        account: sanitizeLooseText(row.account),
        password: sanitizeLooseText(row.password),
        extra: sanitizeArray(row.extra),
        order: sanitizeOrder(row.order_index, index),
        createdAt: sanitizeIso(row.created_at, timestamp),
        updatedAt: sanitizeIso(row.updated_at, timestamp)
      }))
    }
  }

  private async mapSqlitePrompts(
    dbPath: string,
    timestamp: string
  ): Promise<Pick<{ categories: PromptCategory[]; templates: PromptTemplate[] }, 'categories' | 'templates'>> {
    const categoryRows = await runSqliteJson<SqliteRow>(
      dbPath,
      'select * from prompt_categories order by order_index asc, created_at asc'
    )
    const templateRows = await runSqliteJson<SqliteRow>(
      dbPath,
      'select * from prompt_templates order by category_id asc, order_index asc, created_at asc'
    )
    const categoryIds = new Set(categoryRows.map((row) => sanitizeLooseText(row.id)).filter(Boolean))
    const categories: PromptCategory[] = categoryRows.map((row, index) => ({
      id: sanitizeLooseText(row.id) || `legacy-prompt-category-${randomUUID()}`,
      name: sanitizeLooseText(row.name) || `导入分类 ${index + 1}`,
      icon: sanitizeLooseText(row.icon),
      order: sanitizeOrder(row.order_index, index),
      createdAt: sanitizeIso(row.created_at, timestamp),
      updatedAt: sanitizeIso(row.updated_at, timestamp)
    }))
    const templates: PromptTemplate[] = templateRows.map((row, index) => {
      const content = sanitizeLooseText(row.content)
      const categoryId = sanitizeLooseText(row.category_id)
      return {
        id: sanitizeLooseText(row.id) || `legacy-prompt-template-${randomUUID()}`,
        title: sanitizeLooseText(row.title) || `导入模板 ${index + 1}`,
        content,
        categoryId: categoryIds.has(categoryId) ? categoryId : '',
        description: sanitizeLooseText(row.description),
        tags: sanitizeArray(row.tags),
        variables: parsePromptVariables(content),
        isFavorite: Number(row.is_favorite) === 1,
        isSystem: Number(row.is_system) === 1,
        usageCount: sanitizeOrder(row.usage_count, 0),
        order: sanitizeOrder(row.order_index, index),
        createdAt: sanitizeIso(row.created_at, timestamp),
        updatedAt: sanitizeIso(row.updated_at, timestamp)
      }
    })
    return { categories, templates }
  }

  private async mapSqliteHttpCollections(
    dbPath: string,
    timestamp: string
  ): Promise<{
    collections: HttpCollection[]
    requests: HttpRequestRecord[]
    environments: HttpEnvironment[]
    history: []
  }> {
    const collectionRows = await runSqliteJson<SqliteRow>(
      dbPath,
      'select * from http_collections order by parent_id asc, order_index asc, created_at asc'
    )
    const environmentRows = await runSqliteJson<SqliteRow>(
      dbPath,
      'select * from http_environments order by created_at asc'
    )
    const folderRows = collectionRows.filter((row) => sanitizeLooseText(row.type) !== 'request')
    const requestRows = collectionRows.filter((row) => sanitizeLooseText(row.type) === 'request')
    const collections: HttpCollection[] = [
      {
        id: 'default',
        name: '默认集合',
        description: '旧 SQLite 导入兜底集合。',
        order: 0,
        createdAt: timestamp,
        updatedAt: timestamp
      },
      ...folderRows.map((row, index) => ({
        id: `legacy-http-collection-${sanitizeLooseText(row.id) || randomUUID()}`,
        name: sanitizeLooseText(row.name) || `导入集合 ${index + 1}`,
        description: sanitizeLooseText(row.description),
        order: sanitizeOrder(row.order_index, index + 1),
        createdAt: sanitizeIso(row.created_at, timestamp),
        updatedAt: sanitizeIso(row.updated_at, timestamp)
      }))
    ]
    const folderIdMap = new Map<string, string>()
    for (const row of folderRows) {
      const legacyId = sanitizeLooseText(row.id)
      if (legacyId) {
        folderIdMap.set(legacyId, `legacy-http-collection-${legacyId}`)
      }
    }
    const requests: HttpRequestRecord[] = requestRows.map((row, index) => {
      const data = parseJsonValue<SqliteRow>(row.data, {})
      const legacyParentId = sanitizeLooseText(row.parent_id)
      return {
        id: `legacy-http-request-${sanitizeLooseText(row.id) || randomUUID()}`,
        collectionId: folderIdMap.get(legacyParentId) ?? 'default',
        name: sanitizeLooseText(data.name) || sanitizeLooseText(row.name) || `导入请求 ${index + 1}`,
        method: normalizeHttpMethod(data.method),
        url: sanitizeLooseText(data.url),
        description: sanitizeLooseText(data.description ?? row.description),
        headers: normalizeHttpKeyValues(data.headers),
        params: normalizeHttpKeyValues(data.params),
        body: normalizeHttpBody(data.body),
        auth: normalizeHttpAuth(data.auth),
        tags: sanitizeArray(data.tags),
        order: sanitizeOrder(row.order_index, index),
        createdAt: sanitizeIso(row.created_at, timestamp),
        updatedAt: sanitizeIso(row.updated_at, timestamp)
      }
    })
    const environments: HttpEnvironment[] = environmentRows.map((row, index) => ({
      id: `legacy-http-env-${sanitizeLooseText(row.id) || randomUUID()}`,
      name: sanitizeLooseText(row.name) || `导入环境 ${index + 1}`,
      variables: normalizeHttpKeyValues(row.variables),
      order: index,
      createdAt: sanitizeIso(row.created_at, timestamp),
      updatedAt: sanitizeIso(row.updated_at, timestamp)
    }))
    return { collections, requests, environments, history: [] }
  }
}
