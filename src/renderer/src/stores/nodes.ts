import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { NodeModuleState, NodeRecord, NodeSaveInput } from '@shared/ipc-contract'

/**
 * 节点管理 store。
 * 节点原始分享链接解析发生在 renderer 的 `node-converters.ts`，
 * 但真正保存、删除、落盘时间更新仍在主进程，因此这里沿用“写后 reload”的一致收口方式。
 */

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

  /**
   * 标签过滤器是从当前快照动态推导的。
   * 当导入、删除或编辑导致标签集合变化时，需要及时把失效标签清空。
   */
  function hydrateState(nextState: NodeModuleState): void {
    snapshot.value = nextState
    hasLoaded.value = true

    if (activeTag.value && !availableTags.value.includes(activeTag.value)) {
      activeTag.value = ''
    }
  }

  /**
   * 节点模块也统一从主进程回源，避免 renderer 自己维护 tags 去重和排序。
   */
  async function load(): Promise<void> {
    loading.value = true
    try {
      hydrateState(await window.doggy.getNodesState())
    } finally {
      loading.value = false
    }
  }

  /**
   * 保存完成后 reload，确保分享链接解析后的标准化字段和主进程生成字段一致。
   */
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

  /**
   * 删除节点后不额外手工修补 visibleNodes，直接依赖新快照重算。
   */
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

  /**
   * 标签计数始终基于原始节点列表，而不是当前搜索结果。
   */
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
