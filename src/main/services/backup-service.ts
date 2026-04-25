import type {
  BackupDocument,
  BackupExportInput,
  BackupImportInput,
  BackupImportResult,
  BackupSectionKey,
  BackupSummary
} from '../../shared/ipc-contract'
import type { AiSettingsService } from './ai-settings-service'
import type { CommandService } from './command-service'
import type { CredentialService } from './credential-service'
import type { HttpCollectionService } from './http-collection-service'
import type { PromptService } from './prompt-service'

const DEFAULT_SECTIONS: BackupSectionKey[] = [
  'commands',
  'credentials',
  'prompts',
  'httpCollections',
  'aiSettings'
]

/**
 * 备份服务只依赖各模块对外暴露的导出/恢复方法，
 * 不直接读取底层 JSON 文件，避免耦合内部存储细节。
 */
export type BackupServiceDependencies = {
  aiSettingsService: AiSettingsService
  commandService: CommandService
  credentialService: CredentialService
  httpCollectionService: HttpCollectionService
  promptService: PromptService
}

/**
 * 用户可选部分模块；未指定时默认导出/导入所有支持的 section。
 */
function uniqueSections(sections: BackupSectionKey[] | undefined): BackupSectionKey[] {
  const requested = sections && sections.length > 0 ? sections : DEFAULT_SECTIONS
  return DEFAULT_SECTIONS.filter((section) => requested.includes(section))
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

/**
 * 这里只做协议级校验。
 * 具体字段兼容由各模块自己的 restore 逻辑继续归一化。
 */
function assertBackupDocument(value: unknown): BackupDocument {
  if (!value || typeof value !== 'object') {
    throw new Error('备份内容不是有效 JSON 对象')
  }

  const candidate = value as BackupDocument
  if (candidate.app !== 'doggy-toolbox-web' || candidate.version !== '1.0' || !candidate.data) {
    throw new Error('备份文件版本或应用标识不匹配')
  }

  return candidate
}

/**
 * 统一备份编排层。
 * 负责把多模块状态拼成一份稳定文档，并在导入时按 section 分发回各模块。
 */
export class BackupService {
  constructor(private readonly dependencies: BackupServiceDependencies) {}

  async exportBackup(input: BackupExportInput = {}): Promise<BackupDocument> {
    const sections = uniqueSections(input.sections)
    const summary = createEmptySummary()
    const data: BackupDocument['data'] = {}

    if (sections.includes('commands')) {
      data.commands = await this.dependencies.commandService.exportBackupSection()
      summary.commands = data.commands.commands.length
      summary.commandTabs = data.commands.tabs.length
    }

    if (sections.includes('credentials')) {
      data.credentials = await this.dependencies.credentialService.exportBackupSection()
      summary.credentials = data.credentials.credentials.length
    }

    if (sections.includes('prompts')) {
      data.prompts = await this.dependencies.promptService.exportBackupSection()
      summary.promptCategories = data.prompts.categories.length
      summary.promptTemplates = data.prompts.templates.length
    }

    if (sections.includes('httpCollections')) {
      data.httpCollections = await this.dependencies.httpCollectionService.exportBackupSection()
      summary.httpCollections = data.httpCollections.collections.length
      summary.httpRequests = data.httpCollections.requests.length
      summary.httpEnvironments = data.httpCollections.environments.length
      summary.httpHistoryRecords = data.httpCollections.history.length
    }

    if (sections.includes('aiSettings')) {
      data.aiSettings = await this.dependencies.aiSettingsService.exportBackupSection()
      summary.aiSettings = 1
    }

    return {
      version: '1.0',
      app: 'doggy-toolbox-web',
      exportedAt: new Date().toISOString(),
      sections,
      summary,
      data
    }
  }

  async importBackup(input: BackupImportInput): Promise<BackupImportResult> {
    // JSON 解析失败直接中断，避免出现“部分恢复成功”的不清晰状态。
    const parsed = assertBackupDocument(JSON.parse(input.json))
    const sections = uniqueSections(input.sections ?? parsed.sections)
    const summary = createEmptySummary()

    if (sections.includes('commands') && parsed.data.commands) {
      const state = await this.dependencies.commandService.restoreBackupSection(
        parsed.data.commands
      )
      summary.commands = state.commands.length
      summary.commandTabs = state.tabs.length
    }

    if (sections.includes('credentials') && parsed.data.credentials) {
      const state = await this.dependencies.credentialService.restoreBackupSection(
        parsed.data.credentials
      )
      summary.credentials = state.credentials.length
    }

    if (sections.includes('prompts') && parsed.data.prompts) {
      const state = await this.dependencies.promptService.restoreBackupSection(parsed.data.prompts)
      summary.promptCategories = state.categories.length
      summary.promptTemplates = state.templates.length
    }

    if (sections.includes('httpCollections') && parsed.data.httpCollections) {
      const state = await this.dependencies.httpCollectionService.restoreBackupSection(
        parsed.data.httpCollections
      )
      summary.httpCollections = state.collections.length
      summary.httpRequests = state.requests.length
      summary.httpEnvironments = state.environments.length
      summary.httpHistoryRecords = state.history.length
    }

    if (sections.includes('aiSettings') && parsed.data.aiSettings) {
      await this.dependencies.aiSettingsService.restoreBackupSection(parsed.data.aiSettings)
      summary.aiSettings = 1
    }

    return {
      importedAt: new Date().toISOString(),
      sections,
      summary
    }
  }
}
