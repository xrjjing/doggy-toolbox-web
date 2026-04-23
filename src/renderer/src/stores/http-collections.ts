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

  function hydrateState(nextState: HttpCollectionModuleState): void {
    snapshot.value = nextState
    hasLoaded.value = true

    if (!collections.value.some((collection) => collection.id === activeCollectionId.value)) {
      activeCollectionId.value = nextState.defaultCollectionId
    }

    if (!activeCollectionId.value && nextState.collections[0]) {
      activeCollectionId.value = nextState.collections[0].id
    }

    if (!requests.value.some((request) => request.id === activeRequestId.value)) {
      activeRequestId.value =
        requests.value.find((request) => request.collectionId === activeCollectionId.value)?.id ??
        ''
    }

    if (
      selectedEnvironmentId.value &&
      !environments.value.some((environment) => environment.id === selectedEnvironmentId.value)
    ) {
      selectedEnvironmentId.value = ''
    }

    if (!activeRequestHistory.value.some((item) => item.id === activeHistoryId.value)) {
      activeHistoryId.value = activeRequestHistory.value[0]?.id ?? ''
    }
  }

  async function load(): Promise<void> {
    loading.value = true
    try {
      hydrateState(await window.doggy.getHttpCollectionsState())
    } finally {
      loading.value = false
    }
  }

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
