import { randomUUID } from 'node:crypto'
import type {
  BackupSectionKey,
  BackupSummary,
  CommandRecord,
  CommandTab,
  CredentialRecord,
  LegacyImportAnalysis,
  LegacyImportInput,
  LegacyImportResult,
  LegacyImportSourceKind,
  NodeRecord,
  PromptCategory,
  PromptTemplate
} from '../../shared/ipc-contract'
import type { CommandService } from './command-service'
import type { CredentialService } from './credential-service'
import type { NodeService } from './node-service'
import { parsePromptVariables } from './prompt-service'
import type { PromptService } from './prompt-service'

type LegacyBackupDocument = {
  version?: string
  app?: string
  exported_at?: string
  data?: {
    tabs?: Array<Record<string, unknown>>
    commands?: Array<Record<string, unknown>>
    credentials?: Array<Record<string, unknown>>
    nodes?: Array<Record<string, unknown>>
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
  nodeService: NodeService
  promptService: PromptService
}

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
    nodes: 0,
    httpCollections: 0,
    httpRequests: 0,
    httpEnvironments: 0,
    httpHistoryRecords: 0
  }
}

function sanitizeText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\r/g, '').trim() : ''
}

function sanitizeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => sanitizeText(item)).filter(Boolean)
}

function uniqueRequestedSections(
  availableSections: BackupSectionKey[],
  requestedSections?: BackupSectionKey[]
): BackupSectionKey[] {
  const requested =
    requestedSections && requestedSections.length > 0 ? requestedSections : availableSections
  return availableSections.filter((section) => requested.includes(section))
}

function parseImportJson(json: string): unknown {
  try {
    return JSON.parse(json)
  } catch (error) {
    throw new Error(`JSON 解析失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

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

function sanitizePort(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) {
    return 0
  }
  return Math.trunc(parsed)
}

function getNumberField(record: Record<string, unknown>, field: string): number | undefined {
  return typeof record[field] === 'number' ? record[field] : undefined
}

function extractLegacyNodeConfigText(node: Record<string, unknown>): string {
  const direct =
    sanitizeText(node.configText) || sanitizeText(node['config.yaml']) || sanitizeText(node.content)
  if (direct) {
    return direct
  }

  const config = node.config
  if (typeof config === 'string') {
    return sanitizeText(config)
  }

  if (config && typeof config === 'object' && !Array.isArray(config)) {
    const candidate = config as Record<string, unknown>
    const yaml = sanitizeText(candidate.yaml) || sanitizeText(candidate['config.yaml'])
    return yaml || JSON.stringify(candidate, null, 2)
  }

  return ''
}

function analyzeLegacyBackup(document: LegacyBackupDocument): LegacyImportAnalysis {
  const tabs = Array.isArray(document.data?.tabs) ? (document.data?.tabs ?? []) : []
  const commands = Array.isArray(document.data?.commands) ? (document.data?.commands ?? []) : []
  const credentials = Array.isArray(document.data?.credentials)
    ? (document.data?.credentials ?? [])
    : []
  const nodes = Array.isArray(document.data?.nodes) ? (document.data?.nodes ?? []) : []

  return {
    sourceKind: 'doggy-toolbox-backup',
    sourceLabel: '旧项目总备份 JSON',
    availableSections: ['commands', 'credentials', 'nodes'],
    summary: {
      ...createEmptySummary(),
      commands: commands.length,
      commandTabs: tabs.length,
      credentials: credentials.length,
      nodes: nodes.length
    },
    warnings: [
      '旧项目总备份不包含 Prompt 模板。',
      '旧项目总备份里的主题配置不会导入到新仓。',
      '导入命令、凭证或节点时会覆盖新项目当前对应模块数据。'
    ]
  }
}

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

  private async importLegacyBackup(
    document: LegacyBackupDocument,
    requestedSections?: BackupSectionKey[]
  ): Promise<LegacyImportResult> {
    const analysis = analyzeLegacyBackup(document)
    const sections = uniqueRequestedSections(analysis.availableSections, requestedSections)
    const summary = createEmptySummary()

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

    if (sections.includes('nodes')) {
      const mapped = this.mapLegacyNodes(document)
      const state = await this.dependencies.nodeService.restoreBackupSection(mapped)
      summary.nodes = state.nodes.length
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

  private mapLegacyNodes(document: LegacyBackupDocument): Pick<{ nodes: NodeRecord[] }, 'nodes'> {
    const legacyNodes = Array.isArray(document.data?.nodes) ? (document.data?.nodes ?? []) : []
    const timestamp = nowIso()

    return {
      nodes: legacyNodes.map((node, index) => ({
        id: randomUUID(),
        name: sanitizeText(node.name) || sanitizeText(node.title) || `导入节点 ${index + 1}`,
        type: sanitizeText(node.type) || 'custom',
        server: sanitizeText(node.server),
        port: sanitizePort(node.port),
        rawLink: sanitizeText(node.raw_link ?? node.rawLink),
        configText: extractLegacyNodeConfigText(node),
        tags: sanitizeArray(node.tags),
        order: getNumberField(node, 'order') ?? getNumberField(node, 'order_index') ?? index,
        createdAt: timestamp,
        updatedAt: timestamp
      }))
    }
  }
}
