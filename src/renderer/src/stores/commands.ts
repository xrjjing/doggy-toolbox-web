import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  CommandModuleState,
  CommandRecord,
  CommandSaveInput,
  CommandTab,
  CommandTabSaveInput
} from '@shared/ipc-contract'

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

  function hydrateState(nextState: CommandModuleState): void {
    snapshot.value = nextState
    hasLoaded.value = true

    if (!tabs.value.some((tab) => tab.id === activeTabId.value)) {
      activeTabId.value = nextState.defaultTabId
    }

    if (!activeTabId.value && nextState.tabs[0]) {
      activeTabId.value = nextState.tabs[0].id
    }
  }

  async function load(): Promise<void> {
    loading.value = true
    try {
      hydrateState(await window.doggy.getCommandsState())
    } finally {
      loading.value = false
    }
  }

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
