import { randomUUID } from 'node:crypto'
import type {
  CommandImportInput,
  CommandImportResult,
  CommandMoveInput,
  CommandReorderInput,
  CommandModuleState,
  CommandRecord,
  CommandSaveInput,
  CommandTab,
  CommandTabSaveInput
} from '../../shared/ipc-contract'
import { ensureAppDataLayout, resolveAppDataPaths } from './app-data'
import { SqliteDocumentRepository } from './sqlite-document-repository'

type StoredCommandState = {
  version: number
  updatedAt: string
  tabs: CommandTab[]
  commands: CommandRecord[]
}

const DEFAULT_TAB_ID = 'default'

function nowIso(): string {
  return new Date().toISOString()
}

function createDefaultTab(timestamp: string): CommandTab {
  return {
    id: DEFAULT_TAB_ID,
    name: '默认分组',
    order: 0,
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

function createDefaultState(): StoredCommandState {
  const timestamp = nowIso()
  return {
    version: 1,
    updatedAt: timestamp,
    tabs: [createDefaultTab(timestamp)],
    commands: []
  }
}

function sanitizeText(value: string | undefined): string {
  return (value ?? '').replace(/\r/g, '').trim()
}

function sanitizeLines(lines: string[] | undefined): string[] {
  return (lines ?? []).map((line) => line.replace(/\r/g, '').trim()).filter(Boolean)
}

function sanitizeTags(tags: string[] | undefined): string[] {
  return Array.from(new Set((tags ?? []).map((tag) => sanitizeText(tag)).filter(Boolean)))
}

function sanitizeTabId(value: string | undefined, validTabIds: Set<string>): string {
  if (value && validTabIds.has(value)) {
    return value
  }
  return DEFAULT_TAB_ID
}

function normalizeState(raw: StoredCommandState | null | undefined): StoredCommandState {
  const fallback = createDefaultState()
  const source = raw ?? fallback
  const fallbackTab =
    (source.tabs ?? []).find((tab) => tab?.id === DEFAULT_TAB_ID) ??
    createDefaultTab(source.updatedAt)
  const tabsMap = new Map<string, CommandTab>()

  for (const tab of source.tabs ?? []) {
    if (!tab?.id) continue
    tabsMap.set(tab.id, {
      id: tab.id,
      name: sanitizeText(tab.name) || '未命名分组',
      order: Number.isFinite(tab.order) ? tab.order : tabsMap.size,
      createdAt: tab.createdAt || source.updatedAt || fallback.updatedAt,
      updatedAt: tab.updatedAt || source.updatedAt || fallback.updatedAt
    })
  }

  if (!tabsMap.has(DEFAULT_TAB_ID)) {
    tabsMap.set(DEFAULT_TAB_ID, fallbackTab)
  }

  const tabs = Array.from(tabsMap.values()).sort((left, right) => left.order - right.order)
  const validTabIds = new Set(tabs.map((tab) => tab.id))

  const commands = (source.commands ?? [])
    .filter((command): command is CommandRecord => Boolean(command?.id))
    .map((command) => ({
      id: command.id,
      title: sanitizeText(command.title) || '未命名命令',
      description: sanitizeText(command.description),
      lines: sanitizeLines(command.lines),
      tabId: validTabIds.has(command.tabId) ? command.tabId : DEFAULT_TAB_ID,
      tags: sanitizeTags(command.tags),
      order: Number.isFinite(command.order) ? command.order : 0,
      createdAt: command.createdAt || source.updatedAt || fallback.updatedAt,
      updatedAt: command.updatedAt || source.updatedAt || fallback.updatedAt
    }))

  return {
    version: 1,
    updatedAt: source.updatedAt || fallback.updatedAt,
    tabs,
    commands
  }
}

function sortCommands(commands: CommandRecord[], tabs: CommandTab[]): CommandRecord[] {
  const tabOrder = new Map(tabs.map((tab, index) => [tab.id, index]))
  return [...commands].sort((left, right) => {
    const tabDiff =
      (tabOrder.get(left.tabId) ?? Number.MAX_SAFE_INTEGER) -
      (tabOrder.get(right.tabId) ?? Number.MAX_SAFE_INTEGER)
    if (tabDiff !== 0) return tabDiff
    if (left.order !== right.order) return left.order - right.order
    return left.createdAt.localeCompare(right.createdAt)
  })
}

function parseImportedBlocks(text: string): Array<{
  title: string
  description: string
  lines: string[]
}> {
  const importedBlocks: Array<{
    title: string
    description: string
    lines: string[]
  }> = []
  let currentTitle = ''
  let currentDescription = ''
  let currentLines: string[] = []

  for (const rawLine of String(text ?? '').split('\n')) {
    const line = rawLine.replace(/\r/g, '').trim()

    if (!line) {
      if (currentTitle && currentLines.length > 0) {
        importedBlocks.push({
          title: currentTitle,
          description: currentDescription,
          lines: currentLines
        })
      }
      currentTitle = ''
      currentDescription = ''
      currentLines = []
      continue
    }

    if ((line.endsWith(':') || line.endsWith('：')) && !line.startsWith('#')) {
      if (currentTitle && currentLines.length > 0) {
        importedBlocks.push({
          title: currentTitle,
          description: currentDescription,
          lines: currentLines
        })
      }
      currentTitle = line.replace(/[:：]\s*$/, '').trim()
      currentDescription = ''
      currentLines = []
      continue
    }

    if (line.startsWith('#')) {
      const comment = line.replace(/^#+\s*/, '').trim()
      if (!currentTitle) {
        currentTitle = comment
      } else {
        currentDescription = currentDescription ? `${currentDescription} ${comment}` : comment
      }
      continue
    }

    currentLines.push(line)
  }

  if (currentTitle && currentLines.length > 0) {
    importedBlocks.push({
      title: currentTitle,
      description: currentDescription,
      lines: currentLines
    })
  }

  return importedBlocks
}

/**
 * 命令模块的主进程持久化服务。
 * renderer 不直接编辑本地 DB，而是通过这里统一做输入清洗、默认分组兜底和排序。
 */
export class CommandService {
  private readonly paths
  private readonly repository

  constructor(rootDir: string) {
    this.paths = resolveAppDataPaths(rootDir)
    this.repository = new SqliteDocumentRepository<StoredCommandState>(
      this.paths.files.database,
      'commands',
      this.paths.files.commands,
      createDefaultState
    )
  }

  async getState(): Promise<CommandModuleState> {
    const state = await this.readState()
    return this.toModuleState(state)
  }

  async saveTab(input: CommandTabSaveInput): Promise<CommandTab> {
    const name = sanitizeText(input.name)
    if (!name) {
      throw new Error('分组名称不能为空')
    }

    const timestamp = nowIso()
    let savedTab: CommandTab | null = null

    await this.updateState((state) => {
      const tabs = [...state.tabs]
      const existingIndex = tabs.findIndex((tab) => tab.id === input.id)

      if (existingIndex >= 0) {
        savedTab = {
          ...tabs[existingIndex],
          name,
          updatedAt: timestamp
        }
        tabs[existingIndex] = savedTab
      } else {
        savedTab = {
          id: randomUUID(),
          name,
          order: tabs.reduce((maxOrder, tab) => Math.max(maxOrder, tab.order), -1) + 1,
          createdAt: timestamp,
          updatedAt: timestamp
        }
        tabs.push(savedTab)
      }

      return {
        ...state,
        updatedAt: timestamp,
        tabs: [...tabs].sort((left, right) => left.order - right.order)
      }
    })

    if (!savedTab) {
      throw new Error('分组保存失败')
    }

    return savedTab
  }

  async reorderTabs(tabIds: string[]): Promise<{ ok: boolean }> {
    const normalizedIds = Array.from(new Set(tabIds.map((id) => sanitizeText(id)).filter(Boolean)))
    await this.updateState((state) => {
      const tabMap = new Map(state.tabs.map((tab) => [tab.id, tab]))
      let nextOrder = 0

      const reorderedTabs = normalizedIds
        .map((id) => tabMap.get(id))
        .filter((tab): tab is CommandTab => Boolean(tab))
        .map((tab) => ({ ...tab, order: nextOrder++ }))

      for (const tab of [...state.tabs].sort((left, right) => left.order - right.order)) {
        if (normalizedIds.includes(tab.id)) continue
        reorderedTabs.push({ ...tab, order: nextOrder++ })
      }

      return {
        ...state,
        updatedAt: nowIso(),
        tabs: reorderedTabs.sort((left, right) => left.order - right.order)
      }
    })

    return { ok: true }
  }

  async saveCommand(input: CommandSaveInput): Promise<CommandRecord> {
    const title = sanitizeText(input.title)
    const description = sanitizeText(input.description)
    const lines = sanitizeLines(input.lines)
    const tags = sanitizeTags(input.tags)

    if (!title) {
      throw new Error('命令标题不能为空')
    }

    if (lines.length === 0) {
      throw new Error('至少需要保留一行命令')
    }

    const timestamp = nowIso()
    let savedCommand: CommandRecord | null = null

    await this.updateState((state) => {
      const commands = [...state.commands]
      const validTabIds = new Set(state.tabs.map((tab) => tab.id))
      const resolvedTabId =
        input.tabId && validTabIds.has(input.tabId) ? input.tabId : DEFAULT_TAB_ID
      const existingIndex = commands.findIndex((command) => command.id === input.id)

      if (existingIndex >= 0) {
        const current = commands[existingIndex]
        savedCommand = {
          ...current,
          title,
          description,
          lines,
          tabId: resolvedTabId,
          tags,
          // 跨分组移动时重新分配顺序，避免不同分组的 order 直接冲突。
          order:
            current.tabId === resolvedTabId
              ? current.order
              : this.getNextCommandOrder(commands, resolvedTabId, current.id),
          updatedAt: timestamp
        }
        commands[existingIndex] = savedCommand
      } else {
        savedCommand = {
          id: randomUUID(),
          title,
          description,
          lines,
          tabId: resolvedTabId,
          tags,
          order: this.getNextCommandOrder(commands, resolvedTabId),
          createdAt: timestamp,
          updatedAt: timestamp
        }
        commands.push(savedCommand)
      }

      return {
        ...state,
        updatedAt: timestamp,
        commands: sortCommands(commands, state.tabs)
      }
    })

    if (!savedCommand) {
      throw new Error('命令保存失败')
    }

    return savedCommand
  }

  async moveCommandToTab(input: CommandMoveInput): Promise<CommandRecord> {
    const commandId = sanitizeText(input.commandId)
    const targetTabId = sanitizeText(input.targetTabId)
    if (!commandId || !targetTabId) {
      throw new Error('命令或目标分组不能为空')
    }

    let movedCommand: CommandRecord | null = null

    await this.updateState((state) => {
      const validTabIds = new Set(state.tabs.map((tab) => tab.id))
      const resolvedTabId = sanitizeTabId(targetTabId, validTabIds)
      const commands = state.commands.map((command) => {
        if (command.id !== commandId) return command
        movedCommand = {
          ...command,
          tabId: resolvedTabId,
          order: this.getNextCommandOrder(state.commands, resolvedTabId, command.id),
          updatedAt: nowIso()
        }
        return movedCommand
      })

      if (!movedCommand) {
        throw new Error('命令不存在')
      }

      return {
        ...state,
        updatedAt: nowIso(),
        commands: sortCommands(commands, state.tabs)
      }
    })

    if (!movedCommand) {
      throw new Error('命令移动失败')
    }

    return movedCommand
  }

  async reorderCommands(input: CommandReorderInput): Promise<{ ok: boolean }> {
    const tabId = sanitizeText(input.tabId)
    const commandIds = Array.from(
      new Set((input.commandIds ?? []).map((id) => sanitizeText(id)).filter(Boolean))
    )
    if (!tabId) {
      return { ok: false }
    }

    await this.updateState((state) => {
      const targetCommands = state.commands.filter((command) => command.tabId === tabId)
      const commandMap = new Map(targetCommands.map((command) => [command.id, command]))

      let nextOrder = 0
      const reorderedIds = new Set<string>()
      for (const commandId of commandIds) {
        const command = commandMap.get(commandId)
        if (!command) continue
        reorderedIds.add(commandId)
        commandMap.set(commandId, { ...command, order: nextOrder++, updatedAt: nowIso() })
      }

      const remainingCommands = [...commandMap.values()]
        .filter((command) => !reorderedIds.has(command.id))
        .sort((left, right) => left.order - right.order)
        .map((command) => ({ ...command, order: nextOrder++, updatedAt: nowIso() }))

      const reorderedMap = new Map<string, CommandRecord>([
        ...[...commandMap.entries()].filter(([id]) => reorderedIds.has(id)),
        ...remainingCommands.map((command) => [command.id, command] as const)
      ])

      return {
        ...state,
        updatedAt: nowIso(),
        commands: sortCommands(
          state.commands.map((command) => reorderedMap.get(command.id) ?? command),
          state.tabs
        )
      }
    })

    return { ok: true }
  }

  async deleteCommand(commandId: string): Promise<{ ok: boolean }> {
    const normalizedId = sanitizeText(commandId)
    if (!normalizedId) {
      return { ok: false }
    }

    let removed = false

    await this.updateState((state) => {
      const commands = state.commands.filter((command) => {
        const keep = command.id !== normalizedId
        if (!keep) removed = true
        return keep
      })

      if (!removed) {
        return state
      }

      return {
        ...state,
        updatedAt: nowIso(),
        commands: sortCommands(commands, state.tabs)
      }
    })

    return { ok: removed }
  }

  async importCommands(input: CommandImportInput): Promise<CommandImportResult> {
    const importedBlocks = parseImportedBlocks(input.text)
    if (importedBlocks.length === 0) {
      return { imported: 0, blocks: [] }
    }

    let blocks: CommandImportResult['blocks'] = []

    await this.updateState((state) => {
      const validTabIds = new Set(state.tabs.map((tab) => tab.id))
      const targetTabId = sanitizeTabId(input.tabId, validTabIds)
      const timestamp = nowIso()
      const commands = [...state.commands]

      blocks = importedBlocks.map((block) => {
        const record: CommandRecord = {
          id: randomUUID(),
          title: sanitizeText(block.title) || '未命名命令',
          description: sanitizeText(block.description),
          lines: sanitizeLines(block.lines),
          tabId: targetTabId,
          tags: [],
          order: this.getNextCommandOrder(commands, targetTabId),
          createdAt: timestamp,
          updatedAt: timestamp
        }
        commands.push(record)
        return {
          title: record.title,
          description: record.description,
          lines: record.lines,
          tabId: record.tabId,
          tags: record.tags
        }
      })

      return {
        ...state,
        updatedAt: timestamp,
        commands: sortCommands(commands, state.tabs)
      }
    })

    return {
      imported: blocks.length,
      blocks
    }
  }

  async exportBackupSection(): Promise<Pick<CommandModuleState, 'tabs' | 'commands'>> {
    const state = await this.readState()
    return {
      tabs: [...state.tabs],
      commands: [...state.commands]
    }
  }

  async restoreBackupSection(
    section: Pick<CommandModuleState, 'tabs' | 'commands'>
  ): Promise<CommandModuleState> {
    const restored = normalizeState({
      version: 1,
      updatedAt: nowIso(),
      tabs: section.tabs ?? [],
      commands: section.commands ?? []
    })
    await ensureAppDataLayout(this.paths)
    await this.repository.write(restored)
    return this.toModuleState(restored)
  }

  private async readState(): Promise<StoredCommandState> {
    await ensureAppDataLayout(this.paths)
    const raw = await this.repository.read()
    const normalized = normalizeState(raw)

    // 发现历史文件结构漂移时立即自愈，后续读取都基于统一格式。
    if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
      await this.repository.write(normalized)
    }

    return normalized
  }

  private async updateState(
    mutator: (state: StoredCommandState) => StoredCommandState | Promise<StoredCommandState>
  ): Promise<StoredCommandState> {
    await ensureAppDataLayout(this.paths)

    return this.repository.update(async (raw) => {
      const normalized = normalizeState(raw)
      return normalizeState(await mutator(normalized))
    })
  }

  private toModuleState(state: StoredCommandState): CommandModuleState {
    return {
      storageFile: this.paths.files.database,
      defaultTabId: DEFAULT_TAB_ID,
      updatedAt: state.updatedAt,
      tabs: [...state.tabs].sort((left, right) => left.order - right.order),
      commands: sortCommands(state.commands, state.tabs)
    }
  }

  private getNextCommandOrder(commands: CommandRecord[], tabId: string, ignoreId?: string): number {
    return (
      commands
        .filter((command) => command.tabId === tabId && command.id !== ignoreId)
        .reduce((maxOrder, command) => Math.max(maxOrder, command.order), -1) + 1
    )
  }
}
