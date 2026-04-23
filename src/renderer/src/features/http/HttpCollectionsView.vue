<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import {
  NButton,
  NCard,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NTag,
  NText,
  useMessage
} from 'naive-ui'
import type {
  HttpAuth,
  HttpBody,
  HttpEnvironment,
  HttpKeyValue,
  HttpMethod,
  HttpResponseHeader,
  HttpRequestRecord
} from '@shared/ipc-contract'
import { useHttpCollectionsStore } from '@renderer/stores/http-collections'
import {
  exportCollectionAsPostman,
  exportRequestAsCurl,
  exportRequestAsHttpie,
  parseCurlCommand,
  parsePostmanCollection
} from './http-format-converters'

type CollectionFormState = {
  id?: string
  name: string
  description: string
}

type RequestFormState = {
  id?: string
  collectionId: string
  name: string
  method: HttpMethod
  url: string
  description: string
  headersText: string
  paramsText: string
  bodyType: HttpBody['type']
  bodyContent: string
  authType: HttpAuth['type']
  authToken: string
  authUsername: string
  authPassword: string
  tagsText: string
}

type EnvironmentFormState = {
  id?: string
  name: string
  variablesText: string
}

type ExportFormat = 'curl' | 'httpie' | 'postman'

const message = useMessage()
const httpStore = useHttpCollectionsStore()
const collectionModalVisible = ref(false)
const requestModalVisible = ref(false)
const environmentModalVisible = ref(false)
const curlImportModalVisible = ref(false)
const postmanImportModalVisible = ref(false)
const exportModalVisible = ref(false)
const curlImportText = ref('')
const postmanImportText = ref('')
const exportText = ref('')
const exportFormat = ref<ExportFormat>('curl')
const collectionForm = reactive<CollectionFormState>({
  id: '',
  name: '',
  description: ''
})
const requestForm = reactive<RequestFormState>({
  id: '',
  collectionId: '',
  name: '',
  method: 'GET',
  url: '',
  description: '',
  headersText: '',
  paramsText: '',
  bodyType: 'none',
  bodyContent: '',
  authType: 'none',
  authToken: '',
  authUsername: '',
  authPassword: '',
  tagsText: ''
})
const environmentForm = reactive<EnvironmentFormState>({
  id: '',
  name: '',
  variablesText: ''
})

const methodOptions: Array<{ label: string; value: HttpMethod }> = [
  { label: 'GET', value: 'GET' },
  { label: 'POST', value: 'POST' },
  { label: 'PUT', value: 'PUT' },
  { label: 'PATCH', value: 'PATCH' },
  { label: 'DELETE', value: 'DELETE' },
  { label: 'HEAD', value: 'HEAD' },
  { label: 'OPTIONS', value: 'OPTIONS' }
]
const bodyTypeOptions: Array<{ label: string; value: HttpBody['type'] }> = [
  { label: '无 Body', value: 'none' },
  { label: 'JSON', value: 'json' },
  { label: 'Text', value: 'text' },
  { label: 'Form', value: 'form' }
]
const authTypeOptions: Array<{ label: string; value: HttpAuth['type'] }> = [
  { label: '无认证', value: 'none' },
  { label: 'Bearer Token', value: 'bearer' },
  { label: 'Basic Auth', value: 'basic' }
]
const collectionOptions = computed(() =>
  httpStore.collections.map((collection) => ({ label: collection.name, value: collection.id }))
)
const environmentOptions = computed(() => [
  { label: '不使用环境变量', value: '' },
  ...httpStore.environments.map((environment) => ({
    label: environment.name,
    value: environment.id
  }))
])
const stats = computed(() => ({
  collections: httpStore.collections.length,
  requests: httpStore.requests.length,
  environments: httpStore.environments.length,
  history: httpStore.history.length
}))
const activeRequestHeaders = computed(
  () => httpStore.activeRequest?.headers.filter((item) => item.enabled) ?? []
)
const activeRequestParams = computed(
  () => httpStore.activeRequest?.params.filter((item) => item.enabled) ?? []
)
const activeRequestTags = computed(() => httpStore.activeRequest?.tags ?? [])
const isEditingCollection = computed(() => Boolean(collectionForm.id))
const isEditingRequest = computed(() => Boolean(requestForm.id))
const isEditingEnvironment = computed(() => Boolean(environmentForm.id))

function formatUpdatedAt(value: string): string {
  if (!value) return '等待初始化'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function formatHistoryTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function methodClass(method: HttpMethod): string {
  return `is-${method.toLowerCase()}`
}

function serializeKeyValues(values: HttpKeyValue[]): string {
  return values
    .map((item) => `${item.enabled === false ? '# ' : ''}${item.key}: ${item.value}`)
    .join('\n')
}

function serializeResponseHeaders(values: HttpResponseHeader[]): string {
  return values.map((item) => `${item.key}: ${item.value}`).join('\n')
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function parseKeyValues(text: string): Array<Partial<HttpKeyValue>> {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const enabled = !line.startsWith('#')
      const normalizedLine = enabled ? line : line.slice(1).trim()
      const separatorIndex = normalizedLine.indexOf(':')
      if (separatorIndex < 0) {
        return {
          key: normalizedLine,
          value: '',
          enabled,
          description: ''
        }
      }

      return {
        key: normalizedLine.slice(0, separatorIndex).trim(),
        value: normalizedLine.slice(separatorIndex + 1).trim(),
        enabled,
        description: ''
      }
    })
}

function openCreateCollectionModal(): void {
  collectionForm.id = ''
  collectionForm.name = ''
  collectionForm.description = ''
  collectionModalVisible.value = true
}

function openEditCollectionModal(): void {
  const collection = httpStore.activeCollection
  if (!collection) return
  collectionForm.id = collection.id
  collectionForm.name = collection.name
  collectionForm.description = collection.description
  collectionModalVisible.value = true
}

function openCreateRequestModal(): void {
  requestForm.id = ''
  requestForm.collectionId = httpStore.activeCollectionId || httpStore.defaultCollectionId
  requestForm.name = ''
  requestForm.method = 'GET'
  requestForm.url = ''
  requestForm.description = ''
  requestForm.headersText = ''
  requestForm.paramsText = ''
  requestForm.bodyType = 'none'
  requestForm.bodyContent = ''
  requestForm.authType = 'none'
  requestForm.authToken = ''
  requestForm.authUsername = ''
  requestForm.authPassword = ''
  requestForm.tagsText = ''
  requestModalVisible.value = true
}

function openEditRequestModal(request: HttpRequestRecord): void {
  requestForm.id = request.id
  requestForm.collectionId = request.collectionId
  requestForm.name = request.name
  requestForm.method = request.method
  requestForm.url = request.url
  requestForm.description = request.description
  requestForm.headersText = serializeKeyValues(request.headers)
  requestForm.paramsText = serializeKeyValues(request.params)
  requestForm.bodyType = request.body.type
  requestForm.bodyContent = request.body.content
  requestForm.authType = request.auth.type
  requestForm.authToken = request.auth.token
  requestForm.authUsername = request.auth.username
  requestForm.authPassword = request.auth.password
  requestForm.tagsText = request.tags.join(', ')
  requestModalVisible.value = true
}

function openCreateEnvironmentModal(): void {
  environmentForm.id = ''
  environmentForm.name = ''
  environmentForm.variablesText = ''
  environmentModalVisible.value = true
}

function openEditEnvironmentModal(environment: HttpEnvironment): void {
  environmentForm.id = environment.id
  environmentForm.name = environment.name
  environmentForm.variablesText = serializeKeyValues(environment.variables)
  environmentModalVisible.value = true
}

async function submitCollection(): Promise<void> {
  try {
    await httpStore.saveCollection({
      id: collectionForm.id || undefined,
      name: collectionForm.name,
      description: collectionForm.description
    })
    collectionModalVisible.value = false
    message.success(isEditingCollection.value ? '集合已更新' : '集合已创建')
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

async function submitRequest(): Promise<void> {
  try {
    await httpStore.saveRequest({
      id: requestForm.id || undefined,
      collectionId: requestForm.collectionId,
      name: requestForm.name,
      method: requestForm.method,
      url: requestForm.url,
      description: requestForm.description,
      headers: parseKeyValues(requestForm.headersText),
      params: parseKeyValues(requestForm.paramsText),
      body: {
        type: requestForm.bodyType,
        content: requestForm.bodyContent
      },
      auth: {
        type: requestForm.authType,
        token: requestForm.authToken,
        username: requestForm.authUsername,
        password: requestForm.authPassword
      },
      tags: requestForm.tagsText.split(/[,，]/)
    })
    requestModalVisible.value = false
    message.success(isEditingRequest.value ? '请求已更新' : '请求已创建')
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

async function submitEnvironment(): Promise<void> {
  try {
    await httpStore.saveEnvironment({
      id: environmentForm.id || undefined,
      name: environmentForm.name,
      variables: parseKeyValues(environmentForm.variablesText)
    })
    environmentModalVisible.value = false
    message.success(isEditingEnvironment.value ? '环境已更新' : '环境已创建')
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

async function importCurlRequest(): Promise<void> {
  try {
    await httpStore.saveRequest(
      parseCurlCommand(curlImportText.value, httpStore.activeCollectionId)
    )
    curlImportText.value = ''
    curlImportModalVisible.value = false
    message.success('cURL 已导入为 HTTP 请求')
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

async function importPostmanRequests(): Promise<void> {
  try {
    const inputs = parsePostmanCollection(postmanImportText.value, httpStore.activeCollectionId)
    for (const input of inputs) {
      await httpStore.saveRequest(input)
    }
    postmanImportText.value = ''
    postmanImportModalVisible.value = false
    message.success(`Postman 已导入 ${inputs.length} 条请求`)
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

async function removeRequest(requestId: string): Promise<void> {
  try {
    const ok = await httpStore.removeRequest(requestId)
    message[ok ? 'success' : 'warning'](ok ? '请求已删除' : '未找到要删除的请求')
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

async function removeEnvironment(environmentId: string): Promise<void> {
  try {
    const ok = await httpStore.removeEnvironment(environmentId)
    message[ok ? 'success' : 'warning'](ok ? '环境已删除' : '未找到要删除的环境')
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

async function executeActiveRequest(): Promise<void> {
  try {
    const result = await httpStore.executeActiveRequest()
    if (result.ok) {
      message.success(`请求完成：HTTP ${result.status}，${result.durationMs}ms`)
      return
    }

    message.warning(result.errorMessage || `请求完成但响应状态为 HTTP ${result.status}`)
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

async function clearActiveRequestHistory(): Promise<void> {
  try {
    const result = await httpStore.clearActiveRequestHistory()
    message[result.ok ? 'success' : 'warning'](
      result.ok ? `已清空 ${result.removed} 条请求历史` : '当前请求暂无可清空历史'
    )
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

async function executeActiveCollectionBatch(): Promise<void> {
  try {
    const result = await httpStore.executeActiveCollectionBatch()
    message[result.summary.failed === 0 ? 'success' : 'warning'](
      `批量测试完成：成功 ${result.summary.succeeded}，失败 ${result.summary.failed}，共 ${result.summary.total}`
    )
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

function openExportModal(format: ExportFormat): void {
  if (!httpStore.activeRequest) {
    message.warning('请先选择一个 HTTP 请求')
    return
  }

  exportFormat.value = format
  if (format === 'postman') {
    if (!httpStore.activeCollection) {
      message.warning('请先选择一个 HTTP 集合')
      return
    }
    exportText.value = exportCollectionAsPostman(
      httpStore.activeCollection,
      httpStore.requests.filter(
        (request) => request.collectionId === httpStore.activeCollection?.id
      )
    )
  } else {
    exportText.value =
      format === 'curl'
        ? exportRequestAsCurl(httpStore.activeRequest)
        : exportRequestAsHttpie(httpStore.activeRequest)
  }
  exportModalVisible.value = true
}

async function copyExportText(): Promise<void> {
  if (!exportText.value) {
    message.warning('暂无可复制内容')
    return
  }

  try {
    await navigator.clipboard.writeText(exportText.value)
    message.success('导出命令已复制')
  } catch {
    message.error('当前环境无法直接写入剪贴板')
  }
}

watch(
  () => httpStore.activeCollectionId,
  (collectionId) => {
    if (!requestForm.collectionId && collectionId) {
      requestForm.collectionId = collectionId
    }
  }
)

onMounted(() => {
  void httpStore.load()
})
</script>

<template>
  <section class="page-heading">
    <p class="eyebrow">http collections</p>
    <h2>HTTP 集合 / 请求编辑器</h2>
    <p>
      P3 已接入 HTTP 集合页的数据底座和基础请求执行链路：集合、请求和环境变量通过 Electron IPC
      保存到 `appData/storage/http-collections.json`，真实网络发送统一由 Main Process
      执行，并自动记录请求历史。批量测试和第三方导入导出放到后续小模块。
    </p>
  </section>

  <section class="http-summary-grid">
    <article class="progress-card">
      <div class="progress-head">
        <strong>集合</strong>
        <span>{{ stats.collections }}</span>
      </div>
      <p>本轮支持创建和编辑集合，用来承接旧项目 collection tree 的顶层分组。</p>
    </article>
    <article class="progress-card">
      <div class="progress-head">
        <strong>请求</strong>
        <span>{{ stats.requests }}</span>
      </div>
      <p>请求资料支持方法、URL、Headers、Params、Body、Auth 和标签，不执行网络请求。</p>
    </article>
    <article class="progress-card">
      <div class="progress-head">
        <strong>环境</strong>
        <span>{{ stats.environments }}</span>
      </div>
      <p v-pre>环境变量支持 `{{ 变量名 }}` 替换，发送前会在 Main Process 统一解析。</p>
    </article>
    <article class="progress-card">
      <div class="progress-head">
        <strong>历史</strong>
        <span>{{ stats.history }}</span>
      </div>
      <p>每个请求最多保留 50 条历史，全局最多 500 条，随 HTTP 集合一起备份。</p>
    </article>
  </section>

  <NCard class="soft-card http-toolbar" :bordered="false">
    <div class="http-toolbar-row">
      <NInput
        :value="httpStore.search"
        clearable
        placeholder="搜索请求名称、URL、Header、Param、Body、标签"
        @update:value="httpStore.setSearch"
      />
      <NSelect
        :value="httpStore.activeCollectionId"
        :options="collectionOptions"
        placeholder="选择集合"
        @update:value="httpStore.setActiveCollection"
      />
      <NButton secondary :loading="httpStore.loading" @click="httpStore.load">刷新</NButton>
      <NButton
        secondary
        :loading="httpStore.batchExecuting"
        :disabled="httpStore.visibleRequests.length === 0"
        @click="executeActiveCollectionBatch"
      >
        批量测试
      </NButton>
      <NButton secondary @click="curlImportModalVisible = true">导入 cURL</NButton>
      <NButton secondary @click="postmanImportModalVisible = true">导入 Postman</NButton>
      <NButton type="primary" @click="openCreateRequestModal">新增请求</NButton>
    </div>
  </NCard>

  <div class="http-shell">
    <NCard class="soft-card http-collections-panel" :bordered="false">
      <template #header>
        <div class="card-title-row">
          <span>集合树</span>
          <NButton size="small" secondary @click="openCreateCollectionModal">新增</NButton>
        </div>
      </template>

      <div class="http-collections-list">
        <button
          v-for="collection in httpStore.collections"
          :key="collection.id"
          class="tool-nav-item http-collection-item"
          :class="{ active: collection.id === httpStore.activeCollectionId }"
          type="button"
          @click="httpStore.setActiveCollection(collection.id)"
        >
          <div>
            <strong>{{ collection.name }}</strong>
            <p>{{ collection.description || '暂无描述' }}</p>
          </div>
          <NTag size="small" :bordered="false">
            {{ httpStore.countByCollection(collection.id) }}
          </NTag>
        </button>
      </div>

      <div class="http-sidebar-meta">
        <strong>Repository</strong>
        <NText depth="3">{{ httpStore.storageFile || '等待初始化' }}</NText>
        <strong>最近更新</strong>
        <NText depth="3">{{ formatUpdatedAt(httpStore.updatedAt) }}</NText>
        <NButton size="small" secondary @click="openEditCollectionModal">编辑当前集合</NButton>
      </div>
    </NCard>

    <NCard class="soft-card http-editor-panel" :bordered="false">
      <template #header>
        <div class="card-title-row">
          <span>请求列表</span>
          <NTag size="small" :bordered="false">local only</NTag>
        </div>
      </template>

      <div v-if="httpStore.visibleRequests.length > 0" class="http-request-list">
        <button
          v-for="request in httpStore.visibleRequests"
          :key="request.id"
          class="tool-nav-item http-request-item"
          :class="{ active: request.id === httpStore.activeRequestId }"
          type="button"
          @click="httpStore.setActiveRequest(request.id)"
        >
          <div>
            <strong>{{ request.name }}</strong>
            <p>{{ request.url || '未填写 URL' }}</p>
          </div>
          <span class="http-method-chip" :class="methodClass(request.method)">
            {{ request.method }}
          </span>
        </button>
      </div>
      <NEmpty v-else description="当前集合或搜索条件下还没有请求">
        <template #extra>
          <NButton type="primary" @click="openCreateRequestModal">创建第一条请求</NButton>
        </template>
      </NEmpty>
    </NCard>

    <div class="http-editor-stack">
      <NCard v-if="httpStore.activeRequest" class="soft-card http-request-card" :bordered="false">
        <template #header>
          <div class="http-request-head">
            <div>
              <strong>{{ httpStore.activeRequest.name }}</strong>
              <p>{{ httpStore.activeRequest.description || '暂无描述' }}</p>
            </div>
            <span class="http-method-chip" :class="methodClass(httpStore.activeRequest.method)">
              {{ httpStore.activeRequest.method }}
            </span>
          </div>
        </template>

        <NSpace vertical size="large">
          <pre class="http-url-preview">{{ httpStore.activeRequest.url || '未填写 URL' }}</pre>

          <div class="http-request-meta">
            <div>
              <strong>Headers</strong>
              <span>{{ activeRequestHeaders.length }} 个启用项</span>
            </div>
            <div>
              <strong>Params</strong>
              <span>{{ activeRequestParams.length }} 个启用项</span>
            </div>
            <div>
              <strong>Body</strong>
              <span>{{ httpStore.activeRequest.body.type }}</span>
            </div>
            <div>
              <strong>Auth</strong>
              <span>{{ httpStore.activeRequest.auth.type }}</span>
            </div>
          </div>

          <div v-if="activeRequestTags.length > 0" class="chip-list">
            <span v-for="tag in activeRequestTags" :key="tag" class="chip">{{ tag }}</span>
          </div>

          <pre class="http-code-block">{{
            httpStore.activeRequest.body.content || '暂无 Body'
          }}</pre>

          <div class="http-execute-bar">
            <NSelect
              :value="httpStore.selectedEnvironmentId"
              :options="environmentOptions"
              placeholder="选择环境变量集"
              @update:value="httpStore.setSelectedEnvironment"
            />
            <NButton
              type="primary"
              :loading="httpStore.executing"
              :disabled="!httpStore.activeRequest.url"
              @click="executeActiveRequest"
            >
              发送请求
            </NButton>
          </div>

          <div class="http-editor-actions">
            <NButton secondary @click="openEditRequestModal(httpStore.activeRequest)"
              >编辑请求</NButton
            >
            <NButton secondary @click="openExportModal('curl')">导出 cURL</NButton>
            <NButton secondary @click="openExportModal('httpie')">导出 HTTPie</NButton>
            <NButton secondary @click="openExportModal('postman')">导出 Postman</NButton>
            <NPopconfirm @positive-click="removeRequest(httpStore.activeRequest.id)">
              <template #trigger>
                <NButton tertiary type="error">删除请求</NButton>
              </template>
              删除后会立即写回本地 HTTP 集合资料库。确定继续？
            </NPopconfirm>
          </div>
        </NSpace>
      </NCard>

      <NCard v-else class="soft-card http-empty-card" :bordered="false">
        <NEmpty description="请选择或创建一个 HTTP 请求" />
      </NCard>

      <NCard class="soft-card http-response-card" :bordered="false">
        <template #header>
          <div class="http-response-head">
            <div>
              <strong>响应结果</strong>
              <p>由 Electron Main Process 发送，Renderer 只展示结果。</p>
            </div>
            <span
              class="http-status-pill"
              :class="{ 'is-error': httpStore.executionResult && !httpStore.executionResult.ok }"
            >
              {{
                httpStore.executionResult ? httpStore.executionResult.status || 'ERROR' : 'WAITING'
              }}
            </span>
          </div>
        </template>

        <NSpace v-if="httpStore.executionResult" vertical size="large">
          <div class="http-response-stats">
            <div>
              <span>耗时</span>
              <strong>{{ httpStore.executionResult.durationMs }} ms</strong>
            </div>
            <div>
              <span>大小</span>
              <strong>{{ formatBytes(httpStore.executionResult.bodySizeBytes) }}</strong>
            </div>
            <div>
              <span>状态</span>
              <strong>
                {{
                  httpStore.executionResult.errorMessage ||
                  `${httpStore.executionResult.status} ${httpStore.executionResult.statusText}`
                }}
              </strong>
            </div>
          </div>

          <div class="http-section-head">
            <div>
              <strong>已解析请求</strong>
              <p>URL、Header、Body 已完成环境变量替换，未解析变量会在下方列出。</p>
            </div>
          </div>
          <pre class="http-url-preview">{{ httpStore.executionResult.resolvedRequest.url }}</pre>
          <pre class="http-code-block">{{
            serializeResponseHeaders(httpStore.executionResult.resolvedRequest.headers) ||
            '未发送 Header'
          }}</pre>
          <pre v-if="httpStore.executionResult.resolvedRequest.body" class="http-code-block">{{
            httpStore.executionResult.resolvedRequest.body
          }}</pre>

          <div
            v-if="httpStore.executionResult.resolvedRequest.unresolvedVariables.length > 0"
            class="http-warning-card"
          >
            <strong>未解析变量</strong>
            <p>
              {{ httpStore.executionResult.resolvedRequest.unresolvedVariables.join(', ') }}
            </p>
          </div>

          <div class="http-section-head">
            <div>
              <strong>响应 Headers</strong>
              <p>按服务端返回原样展示。</p>
            </div>
          </div>
          <pre class="http-json-preview">{{
            serializeResponseHeaders(httpStore.executionResult.headers) || '暂无响应 Header'
          }}</pre>

          <div class="http-section-head">
            <div>
              <strong>响应 Body</strong>
              <p>当前以 UTF-8 文本展示，二进制预览后续单独做。</p>
            </div>
          </div>
          <pre class="http-response-preview">{{
            httpStore.executionResult.body ||
            httpStore.executionResult.errorMessage ||
            '暂无响应内容'
          }}</pre>
        </NSpace>
        <NEmpty v-else description="发送请求后会在这里展示响应状态、Headers、Body 和解析后的请求" />
      </NCard>

      <NCard class="soft-card http-response-card" :bordered="false">
        <template #header>
          <div class="http-response-head">
            <div>
              <strong>批量测试</strong>
              <p>按当前集合的请求顺序串行执行，复用同一个环境变量集。</p>
            </div>
            <NButton
              size="small"
              secondary
              :loading="httpStore.batchExecuting"
              :disabled="httpStore.visibleRequests.length === 0"
              @click="executeActiveCollectionBatch"
            >
              执行当前集合
            </NButton>
          </div>
        </template>

        <NSpace v-if="httpStore.batchResult" vertical size="large">
          <div class="http-response-stats">
            <div>
              <span>总数</span>
              <strong>{{ httpStore.batchResult.summary.total }}</strong>
            </div>
            <div>
              <span>成功</span>
              <strong>{{ httpStore.batchResult.summary.succeeded }}</strong>
            </div>
            <div>
              <span>失败</span>
              <strong>{{ httpStore.batchResult.summary.failed }}</strong>
            </div>
          </div>

          <div class="http-batch-list">
            <article
              v-for="result in httpStore.batchResult.results"
              :key="`${result.requestId}-${result.executedAt}`"
              class="http-batch-item"
            >
              <div>
                <strong>{{ result.resolvedRequest.method }} {{ result.status || 'ERROR' }}</strong>
                <p>{{ result.resolvedRequest.url }}</p>
              </div>
              <span class="http-status-pill" :class="{ 'is-error': !result.ok }">
                {{ result.ok ? `${result.durationMs}ms` : result.errorMessage || 'FAIL' }}
              </span>
            </article>
          </div>
        </NSpace>

        <NEmpty v-else description="点击批量测试后，会展示当前集合每条请求的执行结果" />
      </NCard>

      <NCard class="soft-card http-response-card" :bordered="false">
        <template #header>
          <div class="card-title-row">
            <span>请求历史</span>
            <NPopconfirm
              :disabled="httpStore.activeRequestHistory.length === 0"
              @positive-click="clearActiveRequestHistory"
            >
              <template #trigger>
                <NButton
                  size="small"
                  tertiary
                  type="error"
                  :disabled="httpStore.activeRequestHistory.length === 0"
                >
                  清空当前请求
                </NButton>
              </template>
              只会清空当前请求的执行历史，不会删除请求配置。确定继续？
            </NPopconfirm>
          </div>
        </template>

        <div v-if="httpStore.activeRequestHistory.length > 0" class="http-history-layout">
          <div class="http-history-list">
            <button
              v-for="history in httpStore.activeRequestHistory"
              :key="history.id"
              class="tool-nav-item http-history-item"
              :class="{ active: history.id === httpStore.activeHistory?.id }"
              type="button"
              @click="httpStore.setActiveHistory(history.id)"
            >
              <div>
                <strong>
                  {{ history.status || 'ERROR' }}
                  {{ history.statusText || history.errorMessage || '' }}
                </strong>
                <p>{{ formatHistoryTime(history.executedAt) }} · {{ history.durationMs }}ms</p>
              </div>
              <span class="http-status-pill" :class="{ 'is-error': !history.ok }">
                {{ history.ok ? 'OK' : 'FAIL' }}
              </span>
            </button>
          </div>

          <NSpace v-if="httpStore.activeHistory" vertical size="large" class="http-history-detail">
            <div class="http-response-stats">
              <div>
                <span>环境</span>
                <strong>{{ httpStore.activeHistory.environmentName || '无环境' }}</strong>
              </div>
              <div>
                <span>大小</span>
                <strong>{{ formatBytes(httpStore.activeHistory.responseBodySizeBytes) }}</strong>
              </div>
              <div>
                <span>Body</span>
                <strong>{{
                  httpStore.activeHistory.responseBodyTruncated ? '已截断保存' : '完整保存'
                }}</strong>
              </div>
            </div>
            <pre class="http-url-preview">{{ httpStore.activeHistory.url }}</pre>
            <pre class="http-json-preview">{{
              serializeResponseHeaders(httpStore.activeHistory.responseHeaders) || '暂无响应 Header'
            }}</pre>
            <pre class="http-response-preview">{{
              httpStore.activeHistory.responseBody ||
              httpStore.activeHistory.errorMessage ||
              '暂无响应内容'
            }}</pre>
          </NSpace>
        </div>

        <NEmpty v-else description="当前请求还没有执行历史" />
      </NCard>

      <NCard class="soft-card http-section-card" :bordered="false">
        <template #header>
          <div class="card-title-row">
            <span>环境变量</span>
            <NButton size="small" secondary @click="openCreateEnvironmentModal">新增环境</NButton>
          </div>
        </template>

        <div v-if="httpStore.environments.length > 0" class="http-env-list">
          <article
            v-for="environment in httpStore.environments"
            :key="environment.id"
            class="http-env-item"
          >
            <div class="http-env-head">
              <div>
                <strong>{{ environment.name }}</strong>
                <p>{{ environment.variables.length }} 个变量</p>
              </div>
              <NSpace>
                <NButton size="small" secondary @click="openEditEnvironmentModal(environment)">
                  编辑
                </NButton>
                <NPopconfirm @positive-click="removeEnvironment(environment.id)">
                  <template #trigger>
                    <NButton size="small" tertiary type="error">删除</NButton>
                  </template>
                  删除环境变量集后会立即写回本地资料库，确定继续？
                </NPopconfirm>
              </NSpace>
            </div>
            <pre class="http-json-preview">{{
              serializeKeyValues(environment.variables) || '暂无变量'
            }}</pre>
          </article>
        </div>
        <NEmpty v-else description="还没有环境变量集" />
      </NCard>
    </div>
  </div>

  <NModal
    v-model:show="collectionModalVisible"
    preset="card"
    :title="isEditingCollection ? '编辑集合' : '新增集合'"
    class="form-modal"
  >
    <NForm>
      <NFormItem label="集合名称">
        <NInput v-model:value="collectionForm.name" placeholder="例如：用户服务 / 支付接口" />
      </NFormItem>
      <NFormItem label="集合描述">
        <NInput
          v-model:value="collectionForm.description"
          type="textarea"
          :autosize="{ minRows: 3, maxRows: 6 }"
          placeholder="记录集合用途、来源或迁移说明"
        />
      </NFormItem>
      <div class="action-row modal-actions">
        <NButton secondary @click="collectionModalVisible = false">取消</NButton>
        <NButton type="primary" :loading="httpStore.saving" @click="submitCollection">
          {{ isEditingCollection ? '保存集合' : '创建集合' }}
        </NButton>
      </div>
    </NForm>
  </NModal>

  <NModal
    v-model:show="requestModalVisible"
    preset="card"
    :title="isEditingRequest ? '编辑请求' : '新增请求'"
    class="form-modal command-form-modal"
  >
    <NForm>
      <NFormItem label="所属集合">
        <NSelect v-model:value="requestForm.collectionId" :options="collectionOptions" />
      </NFormItem>
      <NFormItem label="请求名称">
        <NInput v-model:value="requestForm.name" placeholder="例如：查询用户详情" />
      </NFormItem>
      <NFormItem label="请求方法">
        <NSelect v-model:value="requestForm.method" :options="methodOptions" />
      </NFormItem>
      <NFormItem label="URL">
        <NInput
          v-model:value="requestForm.url"
          placeholder="https://api.example.com/users/{{userId}}"
        />
      </NFormItem>
      <NFormItem label="描述">
        <NInput
          v-model:value="requestForm.description"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 5 }"
          placeholder="记录接口用途、前置条件或注意事项"
        />
      </NFormItem>
      <NFormItem label="Headers">
        <NInput
          v-model:value="requestForm.headersText"
          type="textarea"
          :autosize="{ minRows: 4, maxRows: 8 }"
          placeholder="一行一个键值，例如：Authorization: Bearer {{token}}"
        />
      </NFormItem>
      <NFormItem label="Params">
        <NInput
          v-model:value="requestForm.paramsText"
          type="textarea"
          :autosize="{ minRows: 3, maxRows: 8 }"
          placeholder="一行一个键值，例如：page: 1"
        />
      </NFormItem>
      <NFormItem label="Body 类型">
        <NSelect v-model:value="requestForm.bodyType" :options="bodyTypeOptions" />
      </NFormItem>
      <NFormItem label="Body 内容">
        <NInput
          v-model:value="requestForm.bodyContent"
          type="textarea"
          :autosize="{ minRows: 5, maxRows: 12 }"
          placeholder='例如：{"name": "{{name}}"}'
        />
      </NFormItem>
      <NFormItem label="认证方式">
        <NSelect v-model:value="requestForm.authType" :options="authTypeOptions" />
      </NFormItem>
      <NFormItem v-if="requestForm.authType === 'bearer'" label="Bearer Token">
        <NInput v-model:value="requestForm.authToken" placeholder="{{token}}" />
      </NFormItem>
      <template v-if="requestForm.authType === 'basic'">
        <NFormItem label="用户名">
          <NInput v-model:value="requestForm.authUsername" placeholder="{{username}}" />
        </NFormItem>
        <NFormItem label="密码">
          <NInput
            v-model:value="requestForm.authPassword"
            type="password"
            placeholder="{{password}}"
          />
        </NFormItem>
      </template>
      <NFormItem label="标签">
        <NInput
          v-model:value="requestForm.tagsText"
          placeholder="用逗号分隔，例如：用户, 查询, P0"
        />
      </NFormItem>
      <div class="action-row modal-actions">
        <NButton secondary @click="requestModalVisible = false">取消</NButton>
        <NButton type="primary" :loading="httpStore.saving" @click="submitRequest">
          {{ isEditingRequest ? '保存请求' : '创建请求' }}
        </NButton>
      </div>
    </NForm>
  </NModal>

  <NModal
    v-model:show="environmentModalVisible"
    preset="card"
    :title="isEditingEnvironment ? '编辑环境' : '新增环境'"
    class="form-modal"
  >
    <NForm>
      <NFormItem label="环境名称">
        <NInput v-model:value="environmentForm.name" placeholder="例如：本地 / 测试 / 生产" />
      </NFormItem>
      <NFormItem label="变量">
        <NInput
          v-model:value="environmentForm.variablesText"
          type="textarea"
          :autosize="{ minRows: 6, maxRows: 12 }"
          placeholder="一行一个变量，例如：baseUrl: https://api.example.com"
        />
      </NFormItem>
      <div class="action-row modal-actions">
        <NButton secondary @click="environmentModalVisible = false">取消</NButton>
        <NButton type="primary" :loading="httpStore.saving" @click="submitEnvironment">
          {{ isEditingEnvironment ? '保存环境' : '创建环境' }}
        </NButton>
      </div>
    </NForm>
  </NModal>

  <NModal v-model:show="curlImportModalVisible" preset="card" title="导入 cURL" class="form-modal">
    <NForm>
      <NFormItem label="cURL 命令">
        <NInput
          v-model:value="curlImportText"
          type="textarea"
          :autosize="{ minRows: 8, maxRows: 16 }"
          placeholder="粘贴 curl -X POST ... 命令"
        />
      </NFormItem>
      <div class="action-row modal-actions">
        <NButton secondary @click="curlImportModalVisible = false">取消</NButton>
        <NButton type="primary" :loading="httpStore.saving" @click="importCurlRequest">
          导入为请求
        </NButton>
      </div>
    </NForm>
  </NModal>

  <NModal
    v-model:show="postmanImportModalVisible"
    preset="card"
    title="导入 Postman Collection"
    class="form-modal"
  >
    <NForm>
      <NFormItem label="Postman Collection JSON">
        <NInput
          v-model:value="postmanImportText"
          type="textarea"
          :autosize="{ minRows: 10, maxRows: 18 }"
          placeholder="粘贴 Postman Collection v2.1 JSON"
        />
      </NFormItem>
      <div class="action-row modal-actions">
        <NButton secondary @click="postmanImportModalVisible = false">取消</NButton>
        <NButton type="primary" :loading="httpStore.saving" @click="importPostmanRequests">
          导入请求
        </NButton>
      </div>
    </NForm>
  </NModal>

  <NModal
    v-model:show="exportModalVisible"
    preset="card"
    :title="
      exportFormat === 'curl'
        ? '导出 cURL'
        : exportFormat === 'httpie'
          ? '导出 HTTPie'
          : '导出 Postman Collection'
    "
    class="form-modal"
  >
    <NSpace vertical size="large">
      <NInput
        :value="exportText"
        type="textarea"
        readonly
        :autosize="{ minRows: 8, maxRows: 16 }"
      />
      <div class="action-row modal-actions">
        <NButton secondary @click="exportModalVisible = false">关闭</NButton>
        <NButton type="primary" @click="copyExportText">复制命令</NButton>
      </div>
    </NSpace>
  </NModal>
</template>
