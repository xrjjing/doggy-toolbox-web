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
  AiProviderKind,
  HttpAuth,
  HttpBody,
  HttpEnvironment,
  HttpKeyValue,
  HttpMethod,
  HttpResponseHeader,
  HttpRequestRecord
} from '@shared/ipc-contract'
import { useAiSettingsStore } from '@renderer/stores/ai-settings'
import { useAiStore } from '@renderer/stores/ai'
import { useHttpCollectionsStore } from '@renderer/stores/http-collections'
import {
  exportRequestAsCodeSnippet,
  exportCollectionAsApifox,
  exportCollectionAsOpenApi,
  exportCollectionAsPostman,
  exportRequestAsCurl,
  exportRequestAsHttpie,
  type CurlCodeLanguage,
  parseApifoxCollection,
  parseCurlCommand,
  parseOpenApiDocument,
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

type CollectionImportFormat = 'postman' | 'openapi' | 'apifox'
type ExportFormat = 'curl' | 'httpie' | 'postman' | 'openapi' | 'apifox'

const message = useMessage()
const aiStore = useAiStore()
const aiSettingsStore = useAiSettingsStore()
const httpStore = useHttpCollectionsStore()
const collectionModalVisible = ref(false)
const requestModalVisible = ref(false)
const environmentModalVisible = ref(false)
const curlImportModalVisible = ref(false)
const collectionImportModalVisible = ref(false)
const exportModalVisible = ref(false)
const curlImportText = ref('')
const curlGeneratedCode = ref('')
const curlGeneratedLabel = ref('Fetch')
const curlCodeLanguage = ref<CurlCodeLanguage>('fetch')
const collectionImportText = ref('')
const collectionImportFormat = ref<CollectionImportFormat>('postman')
const exportText = ref('')
const exportFormat = ref<ExportFormat>('curl')
const aiProvider = ref<AiProviderKind>('codex')
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
const collectionImportOptions: Array<{ label: string; value: CollectionImportFormat }> = [
  { label: 'Postman Collection v2.1', value: 'postman' },
  { label: 'OpenAPI 3.x / Swagger', value: 'openapi' },
  { label: 'Apifox JSON', value: 'apifox' }
]
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
const collectionImportPlaceholder = computed(() => {
  if (collectionImportFormat.value === 'openapi') return '粘贴 OpenAPI 3.x / Swagger JSON'
  if (collectionImportFormat.value === 'apifox') return '粘贴 Apifox 导出的 JSON'
  return '粘贴 Postman Collection v2.1 JSON'
})
const curlCodeLanguageOptions: Array<{ label: string; value: CurlCodeLanguage }> = [
  { label: 'Fetch', value: 'fetch' },
  { label: 'Axios', value: 'axios' },
  { label: 'Python', value: 'python' },
  { label: 'Node.js', value: 'node' },
  { label: 'PHP', value: 'php' },
  { label: 'Go', value: 'go' }
]

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
    const request = parseCurlCommand(curlImportText.value, httpStore.activeCollectionId)
    await httpStore.saveRequest(request)
    curlImportText.value = ''
    curlGeneratedCode.value = ''
    curlImportModalVisible.value = false
    message.success('cURL 已导入为 HTTP 请求')
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

/**
 * 旧 tool-curl 页的“解析后继续生成多语言代码”能力收敛到当前 HTTP 页。
 * 这里不需要主进程参与，因为只是把同一条请求结构投影成示例代码文本。
 */
function generateCurlCodePreview(): void {
  try {
    const parsed = parseCurlCommand(curlImportText.value, httpStore.activeCollectionId)
    const previewRequest: HttpRequestRecord = {
      id: 'curl-preview',
      collectionId:
        parsed.collectionId || httpStore.activeCollectionId || httpStore.defaultCollectionId,
      name: parsed.name,
      method: parsed.method ?? 'GET',
      url: parsed.url ?? '',
      description: parsed.description ?? '',
      headers: (parsed.headers ?? []).map((item, index) => ({
        id: `curl-preview-header-${index}`,
        key: item.key ?? '',
        value: item.value ?? '',
        enabled: item.enabled !== false,
        description: item.description ?? ''
      })),
      params: (parsed.params ?? []).map((item, index) => ({
        id: `curl-preview-param-${index}`,
        key: item.key ?? '',
        value: item.value ?? '',
        enabled: item.enabled !== false,
        description: item.description ?? ''
      })),
      body: {
        type: parsed.body?.type ?? 'none',
        content: parsed.body?.content ?? ''
      },
      auth: {
        type: parsed.auth?.type ?? 'none',
        token: parsed.auth?.token ?? '',
        username: parsed.auth?.username ?? '',
        password: parsed.auth?.password ?? ''
      },
      tags: parsed.tags ?? [],
      order: 0,
      createdAt: '',
      updatedAt: ''
    }
    const result = exportRequestAsCodeSnippet(previewRequest, curlCodeLanguage.value)
    curlGeneratedLabel.value = result.label
    curlGeneratedCode.value = result.code
    message.success(`已生成 ${result.label} 示例代码`)
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

async function copyCurlGeneratedCode(): Promise<void> {
  if (!curlGeneratedCode.value) {
    message.warning('请先解析 cURL 并生成代码')
    return
  }

  try {
    await navigator.clipboard.writeText(curlGeneratedCode.value)
    message.success(`${curlGeneratedLabel.value} 示例代码已复制`)
  } catch {
    message.error('当前环境无法直接写入剪贴板')
  }
}

async function importCollectionRequests(): Promise<void> {
  try {
    const parsers = {
      postman: parsePostmanCollection,
      openapi: parseOpenApiDocument,
      apifox: parseApifoxCollection
    }
    const inputs = parsers[collectionImportFormat.value](
      collectionImportText.value,
      httpStore.activeCollectionId
    )
    for (const input of inputs) {
      await httpStore.saveRequest(input)
    }
    collectionImportText.value = ''
    collectionImportModalVisible.value = false
    message.success(`已导入 ${inputs.length} 条请求`)
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
  if (format === 'postman' || format === 'openapi' || format === 'apifox') {
    if (!httpStore.activeCollection) {
      message.warning('请先选择一个 HTTP 集合')
      return
    }
    const requests = httpStore.requests.filter(
      (request) => request.collectionId === httpStore.activeCollection?.id
    )
    if (format === 'openapi') {
      exportText.value = exportCollectionAsOpenApi(httpStore.activeCollection, requests)
    } else if (format === 'apifox') {
      exportText.value = exportCollectionAsApifox(httpStore.activeCollection, requests)
    } else {
      exportText.value = exportCollectionAsPostman(httpStore.activeCollection, requests)
    }
  } else {
    exportText.value =
      format === 'curl'
        ? exportRequestAsCurl(httpStore.activeRequest)
        : exportRequestAsHttpie(httpStore.activeRequest)
  }
  exportModalVisible.value = true
}

function exportTitle(format: ExportFormat): string {
  const titles: Record<ExportFormat, string> = {
    curl: '导出 cURL',
    httpie: '导出 HTTPie',
    postman: '导出 Postman Collection',
    openapi: '导出 OpenAPI 3.x',
    apifox: '导出 Apifox JSON'
  }
  return titles[format]
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

/**
 * HTTP 页 AI 入口复用统一 AI 会话链路，聚焦“请求资料和执行结果解释”。
 * 它不会直接再次发送网络请求，而是把当前请求、环境和最近一次结果打包给本地 SDK 说明。
 */
async function explainHttpWithAi(): Promise<void> {
  if (!httpStore.hasLoaded) {
    await httpStore.load()
  }

  if (!httpStore.activeRequest) {
    message.warning('请先选择一个 HTTP 请求')
    return
  }

  const prompt = [
    '请基于当前 HTTP 请求资料和最近一次执行结果，做一次中文分析。',
    '要求：',
    '1. 先总结这个请求的用途、方法、认证方式和环境变量依赖。',
    '2. 如果最近执行结果存在失败或未解析变量，指出最可能原因。',
    '3. 给出下一步最小可执行检查建议。',
    '',
    `当前集合：${httpStore.activeCollection?.name ?? '无'}`,
    `当前环境：${
      httpStore.environments.find((item) => item.id === httpStore.selectedEnvironmentId)?.name ||
      '无'
    }`,
    '',
    '请求配置：',
    JSON.stringify(httpStore.activeRequest, null, 2),
    '',
    '最近执行结果：',
    JSON.stringify(httpStore.executionResult ?? { message: '尚未执行当前请求' }, null, 2)
  ].join('\n')

  try {
    await aiStore.startChat({
      moduleId: 'http',
      provider: aiProvider.value,
      title: `${httpStore.activeRequest.name} HTTP AI 分析`,
      prompt
    })
    message.success('HTTP 请求资料已发送到 AI Chat，请到 AI 页面查看会话结果。')
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
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
  if (!aiSettingsStore.hasLoaded) {
    void aiSettingsStore.load()
  }
})
</script>

<template>
  <div class="http-lab-shell">
    <aside class="http-lab-sidebar">
      <NCard class="soft-card http-sub-sidebar-panel" :bordered="false">
        <section class="http-rail-section">
          <div class="card-title-row">
            <div>
              <strong>Collections</strong>
              <p class="muted">业务域 / 模块分组</p>
            </div>
            <NButton size="small" secondary @click="openCreateCollectionModal">新增</NButton>
          </div>

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
        </section>

        <section class="http-rail-section">
          <div class="card-title-row">
            <div>
              <strong>Requests</strong>
              <p class="muted">当前集合内可见请求</p>
            </div>
            <NTag size="small" :bordered="false">{{ httpStore.visibleRequests.length }}</NTag>
          </div>

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
        </section>

        <div class="http-rail-footer">
          <strong>Workspace Snapshot</strong>
          <NText depth="3">集合 {{ stats.collections }} · 请求 {{ stats.requests }}</NText>
          <NText depth="3">环境 {{ stats.environments }} · 历史 {{ stats.history }}</NText>
          <NText depth="3">{{ httpStore.storageFile || '等待初始化' }}</NText>
          <NButton size="small" secondary @click="openEditCollectionModal">编辑当前集合</NButton>
        </div>
      </NCard>
    </aside>

    <section class="http-lab-main">
      <NCard class="soft-card http-lab-toolbar-card" :bordered="false">
        <div class="http-lab-toolbar">
          <div class="method-row method-row--lab">
            <span
              v-if="httpStore.activeRequest"
              class="method-select method-select--lab"
              :class="methodClass(httpStore.activeRequest.method)"
            >
              {{ httpStore.activeRequest.method }}
            </span>
            <NInput
              :value="httpStore.activeRequest?.url || ''"
              readonly
              class="url-input url-input--lab"
              placeholder="先从左侧选择一个请求"
            />
            <NButton
              class="primary-btn primary-btn--send"
              type="primary"
              :loading="httpStore.executing"
              :disabled="!httpStore.activeRequest?.url"
              @click="executeActiveRequest"
            >
              SEND
            </NButton>
          </div>

          <div class="http-toolbar-row http-toolbar-row--lab">
            <div class="http-toolbar-filters">
              <NInput
                :value="httpStore.search"
                clearable
                placeholder="搜索请求名称、URL、Header、Param、Body、标签"
                @update:value="httpStore.setSearch"
              />
              <NSelect
                :value="httpStore.selectedEnvironmentId"
                :options="environmentOptions"
                placeholder="选择环境变量集"
                @update:value="httpStore.setSelectedEnvironment"
              />
              <NSelect
                v-model:value="aiProvider"
                :options="[
                  { label: 'Codex SDK', value: 'codex' },
                  { label: 'Claude Code SDK', value: 'claude-code' }
                ]"
                class="tool-select"
              />
            </div>

            <div class="http-toolbar-actions">
              <NButton secondary :loading="httpStore.loading" @click="httpStore.load">刷新</NButton>
              <NButton secondary @click="openCreateRequestModal">新增请求</NButton>
              <NButton secondary @click="curlImportModalVisible = true">导入 cURL</NButton>
              <NButton secondary @click="collectionImportModalVisible = true">导入集合</NButton>
            </div>
          </div>

          <div class="http-request-action-set">
            <span class="http-config-pill">Headers {{ activeRequestHeaders.length }}</span>
            <span class="http-config-pill">Params {{ activeRequestParams.length }}</span>
            <span class="http-config-pill">
              Body {{ httpStore.activeRequest?.body.type || 'none' }}
            </span>
            <span class="http-config-pill">
              Auth {{ httpStore.activeRequest?.auth.type || 'none' }}
            </span>
          </div>
        </div>
      </NCard>

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

        <div class="http-lab-request-grid">
          <div class="http-lab-config-panel">
            <section class="http-kv-section">
              <div class="card-title-row">
                <strong>Headers</strong>
                <NTag size="small" :bordered="false">{{ activeRequestHeaders.length }}</NTag>
              </div>
              <div v-if="activeRequestHeaders.length > 0" class="kv-editor">
                <div v-for="item in activeRequestHeaders" :key="item.id" class="kv-row">
                  <input :value="item.key" readonly />
                  <input :value="item.value" readonly />
                </div>
              </div>
              <NEmpty v-else description="暂无启用 Header" />
            </section>

            <section class="http-kv-section">
              <div class="card-title-row">
                <strong>Params</strong>
                <NTag size="small" :bordered="false">{{ activeRequestParams.length }}</NTag>
              </div>
              <div v-if="activeRequestParams.length > 0" class="kv-editor">
                <div v-for="item in activeRequestParams" :key="item.id" class="kv-row">
                  <input :value="item.key" readonly />
                  <input :value="item.value" readonly />
                </div>
              </div>
              <NEmpty v-else description="暂无启用参数" />
            </section>
          </div>

          <div class="http-lab-detail-panel">
            <section class="http-detail-block">
              <div class="http-request-meta">
                <div>
                  <strong>Body</strong>
                  <span>{{ httpStore.activeRequest.body.type }}</span>
                </div>
                <div>
                  <strong>Auth</strong>
                  <span>{{ httpStore.activeRequest.auth.type }}</span>
                </div>
                <div>
                  <strong>创建</strong>
                  <span>{{ formatUpdatedAt(httpStore.activeRequest.createdAt) }}</span>
                </div>
                <div>
                  <strong>更新</strong>
                  <span>{{ formatUpdatedAt(httpStore.activeRequest.updatedAt) }}</span>
                </div>
              </div>

              <div v-if="activeRequestTags.length > 0" class="chip-list">
                <span v-for="tag in activeRequestTags" :key="tag" class="chip">{{ tag }}</span>
              </div>
            </section>

            <section class="http-detail-block">
              <div class="card-title-row">
                <strong>Body Preview</strong>
                <span class="muted">{{ httpStore.activeRequest.body.type }}</span>
              </div>
              <pre class="http-code-block">{{
                httpStore.activeRequest.body.content || '暂无 Body'
              }}</pre>
            </section>

            <section class="http-detail-block">
              <div class="card-title-row">
                <strong>Actions</strong>
                <span class="muted">编辑 / 导出 / 分析</span>
              </div>
              <div class="http-editor-actions http-editor-actions--lab">
                <NButton secondary @click="openEditRequestModal(httpStore.activeRequest)">
                  编辑请求
                </NButton>
                <NButton secondary @click="openExportModal('curl')">导出 cURL</NButton>
                <NButton secondary @click="openExportModal('httpie')">导出 HTTPie</NButton>
                <NButton secondary @click="openExportModal('postman')">导出 Postman</NButton>
                <NButton secondary @click="openExportModal('openapi')">导出 OpenAPI</NButton>
                <NButton secondary @click="openExportModal('apifox')">导出 Apifox</NButton>
                <NButton
                  secondary
                  :disabled="!aiSettingsStore.isFeatureEnabled('http') || !httpStore.activeRequest"
                  @click="explainHttpWithAi"
                >
                  AI 分析
                </NButton>
                <NPopconfirm @positive-click="removeRequest(httpStore.activeRequest.id)">
                  <template #trigger>
                    <NButton tertiary type="error">删除请求</NButton>
                  </template>
                  删除后会立即写回本地 HTTP 集合资料库。确定继续？
                </NPopconfirm>
              </div>
            </section>
          </div>
        </div>
      </NCard>

      <NCard v-else class="soft-card http-empty-card" :bordered="false">
        <NEmpty description="请选择或创建一个 HTTP 请求" />
      </NCard>
    </section>

    <aside class="http-lab-response">
      <section class="http-status-console">
        <div class="http-response-head">
          <div>
            <strong>Response Console</strong>
            <p>执行结果、批量测试与历史在同一块物理控制台内展示。</p>
          </div>
          <span
            class="http-status-pill"
            :class="{ 'is-error': httpStore.executionResult && !httpStore.executionResult.ok }"
          >
            {{ httpStore.executionResult ? httpStore.executionResult.status || 'ERROR' : 'WAITING' }}
          </span>
        </div>

        <div class="http-status-console-body">
          <section class="http-section-inset">
            <div class="http-response-stats">
              <div>
                <span>耗时</span>
                <strong>{{ httpStore.executionResult?.durationMs ?? 0 }} ms</strong>
              </div>
              <div>
                <span>大小</span>
                <strong>{{
                  formatBytes(httpStore.executionResult?.bodySizeBytes ?? 0)
                }}</strong>
              </div>
              <div>
                <span>状态</span>
                <strong>{{
                  httpStore.executionResult
                    ? httpStore.executionResult.errorMessage ||
                      `${httpStore.executionResult.status} ${httpStore.executionResult.statusText}`
                    : '等待发送'
                }}</strong>
              </div>
            </div>

            <div class="http-section-head">
              <div>
                <strong>已解析请求</strong>
                <p>环境变量替换后的最终 URL / Header / Body。</p>
              </div>
            </div>
            <pre class="http-url-preview">{{
              httpStore.executionResult?.resolvedRequest.url || '等待请求执行'
            }}</pre>
            <pre class="http-code-block">{{
              httpStore.executionResult
                ? serializeResponseHeaders(httpStore.executionResult.resolvedRequest.headers) || '未发送 Header'
                : '等待请求执行'
            }}</pre>
            <pre class="http-response-preview">{{
              httpStore.executionResult?.body ||
              httpStore.executionResult?.errorMessage ||
              '暂无响应内容'
            }}</pre>
          </section>

          <section class="http-section-inset">
            <div class="http-response-head http-response-head--mini">
              <div>
                <strong>批量测试</strong>
                <p>按当前集合顺序串行执行</p>
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

            <div v-if="httpStore.batchResult" class="http-batch-list">
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
            <NEmpty v-else description="点击批量测试后在这里查看每条请求的结果" />
          </section>

          <section class="http-section-inset">
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
          </section>
        </div>
      </section>

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
    </aside>
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
    <NSpace vertical size="large">
      <NForm>
        <NFormItem label="cURL 命令">
          <NInput
            v-model:value="curlImportText"
            type="textarea"
            :autosize="{ minRows: 8, maxRows: 16 }"
            placeholder="粘贴 curl -X POST ... 命令"
          />
        </NFormItem>
      </NForm>

      <div class="card-title-row">
        <div>
          <strong>代码生成</strong>
          <p class="muted">旧 tool-curl 页的多语言代码生成能力已收敛到这里。</p>
        </div>
        <NSpace>
          <NSelect
            v-model:value="curlCodeLanguage"
            :options="curlCodeLanguageOptions"
            class="tool-select"
          />
          <NButton secondary @click="generateCurlCodePreview">解析并生成</NButton>
          <NButton secondary :disabled="!curlGeneratedCode" @click="copyCurlGeneratedCode">
            复制代码
          </NButton>
        </NSpace>
      </div>

      <NInput
        :value="curlGeneratedCode"
        type="textarea"
        readonly
        :autosize="{ minRows: 8, maxRows: 18 }"
        :placeholder="`这里会展示 ${curlGeneratedLabel} 示例代码`"
      />

      <div class="action-row modal-actions">
        <NButton secondary @click="curlImportModalVisible = false">取消</NButton>
        <NButton secondary @click="generateCurlCodePreview">只生成代码</NButton>
        <NButton type="primary" :loading="httpStore.saving" @click="importCurlRequest">
          导入为请求
        </NButton>
      </div>
    </NSpace>
  </NModal>

  <NModal
    v-model:show="collectionImportModalVisible"
    preset="card"
    title="导入集合"
    class="form-modal"
  >
    <NForm>
      <NFormItem label="导入格式">
        <NSelect v-model:value="collectionImportFormat" :options="collectionImportOptions" />
      </NFormItem>
      <NFormItem label="集合 JSON">
        <NInput
          v-model:value="collectionImportText"
          type="textarea"
          :autosize="{ minRows: 10, maxRows: 18 }"
          :placeholder="collectionImportPlaceholder"
        />
      </NFormItem>
      <div class="action-row modal-actions">
        <NButton secondary @click="collectionImportModalVisible = false">取消</NButton>
        <NButton type="primary" :loading="httpStore.saving" @click="importCollectionRequests">
          导入请求
        </NButton>
      </div>
    </NForm>
  </NModal>

  <NModal
    v-model:show="exportModalVisible"
    preset="card"
    :title="exportTitle(exportFormat)"
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
