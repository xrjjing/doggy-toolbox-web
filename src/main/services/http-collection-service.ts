import { randomUUID } from 'node:crypto'
import type {
  HttpAuth,
  HttpBatchExecuteInput,
  HttpBatchExecuteResult,
  HttpBody,
  HttpClearHistoryInput,
  HttpCollection,
  HttpExecuteRequestInput,
  HttpExecuteRequestResult,
  HttpExecutionHistoryRecord,
  HttpCollectionModuleState,
  HttpCollectionSaveInput,
  HttpEnvironment,
  HttpEnvironmentSaveInput,
  HttpEnvironmentVariable,
  HttpKeyValue,
  HttpMethod,
  HttpResolvedRequest,
  HttpResponseHeader,
  HttpRequestRecord,
  HttpRequestSaveInput
} from '../../shared/ipc-contract'
import { ensureAppDataLayout, resolveAppDataPaths } from './app-data'
import { JsonFileRepository } from './json-repository'

type StoredHttpCollectionState = {
  version: number
  updatedAt: string
  collections: HttpCollection[]
  requests: HttpRequestRecord[]
  environments: HttpEnvironment[]
  history: HttpExecutionHistoryRecord[]
}

const DEFAULT_COLLECTION_ID = 'default'
const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const DEFAULT_TIMEOUT_MS = 30_000
const MIN_TIMEOUT_MS = 1_000
const MAX_TIMEOUT_MS = 120_000
const MAX_HISTORY_PER_REQUEST = 50
const MAX_HISTORY_TOTAL = 500
const MAX_HISTORY_RESPONSE_BODY_CHARS = 100_000
const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g

type ExecutionContext = {
  request: HttpRequestRecord
  environment?: HttpEnvironment
  resolvedRequest: HttpResolvedRequest
}

function nowIso(): string {
  return new Date().toISOString()
}

function sanitizeText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\r/g, '').trim() : ''
}

function sanitizeMultiline(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\r/g, '').trim() : ''
}

function sanitizeBodyText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\r/g, '') : ''
}

function sanitizeTags(tags: string[] | undefined): string[] {
  return Array.from(new Set((tags ?? []).map((tag) => sanitizeText(tag)).filter(Boolean)))
}

function sanitizeStringArray(values: string[] | undefined): string[] {
  return Array.from(new Set((values ?? []).map((value) => sanitizeText(value)).filter(Boolean)))
}

function normalizeMethod(value: unknown): HttpMethod {
  const method = sanitizeText(value).toUpperCase()
  return HTTP_METHODS.includes(method as HttpMethod) ? (method as HttpMethod) : 'GET'
}

function createDefaultCollection(timestamp: string): HttpCollection {
  return {
    id: DEFAULT_COLLECTION_ID,
    name: '默认集合',
    description: '从旧项目 HTTP 集合页迁移而来的新仓默认集合。',
    order: 0,
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

function createDefaultState(): StoredHttpCollectionState {
  const timestamp = nowIso()
  return {
    version: 1,
    updatedAt: timestamp,
    collections: [createDefaultCollection(timestamp)],
    requests: [],
    environments: [],
    history: []
  }
}

function sortCollections(collections: HttpCollection[]): HttpCollection[] {
  return [...collections].sort((left, right) => {
    if (left.order !== right.order) return left.order - right.order
    return left.createdAt.localeCompare(right.createdAt)
  })
}

function sortRequests(
  requests: HttpRequestRecord[],
  collections: HttpCollection[]
): HttpRequestRecord[] {
  const collectionOrder = new Map(collections.map((collection, index) => [collection.id, index]))
  return [...requests].sort((left, right) => {
    const collectionDiff =
      (collectionOrder.get(left.collectionId) ?? Number.MAX_SAFE_INTEGER) -
      (collectionOrder.get(right.collectionId) ?? Number.MAX_SAFE_INTEGER)
    if (collectionDiff !== 0) return collectionDiff
    if (left.order !== right.order) return left.order - right.order
    return left.createdAt.localeCompare(right.createdAt)
  })
}

function sortEnvironments(environments: HttpEnvironment[]): HttpEnvironment[] {
  return [...environments].sort((left, right) => {
    if (left.order !== right.order) return left.order - right.order
    return left.createdAt.localeCompare(right.createdAt)
  })
}

function sortHistory(history: HttpExecutionHistoryRecord[]): HttpExecutionHistoryRecord[] {
  return [...history].sort((left, right) => right.executedAt.localeCompare(left.executedAt))
}

function normalizeKeyValues(values: Array<Partial<HttpKeyValue>> | undefined): HttpKeyValue[] {
  return (values ?? [])
    .map((item) => ({
      id: sanitizeText(item.id) || randomUUID(),
      key: sanitizeText(item.key),
      value: sanitizeMultiline(item.value),
      enabled: item.enabled !== false,
      description: sanitizeText(item.description)
    }))
    .filter((item) => item.key || item.value)
}

function normalizeBody(value: Partial<HttpBody> | undefined): HttpBody {
  const type = value?.type
  return {
    type: type === 'json' || type === 'text' || type === 'form' ? type : 'none',
    content: sanitizeMultiline(value?.content)
  }
}

function normalizeAuth(value: Partial<HttpAuth> | undefined): HttpAuth {
  const type = value?.type
  return {
    type: type === 'bearer' || type === 'basic' ? type : 'none',
    token: sanitizeText(value?.token),
    username: sanitizeText(value?.username),
    password: sanitizeText(value?.password)
  }
}

function normalizeTimeout(value: unknown): number {
  const timeout = Number(value)
  if (!Number.isFinite(timeout)) return DEFAULT_TIMEOUT_MS
  return Math.min(Math.max(Math.round(timeout), MIN_TIMEOUT_MS), MAX_TIMEOUT_MS)
}

function createVariableMap(environment: HttpEnvironment | undefined): Map<string, string> {
  const variables = new Map<string, string>()

  for (const item of environment?.variables ?? []) {
    if (item.enabled === false || !item.key) continue
    variables.set(item.key, item.value)
  }

  return variables
}

function replaceVariables(
  value: string,
  variables: Map<string, string>,
  unresolvedVariables: Set<string>
): string {
  return value.replace(VARIABLE_PATTERN, (matched, variableName: string) => {
    if (variables.has(variableName)) {
      return variables.get(variableName) ?? ''
    }

    unresolvedVariables.add(variableName)
    return matched
  })
}

function buildUrl(baseUrl: string, params: Array<Pick<HttpKeyValue, 'key' | 'value'>>): string {
  if (!baseUrl) {
    throw new Error('请求 URL 不能为空')
  }

  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw new Error('请求 URL 必须是完整的 http:// 或 https:// 地址')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('请求 URL 仅支持 http:// 或 https://')
  }

  for (const param of params) {
    if (!param.key) continue
    url.searchParams.set(param.key, param.value)
  }

  return url.toString()
}

function hasHeader(headers: Array<Pick<HttpKeyValue, 'key' | 'value'>>, key: string): boolean {
  const normalizedKey = key.toLowerCase()
  return headers.some((header) => header.key.toLowerCase() === normalizedKey)
}

function setHeader(
  headers: Array<Pick<HttpKeyValue, 'key' | 'value'>>,
  key: string,
  value: string
): Array<Pick<HttpKeyValue, 'key' | 'value'>> {
  const normalizedKey = key.toLowerCase()
  const nextHeaders = headers.filter((header) => header.key.toLowerCase() !== normalizedKey)
  nextHeaders.push({ key, value })
  return nextHeaders
}

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`
}

function resolveBody(body: HttpBody): { bodyType: HttpBody['type']; body: string } {
  if (body.type === 'none') {
    return { bodyType: 'none', body: '' }
  }

  return {
    bodyType: body.type,
    body: body.content
  }
}

function headersToObject(
  headers: Array<Pick<HttpKeyValue, 'key' | 'value'>>
): Record<string, string> {
  return headers.reduce<Record<string, string>>((acc, header) => {
    if (header.key) {
      acc[header.key] = header.value
    }
    return acc
  }, {})
}

async function readResponseBody(response: Response): Promise<string> {
  const buffer = Buffer.from(await response.arrayBuffer())
  return buffer.toString('utf8')
}

function responseHeadersToList(headers: Headers): HttpResponseHeader[] {
  return Array.from(headers.entries()).map(([key, value]) => ({ key, value }))
}

function normalizeResponseHeaders(values: unknown): HttpResponseHeader[] {
  if (!Array.isArray(values)) return []
  return values
    .map((item) => ({
      key: sanitizeText((item as Partial<HttpResponseHeader>).key),
      value: sanitizeBodyText((item as Partial<HttpResponseHeader>).value)
    }))
    .filter((item) => item.key)
}

function normalizeResolvedRequest(value: unknown): HttpResolvedRequest {
  const source = (value ?? {}) as Partial<HttpResolvedRequest>
  return {
    requestId: sanitizeText(source.requestId),
    environmentId: sanitizeText(source.environmentId) || undefined,
    method: normalizeMethod(source.method),
    url: sanitizeText(source.url),
    headers: normalizeResponseHeaders(source.headers),
    bodyType:
      source.bodyType === 'json' || source.bodyType === 'text' || source.bodyType === 'form'
        ? source.bodyType
        : 'none',
    body: sanitizeBodyText(source.body),
    unresolvedVariables: sanitizeStringArray(source.unresolvedVariables)
  }
}

function trimHistoryBody(body: string): {
  responseBody: string
  responseBodyTruncated: boolean
} {
  if (body.length <= MAX_HISTORY_RESPONSE_BODY_CHARS) {
    return {
      responseBody: body,
      responseBodyTruncated: false
    }
  }

  return {
    responseBody: body.slice(0, MAX_HISTORY_RESPONSE_BODY_CHARS),
    responseBodyTruncated: true
  }
}

function normalizeHistory(
  values: HttpExecutionHistoryRecord[] | undefined,
  validRequestIds: Set<string>,
  validEnvironmentIds: Set<string>
): HttpExecutionHistoryRecord[] {
  const perRequestCounts = new Map<string, number>()
  const normalized = sortHistory(
    (values ?? [])
      .filter((item): item is HttpExecutionHistoryRecord =>
        Boolean(item?.id && item.requestId && validRequestIds.has(item.requestId))
      )
      .map((item) => {
        const responseBody = sanitizeBodyText(item.responseBody)
        const trimmedBody = trimHistoryBody(responseBody)
        const environmentId = sanitizeText(item.environmentId)

        return {
          id: item.id,
          requestId: item.requestId,
          requestName: sanitizeText(item.requestName) || '未命名请求',
          environmentId:
            environmentId && validEnvironmentIds.has(environmentId) ? environmentId : undefined,
          environmentName: sanitizeText(item.environmentName) || undefined,
          method: normalizeMethod(item.method),
          url: sanitizeText(item.url),
          executedAt: item.executedAt || nowIso(),
          durationMs: Number.isFinite(item.durationMs)
            ? Math.max(0, Math.round(item.durationMs))
            : 0,
          ok: item.ok === true,
          status: Number.isFinite(item.status) ? Math.max(0, Math.round(item.status)) : 0,
          statusText: sanitizeText(item.statusText),
          responseHeaders: normalizeResponseHeaders(item.responseHeaders),
          responseBody: trimmedBody.responseBody,
          responseBodySizeBytes: Number.isFinite(item.responseBodySizeBytes)
            ? Math.max(0, Math.round(item.responseBodySizeBytes))
            : Buffer.byteLength(responseBody, 'utf8'),
          responseBodyTruncated:
            item.responseBodyTruncated === true || trimmedBody.responseBodyTruncated,
          resolvedRequest: normalizeResolvedRequest(item.resolvedRequest),
          errorMessage: sanitizeText(item.errorMessage) || undefined
        }
      })
  )

  return normalized
    .filter((item) => {
      const count = perRequestCounts.get(item.requestId) ?? 0
      if (count >= MAX_HISTORY_PER_REQUEST) return false
      perRequestCounts.set(item.requestId, count + 1)
      return true
    })
    .slice(0, MAX_HISTORY_TOTAL)
}

function normalizeState(
  raw: StoredHttpCollectionState | null | undefined
): StoredHttpCollectionState {
  const fallback = createDefaultState()
  const source = raw ?? fallback
  const timestamp = source.updatedAt || fallback.updatedAt
  const collectionsMap = new Map<string, HttpCollection>()

  for (const [index, collection] of (source.collections ?? []).entries()) {
    if (!collection?.id) continue
    collectionsMap.set(collection.id, {
      id: collection.id,
      name: sanitizeText(collection.name) || `未命名集合 ${index + 1}`,
      description: sanitizeText(collection.description),
      order: Number.isFinite(collection.order) ? collection.order : index,
      createdAt: collection.createdAt || timestamp,
      updatedAt: collection.updatedAt || timestamp
    })
  }

  if (!collectionsMap.has(DEFAULT_COLLECTION_ID)) {
    collectionsMap.set(DEFAULT_COLLECTION_ID, createDefaultCollection(timestamp))
  }

  const collections = sortCollections(Array.from(collectionsMap.values()))
  const validCollectionIds = new Set(collections.map((collection) => collection.id))
  const requests = (source.requests ?? [])
    .filter((request): request is HttpRequestRecord => Boolean(request?.id))
    .map((request, index) => ({
      id: request.id,
      collectionId: validCollectionIds.has(request.collectionId)
        ? request.collectionId
        : DEFAULT_COLLECTION_ID,
      name: sanitizeText(request.name) || `未命名请求 ${index + 1}`,
      method: normalizeMethod(request.method),
      url: sanitizeText(request.url),
      description: sanitizeText(request.description),
      headers: normalizeKeyValues(request.headers),
      params: normalizeKeyValues(request.params),
      body: normalizeBody(request.body),
      auth: normalizeAuth(request.auth),
      tags: sanitizeTags(request.tags),
      order: Number.isFinite(request.order) ? request.order : index,
      createdAt: request.createdAt || timestamp,
      updatedAt: request.updatedAt || timestamp
    }))
  const environments = (source.environments ?? [])
    .filter((environment): environment is HttpEnvironment => Boolean(environment?.id))
    .map((environment, index) => ({
      id: environment.id,
      name: sanitizeText(environment.name) || `未命名环境 ${index + 1}`,
      variables: normalizeKeyValues(environment.variables) as HttpEnvironmentVariable[],
      order: Number.isFinite(environment.order) ? environment.order : index,
      createdAt: environment.createdAt || timestamp,
      updatedAt: environment.updatedAt || timestamp
    }))
  const validRequestIds = new Set(requests.map((request) => request.id))
  const validEnvironmentIds = new Set(environments.map((environment) => environment.id))
  const history = normalizeHistory(source.history, validRequestIds, validEnvironmentIds)

  return {
    version: 1,
    updatedAt: timestamp,
    collections,
    requests: sortRequests(requests, collections),
    environments: sortEnvironments(environments),
    history
  }
}

export class HttpCollectionService {
  private readonly paths
  private readonly repository

  constructor(rootDir: string) {
    this.paths = resolveAppDataPaths(rootDir)
    this.repository = new JsonFileRepository<StoredHttpCollectionState>(
      this.paths.files.httpCollections,
      createDefaultState
    )
  }

  async getState(): Promise<HttpCollectionModuleState> {
    const state = await this.readState()
    return this.toModuleState(state)
  }

  async saveCollection(input: HttpCollectionSaveInput): Promise<HttpCollection> {
    const name = sanitizeText(input.name)
    const description = sanitizeText(input.description)
    if (!name) {
      throw new Error('集合名称不能为空')
    }

    const timestamp = nowIso()
    let savedCollection: HttpCollection | null = null

    await this.updateState((state) => {
      const collections = [...state.collections]
      const existingIndex = collections.findIndex((collection) => collection.id === input.id)

      if (existingIndex >= 0) {
        savedCollection = {
          ...collections[existingIndex],
          name,
          description,
          updatedAt: timestamp
        }
        collections[existingIndex] = savedCollection
      } else {
        savedCollection = {
          id: randomUUID(),
          name,
          description,
          order:
            collections.reduce((maxOrder, collection) => Math.max(maxOrder, collection.order), -1) +
            1,
          createdAt: timestamp,
          updatedAt: timestamp
        }
        collections.push(savedCollection)
      }

      return {
        ...state,
        updatedAt: timestamp,
        collections: sortCollections(collections)
      }
    })

    if (!savedCollection) {
      throw new Error('集合保存失败')
    }

    return savedCollection
  }

  async saveRequest(input: HttpRequestSaveInput): Promise<HttpRequestRecord> {
    const name = sanitizeText(input.name)
    if (!name) {
      throw new Error('请求名称不能为空')
    }

    const timestamp = nowIso()
    let savedRequest: HttpRequestRecord | null = null

    await this.updateState((state) => {
      const validCollectionIds = new Set(state.collections.map((collection) => collection.id))
      const collectionId =
        input.collectionId && validCollectionIds.has(input.collectionId)
          ? input.collectionId
          : DEFAULT_COLLECTION_ID
      const requests = [...state.requests]
      const existingIndex = requests.findIndex((request) => request.id === input.id)

      if (existingIndex >= 0) {
        const current = requests[existingIndex]
        savedRequest = {
          ...current,
          collectionId,
          name,
          method: normalizeMethod(input.method),
          url: sanitizeText(input.url),
          description: sanitizeText(input.description),
          headers: normalizeKeyValues(input.headers),
          params: normalizeKeyValues(input.params),
          body: normalizeBody(input.body),
          auth: normalizeAuth(input.auth),
          tags: sanitizeTags(input.tags),
          order:
            current.collectionId === collectionId
              ? current.order
              : this.getNextRequestOrder(requests, collectionId, current.id),
          updatedAt: timestamp
        }
        requests[existingIndex] = savedRequest
      } else {
        savedRequest = {
          id: randomUUID(),
          collectionId,
          name,
          method: normalizeMethod(input.method),
          url: sanitizeText(input.url),
          description: sanitizeText(input.description),
          headers: normalizeKeyValues(input.headers),
          params: normalizeKeyValues(input.params),
          body: normalizeBody(input.body),
          auth: normalizeAuth(input.auth),
          tags: sanitizeTags(input.tags),
          order: this.getNextRequestOrder(requests, collectionId),
          createdAt: timestamp,
          updatedAt: timestamp
        }
        requests.push(savedRequest)
      }

      return {
        ...state,
        updatedAt: timestamp,
        requests: sortRequests(requests, state.collections)
      }
    })

    if (!savedRequest) {
      throw new Error('请求保存失败')
    }

    return savedRequest
  }

  async deleteRequest(requestId: string): Promise<{ ok: boolean }> {
    const normalizedId = sanitizeText(requestId)
    if (!normalizedId) {
      return { ok: false }
    }

    let removed = false
    await this.updateState((state) => {
      const requests = state.requests.filter((request) => {
        const keep = request.id !== normalizedId
        if (!keep) removed = true
        return keep
      })

      if (!removed) {
        return state
      }

      return {
        ...state,
        updatedAt: nowIso(),
        requests: sortRequests(requests, state.collections),
        history: state.history.filter((item) => item.requestId !== normalizedId)
      }
    })

    return { ok: removed }
  }

  async saveEnvironment(input: HttpEnvironmentSaveInput): Promise<HttpEnvironment> {
    const name = sanitizeText(input.name)
    if (!name) {
      throw new Error('环境名称不能为空')
    }

    const timestamp = nowIso()
    let savedEnvironment: HttpEnvironment | null = null

    await this.updateState((state) => {
      const environments = [...state.environments]
      const existingIndex = environments.findIndex((environment) => environment.id === input.id)

      if (existingIndex >= 0) {
        savedEnvironment = {
          ...environments[existingIndex],
          name,
          variables: normalizeKeyValues(input.variables) as HttpEnvironmentVariable[],
          updatedAt: timestamp
        }
        environments[existingIndex] = savedEnvironment
      } else {
        savedEnvironment = {
          id: randomUUID(),
          name,
          variables: normalizeKeyValues(input.variables) as HttpEnvironmentVariable[],
          order:
            environments.reduce(
              (maxOrder, environment) => Math.max(maxOrder, environment.order),
              -1
            ) + 1,
          createdAt: timestamp,
          updatedAt: timestamp
        }
        environments.push(savedEnvironment)
      }

      return {
        ...state,
        updatedAt: timestamp,
        environments: sortEnvironments(environments)
      }
    })

    if (!savedEnvironment) {
      throw new Error('环境保存失败')
    }

    return savedEnvironment
  }

  async deleteEnvironment(environmentId: string): Promise<{ ok: boolean }> {
    const normalizedId = sanitizeText(environmentId)
    if (!normalizedId) {
      return { ok: false }
    }

    let removed = false
    await this.updateState((state) => {
      const environments = state.environments.filter((environment) => {
        const keep = environment.id !== normalizedId
        if (!keep) removed = true
        return keep
      })

      if (!removed) {
        return state
      }

      return {
        ...state,
        updatedAt: nowIso(),
        environments: sortEnvironments(environments)
      }
    })

    return { ok: removed }
  }

  async resolveRequest(input: HttpExecuteRequestInput): Promise<HttpResolvedRequest> {
    return (await this.prepareExecution(input)).resolvedRequest
  }

  async executeRequest(input: HttpExecuteRequestInput): Promise<HttpExecuteRequestResult> {
    const timeoutMs = normalizeTimeout(input.timeoutMs)
    const context = await this.prepareExecution(input)
    const { resolvedRequest } = context
    const executedAt = nowIso()
    const startedAt = performance.now()
    const abortController = new AbortController()
    const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs)

    try {
      const init: RequestInit = {
        method: resolvedRequest.method,
        headers: headersToObject(resolvedRequest.headers),
        signal: abortController.signal
      }

      if (
        !['GET', 'HEAD'].includes(resolvedRequest.method) &&
        resolvedRequest.bodyType !== 'none'
      ) {
        init.body = resolvedRequest.body
      }

      const response = await fetch(resolvedRequest.url, init)
      const body = await readResponseBody(response)
      const result: HttpExecuteRequestResult = {
        requestId: resolvedRequest.requestId,
        environmentId: resolvedRequest.environmentId,
        executedAt,
        durationMs: Math.round(performance.now() - startedAt),
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: responseHeadersToList(response.headers),
        body,
        bodySizeBytes: Buffer.byteLength(body, 'utf8'),
        resolvedRequest
      }
      await this.appendHistory(context, result)
      return result
    } catch (error) {
      const errorMessage =
        error instanceof Error && error.name === 'AbortError'
          ? `请求超时：${timeoutMs}ms 内未收到响应`
          : error instanceof Error
            ? error.message
            : String(error)

      const result: HttpExecuteRequestResult = {
        requestId: resolvedRequest.requestId,
        environmentId: resolvedRequest.environmentId,
        executedAt,
        durationMs: Math.round(performance.now() - startedAt),
        ok: false,
        status: 0,
        statusText: 'REQUEST_ERROR',
        headers: [],
        body: '',
        bodySizeBytes: 0,
        resolvedRequest,
        errorMessage
      }
      await this.appendHistory(context, result)
      return result
    } finally {
      clearTimeout(timeoutHandle)
    }
  }

  async executeBatch(input: HttpBatchExecuteInput): Promise<HttpBatchExecuteResult> {
    const state = await this.readState()
    const collectionId = sanitizeText(input.collectionId)
    const requestedIds = new Set(
      (input.requestIds ?? []).map((id) => sanitizeText(id)).filter(Boolean)
    )
    const requests = state.requests.filter((request) => {
      if (requestedIds.size > 0) return requestedIds.has(request.id)
      if (collectionId) return request.collectionId === collectionId
      return true
    })

    if (collectionId && !state.collections.some((collection) => collection.id === collectionId)) {
      throw new Error('未找到要批量测试的 HTTP 集合')
    }

    if (requests.length === 0) {
      throw new Error('当前范围内没有可批量测试的 HTTP 请求')
    }

    const executedAt = nowIso()
    const startedAt = performance.now()
    const results: HttpExecuteRequestResult[] = []

    for (const request of requests) {
      results.push(
        await this.executeRequest({
          requestId: request.id,
          environmentId: input.environmentId,
          timeoutMs: input.timeoutMs
        })
      )
    }

    const succeeded = results.filter((result) => result.ok).length

    return {
      collectionId: collectionId || undefined,
      environmentId: sanitizeText(input.environmentId) || undefined,
      executedAt,
      summary: {
        total: results.length,
        succeeded,
        failed: results.length - succeeded,
        durationMs: Math.round(performance.now() - startedAt)
      },
      results
    }
  }

  async clearHistory(input: HttpClearHistoryInput = {}): Promise<{ ok: boolean; removed: number }> {
    const requestId = sanitizeText(input.requestId)
    let removed = 0

    await this.updateState((state) => {
      const history = requestId
        ? state.history.filter((item) => {
            const keep = item.requestId !== requestId
            if (!keep) removed += 1
            return keep
          })
        : []

      if (!requestId) {
        removed = state.history.length
      }

      if (removed === 0) {
        return state
      }

      return {
        ...state,
        updatedAt: nowIso(),
        history
      }
    })

    return {
      ok: removed > 0,
      removed
    }
  }

  async exportBackupSection(): Promise<
    Pick<HttpCollectionModuleState, 'collections' | 'requests' | 'environments' | 'history'>
  > {
    const state = await this.readState()
    return {
      collections: [...state.collections],
      requests: [...state.requests],
      environments: [...state.environments],
      history: [...state.history]
    }
  }

  async restoreBackupSection(
    section: Pick<HttpCollectionModuleState, 'collections' | 'requests' | 'environments'> &
      Partial<Pick<HttpCollectionModuleState, 'history'>>
  ): Promise<HttpCollectionModuleState> {
    const restored = normalizeState({
      version: 1,
      updatedAt: nowIso(),
      collections: section.collections ?? [],
      requests: section.requests ?? [],
      environments: section.environments ?? [],
      history: section.history ?? []
    })
    await ensureAppDataLayout(this.paths)
    await this.repository.write(restored)
    return this.toModuleState(restored)
  }

  private async readState(): Promise<StoredHttpCollectionState> {
    await ensureAppDataLayout(this.paths)
    const raw = await this.repository.read()
    const normalized = normalizeState(raw)

    if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
      await this.repository.write(normalized)
    }

    return normalized
  }

  private async updateState(
    mutator: (
      state: StoredHttpCollectionState
    ) => StoredHttpCollectionState | Promise<StoredHttpCollectionState>
  ): Promise<StoredHttpCollectionState> {
    await ensureAppDataLayout(this.paths)

    return this.repository.update(async (raw) => {
      const normalized = normalizeState(raw)
      return normalizeState(await mutator(normalized))
    })
  }

  private toModuleState(state: StoredHttpCollectionState): HttpCollectionModuleState {
    return {
      storageFile: this.paths.files.httpCollections,
      defaultCollectionId: DEFAULT_COLLECTION_ID,
      updatedAt: state.updatedAt,
      collections: sortCollections(state.collections),
      requests: sortRequests(state.requests, state.collections),
      environments: sortEnvironments(state.environments),
      history: sortHistory(state.history)
    }
  }

  private async prepareExecution(input: HttpExecuteRequestInput): Promise<ExecutionContext> {
    const requestId = sanitizeText(input.requestId)
    if (!requestId) {
      throw new Error('请求 ID 不能为空')
    }

    const state = await this.readState()
    const request = state.requests.find((item) => item.id === requestId)
    if (!request) {
      throw new Error('未找到要执行的 HTTP 请求')
    }

    const environmentId = sanitizeText(input.environmentId)
    const environment = environmentId
      ? state.environments.find((item) => item.id === environmentId)
      : undefined
    if (environmentId && !environment) {
      throw new Error('未找到所选环境变量集')
    }

    return {
      request,
      environment,
      resolvedRequest: this.resolveRequestWithEnvironment(request, environment)
    }
  }

  private async appendHistory(
    context: ExecutionContext,
    result: HttpExecuteRequestResult
  ): Promise<void> {
    const trimmedBody = trimHistoryBody(result.body)
    const historyRecord: HttpExecutionHistoryRecord = {
      id: randomUUID(),
      requestId: context.request.id,
      requestName: context.request.name,
      environmentId: context.environment?.id,
      environmentName: context.environment?.name,
      method: result.resolvedRequest.method,
      url: result.resolvedRequest.url,
      executedAt: result.executedAt,
      durationMs: result.durationMs,
      ok: result.ok,
      status: result.status,
      statusText: result.statusText,
      responseHeaders: result.headers,
      responseBody: trimmedBody.responseBody,
      responseBodySizeBytes: result.bodySizeBytes,
      responseBodyTruncated: trimmedBody.responseBodyTruncated,
      resolvedRequest: result.resolvedRequest,
      errorMessage: result.errorMessage
    }

    await this.updateState((state) => ({
      ...state,
      updatedAt: historyRecord.executedAt,
      history: normalizeHistory(
        [historyRecord, ...state.history],
        new Set(state.requests.map((request) => request.id)),
        new Set(state.environments.map((environment) => environment.id))
      )
    }))
  }

  private getNextRequestOrder(
    requests: HttpRequestRecord[],
    collectionId: string,
    ignoreId?: string
  ): number {
    return (
      requests
        .filter((request) => request.collectionId === collectionId && request.id !== ignoreId)
        .reduce((maxOrder, request) => Math.max(maxOrder, request.order), -1) + 1
    )
  }

  private resolveRequestWithEnvironment(
    request: HttpRequestRecord,
    environment: HttpEnvironment | undefined
  ): HttpResolvedRequest {
    const variables = createVariableMap(environment)
    const unresolvedVariables = new Set<string>()
    const replace = (value: string): string =>
      replaceVariables(value, variables, unresolvedVariables)
    const params = request.params
      .filter((item) => item.enabled !== false && item.key)
      .map((item) => ({
        key: replace(item.key),
        value: replace(item.value)
      }))
    let headers = request.headers
      .filter((item) => item.enabled !== false && item.key)
      .map((item) => ({
        key: replace(item.key),
        value: replace(item.value)
      }))
    const body = resolveBody({
      type: request.body.type,
      content: replace(request.body.content)
    })

    if (request.auth.type === 'bearer' && request.auth.token) {
      headers = setHeader(headers, 'Authorization', `Bearer ${replace(request.auth.token)}`)
    }

    if (request.auth.type === 'basic') {
      headers = setHeader(
        headers,
        'Authorization',
        basicAuthHeader(replace(request.auth.username), replace(request.auth.password))
      )
    }

    if (body.bodyType === 'json' && body.body && !hasHeader(headers, 'content-type')) {
      headers = setHeader(headers, 'Content-Type', 'application/json')
    }

    if (body.bodyType === 'form' && body.body && !hasHeader(headers, 'content-type')) {
      headers = setHeader(headers, 'Content-Type', 'application/x-www-form-urlencoded')
    }

    return {
      requestId: request.id,
      environmentId: environment?.id,
      method: request.method,
      url: buildUrl(replace(request.url), params),
      headers,
      bodyType: body.bodyType,
      body: body.body,
      unresolvedVariables: Array.from(unresolvedVariables).sort()
    }
  }
}
