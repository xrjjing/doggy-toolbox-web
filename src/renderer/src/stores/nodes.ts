import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { NodeModuleState, NodeRecord, NodeSaveInput } from '@shared/ipc-contract'

function matchesSearch(node: NodeRecord, normalizedSearch: string): boolean {
  if (!normalizedSearch) return true

  return [
    node.name,
    node.type,
    node.server,
    String(node.port),
    node.rawLink,
    node.configText,
    ...node.tags
  ]
    .join('\n')
    .toLowerCase()
    .includes(normalizedSearch)
}

export const useNodesStore = defineStore('nodes', () => {
  const snapshot = ref<NodeModuleState | null>(null)
  const search = ref('')
  const activeTag = ref('')
  const loading = ref(false)
  const saving = ref(false)
  const hasLoaded = ref(false)
  const normalizedSearch = computed(() => search.value.trim().toLowerCase())

  const nodes = computed(() => snapshot.value?.nodes ?? [])
  const storageFile = computed(() => snapshot.value?.storageFile ?? '')
  const updatedAt = computed(() => snapshot.value?.updatedAt ?? '')
  const availableTags = computed(() =>
    Array.from(new Set(nodes.value.flatMap((node) => node.tags))).sort((left, right) =>
      left.localeCompare(right, 'zh-CN')
    )
  )
  const visibleNodes = computed(() =>
    nodes.value.filter(
      (node) =>
        matchesSearch(node, normalizedSearch.value) &&
        (!activeTag.value || node.tags.includes(activeTag.value))
    )
  )

  function hydrateState(nextState: NodeModuleState): void {
    snapshot.value = nextState
    hasLoaded.value = true

    if (activeTag.value && !availableTags.value.includes(activeTag.value)) {
      activeTag.value = ''
    }
  }

  async function load(): Promise<void> {
    loading.value = true
    try {
      hydrateState(await window.doggy.getNodesState())
    } finally {
      loading.value = false
    }
  }

  async function saveNode(input: NodeSaveInput): Promise<NodeRecord> {
    saving.value = true
    try {
      const node = await window.doggy.saveNode(input)
      await load()
      return node
    } finally {
      saving.value = false
    }
  }

  async function removeNode(nodeId: string): Promise<boolean> {
    saving.value = true
    try {
      const result = await window.doggy.deleteNode(nodeId)
      await load()
      return result.ok
    } finally {
      saving.value = false
    }
  }

  function setSearch(value: string): void {
    search.value = value
  }

  function setTagFilter(value: string): void {
    activeTag.value = value
  }

  function clearTagFilter(): void {
    activeTag.value = ''
  }

  function countByTag(tag: string): number {
    return nodes.value.filter((node) => node.tags.includes(tag)).length
  }

  return {
    snapshot,
    search,
    activeTag,
    loading,
    saving,
    hasLoaded,
    nodes,
    storageFile,
    updatedAt,
    availableTags,
    visibleNodes,
    load,
    saveNode,
    removeNode,
    setSearch,
    setTagFilter,
    clearTagFilter,
    countByTag
  }
})
