import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  CommandModuleState,
  CommandRecord,
  CommandSaveInput,
  CommandTab,
  CommandTabSaveInput
} from '@shared/ipc-contract'

/**
 * 命令管理 store。
 * snapshot 保存主进程返回的完整持久化状态，activeTabId/search 属于 renderer 侧视图状态，
 * 通过这种拆分，刷新数据不会丢失列表来源，但当前筛选条件仍由页面控制。
 */

/**
 * 搜索命中策略是“把常看字段拍平后做全文包含”，
 * 牺牲部分精确度换取实现稳定和导入后零额外索引成本。
 */
function matchesSearch(command: CommandRecord, normalizedSearch: string): boolean {
  if (!normalizedSearch) return true

  return [command.title, command.description, ...command.tags, ...command.lines]
    .join('\n')
    .toLowerCase()
    .includes(normalizedSearch)
}

export const useCommandsStore = defineStore('commands', () => {
  const snapshot = ref<CommandModuleState | null>(null)
  const activeTabId = ref('')
  const search = ref('')
  const loading = ref(false)
  const saving = ref(false)
  const hasLoaded = ref(false)

  const tabs = computed(() => snapshot.value?.tabs ?? [])
  const commands = computed(() => snapshot.value?.commands ?? [])
  const defaultTabId = computed(() => snapshot.value?.defaultTabId ?? '')
  const storageFile = computed(() => snapshot.value?.storageFile ?? '')
  const updatedAt = computed(() => snapshot.value?.updatedAt ?? '')
  const normalizedSearch = computed(() => search.value.trim().toLowerCase())

  const visibleCommands = computed(() =>
    commands.value.filter(
      (command) =>
        (!activeTabId.value || command.tabId === activeTabId.value) &&
        matchesSearch(command, normalizedSearch.value)
    )
  )

  const currentTab = computed(
    () => tabs.value.find((tab) => tab.id === activeTabId.value) ?? tabs.value[0] ?? null
  )

  /**
   * 用主进程快照重建本地视图。
   * 关键点是同时校正 activeTabId，避免删除 tab、切换备份或导入旧数据后仍指向失效 id。
   */
  function hydrateState(nextState: CommandModuleState): void {
    snapshot.value = nextState
    hasLoaded.value = true

    // 当前激活 tab 不存在时，优先回退到后端声明的默认 tab。
    if (!tabs.value.some((tab) => tab.id === activeTabId.value)) {
      activeTabId.value = nextState.defaultTabId
    }

    // 默认 tab 也为空时，再退到第一项，保证页面始终有一个稳定焦点。
    if (!activeTabId.value && nextState.tabs[0]) {
      activeTabId.value = nextState.tabs[0].id
    }
  }

  /**
   * 命令模块所有写操作后都通过 reload 收口，而不是在 renderer 手工 patch snapshot，
   * 这样可以复用主进程的排序、默认 tab 计算和落盘时间更新逻辑。
   */
  async function load(): Promise<void> {
    loading.value = true
    try {
      hydrateState(await window.doggy.getCommandsState())
    } finally {
      loading.value = false
    }
  }

  /**
   * 保存 tab 后立即切换到该 tab，方便“新建后继续编辑内容”的典型交互。
   */
  async function saveTab(input: CommandTabSaveInput): Promise<CommandTab> {
    saving.value = true
    try {
      const tab = await window.doggy.saveCommandTab(input)
      await load()
      activeTabId.value = tab.id
      return tab
    } finally {
      saving.value = false
    }
  }

  /**
   * 保存命令后同步定位到它所属的 tab，
   * 防止跨 tab 新建或编辑后，列表仍停留在旧分类导致用户误以为保存失败。
   */
  async function saveCommand(input: CommandSaveInput): Promise<CommandRecord> {
    saving.value = true
    try {
      const command = await window.doggy.saveCommand(input)
      await load()
      activeTabId.value = command.tabId
      return command
    } finally {
      saving.value = false
    }
  }

  /**
   * 删除结果只透出 ok，真正的数据收口仍依赖 reload 后的新快照。
   */
  async function removeCommand(commandId: string): Promise<boolean> {
    saving.value = true
    try {
      const result = await window.doggy.deleteCommand(commandId)
      await load()
      return result.ok
    } finally {
      saving.value = false
    }
  }

  function setActiveTab(tabId: string): void {
    activeTabId.value = tabId
  }

  function setSearch(value: string): void {
    search.value = value
  }

  /**
   * 计数直接基于完整 commands 快照，而不是当前过滤后的 visibleCommands，
   * 这样 tab 徽标展示的是“全量归属数”，不会受搜索条件影响。
   */
  function countByTab(tabId: string): number {
    return commands.value.filter((command) => command.tabId === tabId).length
  }

  return {
    snapshot,
    activeTabId,
    search,
    loading,
    saving,
    hasLoaded,
    tabs,
    commands,
    defaultTabId,
    storageFile,
    updatedAt,
    visibleCommands,
    currentTab,
    load,
    saveTab,
    saveCommand,
    removeCommand,
    setActiveTab,
    setSearch,
    countByTab
  }
})
