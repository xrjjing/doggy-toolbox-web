import type {
  BackupDocument,
  BackupExportInput,
  BackupImportInput,
  BackupImportResult,
  BackupSectionKey,
  BackupSummary
} from '../../shared/ipc-contract'
import type { CommandService } from './command-service'
import type { CredentialService } from './credential-service'
import type { HttpCollectionService } from './http-collection-service'
import type { NodeService } from './node-service'
import type { PromptService } from './prompt-service'

const DEFAULT_SECTIONS: BackupSectionKey[] = [
  'commands',
  'credentials',
  'prompts',
  'nodes',
  'httpCollections'
]

export type BackupServiceDependencies = {
  commandService: CommandService
  credentialService: CredentialService
  httpCollectionService: HttpCollectionService
  nodeService: NodeService
  promptService: PromptService
}

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
    nodes: 0,
    httpCollections: 0,
    httpRequests: 0,
    httpEnvironments: 0,
    httpHistoryRecords: 0
  }
}

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

    if (sections.includes('nodes')) {
      data.nodes = await this.dependencies.nodeService.exportBackupSection()
      summary.nodes = data.nodes.nodes.length
    }

    if (sections.includes('httpCollections')) {
      data.httpCollections = await this.dependencies.httpCollectionService.exportBackupSection()
      summary.httpCollections = data.httpCollections.collections.length
      summary.httpRequests = data.httpCollections.requests.length
      summary.httpEnvironments = data.httpCollections.environments.length
      summary.httpHistoryRecords = data.httpCollections.history.length
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

    if (sections.includes('nodes') && parsed.data.nodes) {
      const state = await this.dependencies.nodeService.restoreBackupSection(parsed.data.nodes)
      summary.nodes = state.nodes.length
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

    return {
      importedAt: new Date().toISOString(),
      sections,
      summary
    }
  }
}
