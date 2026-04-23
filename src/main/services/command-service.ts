import { randomUUID } from 'node:crypto'
import type {
  CommandModuleState,
  CommandRecord,
  CommandSaveInput,
  CommandTab,
  CommandTabSaveInput
} from '../../shared/ipc-contract'
import { ensureAppDataLayout, resolveAppDataPaths } from './app-data'
import { JsonFileRepository } from './json-repository'

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

/**
 * 命令模块的主进程持久化服务。
 * renderer 不直接编辑 JSON，而是通过这里统一做输入清洗、默认分组兜底和排序。
 */
export class CommandService {
  private readonly paths
  private readonly repository

  constructor(rootDir: string) {
    this.paths = resolveAppDataPaths(rootDir)
    this.repository = new JsonFileRepository<StoredCommandState>(
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
      storageFile: this.paths.files.commands,
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
