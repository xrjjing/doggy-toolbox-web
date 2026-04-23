import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  HttpBatchExecuteResult,
  HttpCollection,
  HttpCollectionModuleState,
  HttpCollectionSaveInput,
  HttpEnvironment,
  HttpEnvironmentSaveInput,
  HttpExecutionHistoryRecord,
  HttpExecuteRequestResult,
  HttpRequestRecord,
  HttpRequestSaveInput
} from '@shared/ipc-contract'

/**
 * HTTP 集合 store。
 * 这是本仓库状态最重的 renderer store 之一：
 * - snapshot 保存集合、请求、环境、历史这些主进程持久化数据。
 * - activeCollectionId / activeRequestId / selectedEnvironmentId / activeHistoryId
 *   保存当前界面焦点。
 * - executionResult / batchResult 保存最近一次执行结果，用于在 reload 前后保持结果面板可见。
 */

/**
 * 搜索时把 URL、method、body、header、param、tag 一次拍平，
 * 这样用户只要记得任意一个线索都能定位请求，不需要额外理解字段级检索语法。
 */
function matchesRequest(request: HttpRequestRecord, normalizedSearch: string): boolean {
  if (!normalizedSearch) return true

  return [
    request.name,
    request.method,
    request.url,
    request.description,
    request.body.content,
    request.auth.type,
    ...request.tags,
    ...request.headers.flatMap((item) => [item.key, item.value, item.description]),
    ...request.params.flatMap((item) => [item.key, item.value, item.description])
  ]
    .join('\n')
    .toLowerCase()
    .includes(normalizedSearch)
}

export const useHttpCollectionsStore = defineStore('http-collections', () => {
  const snapshot = ref<HttpCollectionModuleState | null>(null)
  const activeCollectionId = ref('')
  const activeRequestId = ref('')
  const search = ref('')
  const loading = ref(false)
  const saving = ref(false)
  const executing = ref(false)
  const batchExecuting = ref(false)
  const hasLoaded = ref(false)
  const selectedEnvironmentId = ref('')
  const executionResult = ref<HttpExecuteRequestResult | null>(null)
  const batchResult = ref<HttpBatchExecuteResult | null>(null)
  const activeHistoryId = ref('')
  const normalizedSearch = computed(() => search.value.trim().toLowerCase())

  const collections = computed(() => snapshot.value?.collections ?? [])
  const requests = computed(() => snapshot.value?.requests ?? [])
  const environments = computed(() => snapshot.value?.environments ?? [])
  const history = computed(() => snapshot.value?.history ?? [])
  const defaultCollectionId = computed(() => snapshot.value?.defaultCollectionId ?? '')
  const storageFile = computed(() => snapshot.value?.storageFile ?? '')
  const updatedAt = computed(() => snapshot.value?.updatedAt ?? '')
  const activeCollection = computed(
    () =>
      collections.value.find((collection) => collection.id === activeCollectionId.value) ??
      collections.value[0] ??
      null
  )
  const visibleRequests = computed(() =>
    requests.value.filter(
      (request) =>
        (!activeCollectionId.value || request.collectionId === activeCollectionId.value) &&
        matchesRequest(request, normalizedSearch.value)
    )
  )
  const activeRequest = computed(
    () =>
      requests.value.find((request) => request.id === activeRequestId.value) ??
      visibleRequests.value[0] ??
      null
  )
  const activeRequestHistory = computed(() =>
    activeRequest.value
      ? history.value.filter((item) => item.requestId === activeRequest.value?.id)
      : []
  )
  const activeHistory = computed<HttpExecutionHistoryRecord | null>(
    () =>
      activeRequestHistory.value.find((item) => item.id === activeHistoryId.value) ??
      activeRequestHistory.value[0] ??
      null
  )

  /**
   * 用主进程快照校正所有 renderer 焦点状态。
   * 这里的几个回退分支很关键：导入备份、删除请求、切换集合后，旧 id 很容易失效，
   * 若不统一修正，右侧详情面板会停留在不存在的对象上。
   */
  function hydrateState(nextState: HttpCollectionModuleState): void {
    snapshot.value = nextState
    hasLoaded.value = true

    // 当前集合不存在时，优先退回主进程默认集合。
    if (!collections.value.some((collection) => collection.id === activeCollectionId.value)) {
      activeCollectionId.value = nextState.defaultCollectionId
    }

    // 默认集合也没有时，再退第一项，保证左侧列表有稳定选中态。
    if (!activeCollectionId.value && nextState.collections[0]) {
      activeCollectionId.value = nextState.collections[0].id
    }

    // 请求焦点始终受当前集合约束，避免集合切换后仍指向别的集合里的请求。
    if (!requests.value.some((request) => request.id === activeRequestId.value)) {
      activeRequestId.value =
        requests.value.find((request) => request.collectionId === activeCollectionId.value)?.id ??
        ''
    }

    // 环境是可选的；被删除或导入覆盖后，失效选择直接清空，不猜测替代项。
    if (
      selectedEnvironmentId.value &&
      !environments.value.some((environment) => environment.id === selectedEnvironmentId.value)
    ) {
      selectedEnvironmentId.value = ''
    }

    // 历史面板跟随当前请求；请求变化或清空历史后，旧 historyId 必须作废。
    if (!activeRequestHistory.value.some((item) => item.id === activeHistoryId.value)) {
      activeHistoryId.value = activeRequestHistory.value[0]?.id ?? ''
    }
  }

  /**
   * HTTP 模块所有结构性更新都通过 reload 收口，
   * 避免 renderer 自己维护集合、请求、历史三套关联关系。
   */
  async function load(): Promise<void> {
    loading.value = true
    try {
      hydrateState(await window.doggy.getHttpCollectionsState())
    } finally {
      loading.value = false
    }
  }

  /**
   * 保存集合后切到新集合，符合“新建集合后立即往里面加请求”的主路径。
   */
  async function saveCollection(input: HttpCollectionSaveInput): Promise<HttpCollection> {
    saving.value = true
    try {
      const collection = await window.doggy.saveHttpCollection(input)
      await load()
      activeCollectionId.value = collection.id
      return collection
    } finally {
      saving.value = false
    }
  }

  /**
   * 保存请求后同步刷新集合与请求焦点。
   * 这样无论是新建还是移动到其他集合，页面都能直接定位到最终落点。
   */
  async function saveRequest(input: HttpRequestSaveInput): Promise<HttpRequestRecord> {
    saving.value = true
    try {
      const request = await window.doggy.saveHttpRequest(input)
      await load()
      activeCollectionId.value = request.collectionId
      activeRequestId.value = request.id
      return request
    } finally {
      saving.value = false
    }
  }

  /**
   * 删除请求后，如果结果面板还引用的是该请求的最近执行结果，需要同步清空，
   * 否则 UI 会展示一条已经无归属的执行结果。
   */
  async function removeRequest(requestId: string): Promise<boolean> {
    saving.value = true
    try {
      const result = await window.doggy.deleteHttpRequest(requestId)
      await load()
      if (executionResult.value?.requestId === requestId) {
        executionResult.value = null
      }
      return result.ok
    } finally {
      saving.value = false
    }
  }

  /**
   * 环境是独立资源，但不维护单独的 activeEnvironment 详情页，所以保存后只需 reload。
   */
  async function saveEnvironment(input: HttpEnvironmentSaveInput): Promise<HttpEnvironment> {
    saving.value = true
    try {
      const environment = await window.doggy.saveHttpEnvironment(input)
      await load()
      return environment
    } finally {
      saving.value = false
    }
  }

  /**
   * 删除当前选中环境时，主动清空 selectedEnvironmentId，
   * 避免后续执行仍带着一个已经失效的环境引用。
   */
  async function removeEnvironment(environmentId: string): Promise<boolean> {
    saving.value = true
    try {
      const result = await window.doggy.deleteHttpEnvironment(environmentId)
      await load()
      if (selectedEnvironmentId.value === environmentId) {
        selectedEnvironmentId.value = ''
      }
      return result.ok
    } finally {
      saving.value = false
    }
  }

  /**
   * 集合切换会连带重置请求和历史焦点。
   * 这里不保留“上一个请求 id”，因为不同集合之间请求集合天然不兼容。
   */
  function setActiveCollection(collectionId: string): void {
    activeCollectionId.value = collectionId
    activeRequestId.value =
      requests.value.find((request) => request.collectionId === collectionId)?.id ?? ''
    activeHistoryId.value = ''
  }

  function setActiveRequest(requestId: string): void {
    activeRequestId.value = requestId
    activeHistoryId.value = ''
  }

  function setSelectedEnvironment(environmentId: string | null): void {
    selectedEnvironmentId.value = environmentId ?? ''
  }

  function setActiveHistory(historyId: string): void {
    activeHistoryId.value = historyId
  }

  function setSearch(value: string): void {
    search.value = value
  }

  /**
   * 单条执行入口。
   * 真正的变量替换、请求发送和历史落盘都在主进程；renderer 只负责传当前焦点和环境。
   */
  async function executeActiveRequest(): Promise<HttpExecuteRequestResult> {
    if (!activeRequest.value) {
      throw new Error('请先选择一个 HTTP 请求')
    }

    executing.value = true
    try {
      const result = await window.doggy.executeHttpRequest({
        requestId: activeRequest.value.id,
        environmentId: selectedEnvironmentId.value || undefined
      })
      executionResult.value = result
      await load()
      return result
    } finally {
      executing.value = false
    }
  }

  /**
   * 批量执行入口。
   * 批次结果会额外把第一条结果提升为 executionResult，方便复用现有单请求结果面板。
   */
  async function executeActiveCollectionBatch(): Promise<HttpBatchExecuteResult> {
    const collectionId = activeCollectionId.value || activeCollection.value?.id
    if (!collectionId) {
      throw new Error('请先选择一个 HTTP 集合')
    }

    batchExecuting.value = true
    try {
      const result = await window.doggy.executeHttpBatch({
        collectionId,
        environmentId: selectedEnvironmentId.value || undefined
      })
      batchResult.value = result
      executionResult.value = result.results[0] ?? executionResult.value
      await load()
      return result
    } finally {
      batchExecuting.value = false
    }
  }

  /**
   * 清理历史是对当前请求的局部维护操作。
   * 删除成功后只清空 history 焦点，不改当前请求和集合选择。
   */
  async function clearActiveRequestHistory(): Promise<{ ok: boolean; removed: number }> {
    if (!activeRequest.value) {
      return { ok: false, removed: 0 }
    }

    saving.value = true
    try {
      const result = await window.doggy.clearHttpHistory({ requestId: activeRequest.value.id })
      await load()
      if (result.removed > 0) {
        activeHistoryId.value = ''
      }
      return result
    } finally {
      saving.value = false
    }
  }

  /**
   * 集合徽标计数基于全量 requests，而不是当前搜索结果。
   */
  function countByCollection(collectionId: string): number {
    return requests.value.filter((request) => request.collectionId === collectionId).length
  }

  return {
    snapshot,
    activeCollectionId,
    activeRequestId,
    search,
    loading,
    saving,
    executing,
    batchExecuting,
    hasLoaded,
    selectedEnvironmentId,
    executionResult,
    batchResult,
    activeHistoryId,
    collections,
    requests,
    environments,
    history,
    defaultCollectionId,
    storageFile,
    updatedAt,
    activeCollection,
    visibleRequests,
    activeRequest,
    activeRequestHistory,
    activeHistory,
    load,
    saveCollection,
    saveRequest,
    removeRequest,
    saveEnvironment,
    removeEnvironment,
    setActiveCollection,
    setActiveRequest,
    setSelectedEnvironment,
    setActiveHistory,
    setSearch,
    executeActiveRequest,
    executeActiveCollectionBatch,
    clearActiveRequestHistory,
    countByCollection
  }
})
