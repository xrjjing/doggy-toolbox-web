import type {
  HttpCollection,
  HttpAuth,
  HttpBody,
  HttpKeyValue,
  HttpMethod,
  HttpRequestRecord,
  HttpRequestSaveInput
} from '@shared/ipc-contract'

/**
 * HTTP 格式转换器集合。
 * 负责把外部常见格式和内部 `HttpRequestSaveInput` / `HttpRequestRecord` 互转，
 * 覆盖 cURL、HTTPie、Postman、OpenAPI、Apifox 等工具链。
 *
 * 设计取舍是优先保留请求编辑器真正会消费的核心字段，
 * 不追求第三方平台扩展语义的完全无损往返。
 */
const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const POSTMAN_SCHEMA_URL = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
const OPENAPI_VERSION = '3.0.3'
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'x-api-key',
  'api-key',
  'token',
  'x-token',
  'bearer',
  'cookie',
  'set-cookie',
  'proxy-authorization',
  'x-auth-token'
])

type PostmanCollection = {
  info?: {
    name?: string
    schema?: string
  }
  item?: PostmanItem[]
}

type PostmanItem = {
  name?: string
  request?: PostmanRequest
  item?: PostmanItem[]
}

type PostmanRequest = {
  method?: string
  header?: Array<{ key?: string; value?: string; disabled?: boolean; description?: string }>
  url?: string | { raw?: string }
  body?: {
    mode?: string
    raw?: string
    urlencoded?: Array<{ key?: string; value?: string; disabled?: boolean }>
  }
  auth?: {
    type?: string
    bearer?: Array<{ key?: string; value?: string }>
    basic?: Array<{ key?: string; value?: string }>
  }
  description?: string
}

type OpenApiDocument = {
  openapi?: string
  swagger?: string
  info?: {
    title?: string
    description?: string
    version?: string
  }
  servers?: Array<{ url?: string }>
  paths?: Record<string, OpenApiPathItem>
  components?: {
    securitySchemes?: Record<string, unknown>
  }
}

type OpenApiPathItem = {
  parameters?: OpenApiParameter[]
} & Partial<Record<Lowercase<HttpMethod>, OpenApiOperation>>

type OpenApiOperation = {
  summary?: string
  description?: string
  operationId?: string
  tags?: string[]
  parameters?: OpenApiParameter[]
  requestBody?: {
    content?: Record<string, OpenApiMediaType>
  }
  responses?: Record<string, { description: string }>
  security?: Array<Record<string, string[]>>
}

type OpenApiParameter = {
  name?: string
  in?: 'query' | 'path' | 'header' | 'cookie'
  required?: boolean
  description?: string
  example?: unknown
  schema?: {
    type?: string
    example?: unknown
    default?: unknown
  }
}

type OpenApiMediaType = {
  schema?: JsonSchemaLike
  example?: unknown
  examples?: Record<string, { value?: unknown } | unknown>
}

type JsonSchemaLike = {
  type?: string
  example?: unknown
  default?: unknown
  properties?: Record<string, JsonSchemaLike>
  items?: JsonSchemaLike
}

type ApifoxDocument = {
  info?: {
    name?: string
    description?: string
  }
  apiCollection?: ApifoxItem[]
  items?: ApifoxItem[]
}

type ApifoxItem = {
  name?: string
  api?: ApifoxApi
  request?: ApifoxApi
  items?: ApifoxItem[]
  children?: ApifoxItem[]
}

type ApifoxApi = {
  method?: string
  path?: string
  url?: string
  description?: string
  tags?: string[]
  parameters?: {
    query?: ApifoxParameter[]
    path?: ApifoxParameter[]
    header?: ApifoxParameter[]
  }
  requestBody?: {
    type?: string
    content?: Record<string, OpenApiMediaType>
    examples?: Array<{ name?: string; value?: unknown } | unknown>
    raw?: string
  }
}

type ApifoxParameter = {
  name?: string
  key?: string
  value?: unknown
  example?: unknown
  description?: string
  enable?: boolean
  enabled?: boolean
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/**
 * 所有导入入口都先把 method 收敛到内部支持集合，非法值统一回退 GET。
 */
function normalizeMethod(value: string | undefined): HttpMethod {
  const method = String(value ?? '').toUpperCase()
  return HTTP_METHODS.includes(method as HttpMethod) ? (method as HttpMethod) : 'GET'
}

function createKeyValue(key: string, value: string): Partial<HttpKeyValue> {
  return {
    key,
    value,
    enabled: true,
    description: ''
  }
}

function stringifyExample(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

/**
 * OpenAPI / Apifox 的示例可能散落在 example、examples、schema.default 等不同层级。
 * 这里统一做一轮尽力提取，目标是导入后能得到可编辑的请求样例。
 */
function exampleFromMedia(media: OpenApiMediaType | undefined): unknown {
  if (!media) return undefined
  if ('example' in media) return media.example

  const firstExample = Object.values(media.examples ?? {})[0]
  if (firstExample && typeof firstExample === 'object' && 'value' in firstExample) {
    return firstExample.value
  }
  if (firstExample !== undefined) return firstExample

  return exampleFromSchema(media.schema)
}

/**
 * 当 schema 本身没有示例时，按类型生成最朴素的默认值作为兜底。
 */
function exampleFromSchema(schema: JsonSchemaLike | undefined): unknown {
  if (!schema) return undefined
  if (schema.example !== undefined) return schema.example
  if (schema.default !== undefined) return schema.default

  if (schema.type === 'object' || schema.properties) {
    return Object.fromEntries(
      Object.entries(schema.properties ?? {}).map(([key, value]) => [key, exampleFromSchema(value)])
    )
  }

  if (schema.type === 'array') return [exampleFromSchema(schema.items)]
  if (schema.type === 'integer' || schema.type === 'number') return 0
  if (schema.type === 'boolean') return true
  if (schema.type === 'string') return ''
  return undefined
}

/**
 * form-urlencoded 在内部仍以文本表示，因此需要把对象示例压成查询串。
 */
function formExampleFromSchema(schema: JsonSchemaLike | undefined): string {
  const example = exampleFromSchema(schema)
  if (!example || typeof example !== 'object' || Array.isArray(example)) return ''

  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(example)) {
    params.set(key, value === undefined || value === null ? '' : String(value))
  }
  return params.toString()
}

/**
 * 把 OpenAPI content 映射到内部的 body 结构。
 * 当前仅覆盖 json / form / text 这几类工具页已有编辑能力的形态。
 */
function bodyFromOpenApiContent(content: Record<string, OpenApiMediaType> | undefined): HttpBody {
  if (!content) return { type: 'none', content: '' }

  const jsonEntry = Object.entries(content).find(([type]) => type.includes('application/json'))
  if (jsonEntry) {
    return {
      type: 'json',
      content: stringifyExample(exampleFromMedia(jsonEntry[1]))
    }
  }

  const formEntry = Object.entries(content).find(([type]) =>
    type.includes('application/x-www-form-urlencoded')
  )
  if (formEntry) {
    // 表单体优先使用对象示例，缺失时再回退到 schema 推断。
    const example = exampleFromMedia(formEntry[1])
    const contentText =
      example && typeof example === 'object' && !Array.isArray(example)
        ? new URLSearchParams(
            Object.entries(example).map(([key, value]) => [
              key,
              value === undefined || value === null ? '' : String(value)
            ])
          ).toString()
        : formExampleFromSchema(formEntry[1].schema)
    return {
      type: 'form',
      content: contentText
    }
  }

  const textEntry = Object.entries(content).find(([type]) => type.startsWith('text/'))
  if (textEntry) {
    return {
      type: 'text',
      content: stringifyExample(exampleFromMedia(textEntry[1]))
    }
  }

  const firstEntry = Object.values(content)[0]
  return {
    type: 'text',
    content: stringifyExample(exampleFromMedia(firstEntry))
  }
}

function buildUrlFromOpenApiPath(path: string, servers: OpenApiDocument['servers']): string {
  if (/^https?:\/\//i.test(path)) return path

  const serverUrl = servers?.find((server) => server.url)?.url
  if (!serverUrl) return path

  return `${serverUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

/**
 * 参数值提取兼容 OpenAPI 和 Apifox 的字段命名差异。
 */
function valueFromParameter(parameter: OpenApiParameter | ApifoxParameter): string {
  if ('example' in parameter && parameter.example !== undefined) {
    return stringifyExample(parameter.example)
  }
  if ('value' in parameter && parameter.value !== undefined)
    return stringifyExample(parameter.value)
  if ('schema' in parameter && parameter.schema) {
    return stringifyExample(exampleFromSchema(parameter.schema))
  }
  return ''
}

/**
 * 内部请求模型只区分 header 和 param；cookie 参数当前不单独建模，因此跳过。
 */
function openApiParametersToRequestParts(parameters: OpenApiParameter[]): {
  headers: Array<Partial<HttpKeyValue>>
  params: Array<Partial<HttpKeyValue>>
} {
  const headers: Array<Partial<HttpKeyValue>> = []
  const params: Array<Partial<HttpKeyValue>> = []

  for (const parameter of parameters) {
    if (!parameter.name) continue

    const target = parameter.in === 'header' ? headers : parameter.in === 'cookie' ? null : params
    if (!target) continue

    target.push({
      key: parameter.name,
      value: valueFromParameter(parameter),
      enabled: true,
      description: [parameter.in, parameter.description].filter(Boolean).join(' / ')
    })
  }

  return { headers, params }
}

/**
 * 统一追加来源标签，并对重复值去重。
 */
function appendUniqueTags(tags: string[], requiredTag: string): string[] {
  return Array.from(new Set([...tags.filter(Boolean), requiredTag]))
}

/**
 * 导出时尽量拆出可复用的 serverUrl，同时保留 query 参数供 OpenAPI parameter 使用。
 */
function parseRequestUrlForExport(url: string): {
  serverUrl?: string
  path: string
  queryParams: Array<Partial<HttpKeyValue>>
} {
  try {
    const parsed = new URL(url)
    return {
      serverUrl: parsed.origin,
      path: parsed.pathname || '/',
      queryParams: Array.from(parsed.searchParams.entries()).map(([key, value]) =>
        createKeyValue(key, value)
      )
    }
  } catch {
    const [path = '/', query = ''] = url.split('?')
    return {
      path: path || '/',
      queryParams: Array.from(new URLSearchParams(query).entries()).map(([key, value]) =>
        createKeyValue(key, value)
      )
    }
  }
}

/**
 * 导出第三方文档时对敏感 header 做脱敏，避免把真实密钥写进可分享文件。
 */
function redactedHeaderValue(header: HttpKeyValue): string {
  return SENSITIVE_HEADERS.has(header.key.toLowerCase().trim()) ? '***REDACTED***' : header.value
}

function parseJsonOrText(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function requestBodyToOpenApiContent(body: HttpBody): Record<string, OpenApiMediaType> | undefined {
  if (body.type === 'none' || !body.content) return undefined

  if (body.type === 'json') {
    return {
      'application/json': {
        schema: { type: 'object' },
        example: parseJsonOrText(body.content)
      }
    }
  }

  if (body.type === 'form') {
    return {
      'application/x-www-form-urlencoded': {
        schema: { type: 'object' },
        example: Object.fromEntries(new URLSearchParams(body.content).entries())
      }
    }
  }

  return {
    'text/plain': {
      schema: { type: 'string' },
      example: body.content
    }
  }
}

function parseHeader(value: string): Partial<HttpKeyValue> {
  const separatorIndex = value.indexOf(':')
  if (separatorIndex < 0) {
    return createKeyValue(value.trim(), '')
  }

  return createKeyValue(
    value.slice(0, separatorIndex).trim(),
    value.slice(separatorIndex + 1).trim()
  )
}

/**
 * 轻量 shell 分词器，只覆盖 cURL 文本导入的常见场景，不尝试实现完整 shell 语法。
 */
function splitShellWords(input: string): string[] {
  const words: string[] = []
  let current = ''
  let quote: '"' | "'" | '' = ''
  let escaping = false

  for (const char of input.trim()) {
    if (escaping) {
      current += char
      escaping = false
      continue
    }

    if (char === '\\') {
      escaping = true
      continue
    }

    if (quote) {
      if (char === quote) {
        quote = ''
      } else {
        current += char
      }
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (/\s/.test(char)) {
      if (current) {
        words.push(current)
        current = ''
      }
      continue
    }

    current += char
  }

  if (quote) {
    throw new Error('cURL 命令存在未闭合的引号')
  }

  if (escaping) {
    current += '\\'
  }

  if (current) {
    words.push(current)
  }

  return words
}

/**
 * body 类型识别优先看 Content-Type，其次再依据文本形态兜底。
 */
function detectBodyType(
  headers: Array<Partial<HttpKeyValue>>,
  bodyContent: string
): HttpBody['type'] {
  if (!bodyContent) return 'none'

  const contentType =
    headers.find((header) => header.key?.toLowerCase() === 'content-type')?.value?.toLowerCase() ??
    ''
  if (contentType.includes('application/json')) return 'json'
  if (contentType.includes('application/x-www-form-urlencoded')) return 'form'

  const trimmed = bodyContent.trim()
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    return 'json'
  }

  return 'text'
}

function requestBodyForExport(request: HttpRequestRecord): string {
  return request.body.type === 'none' ? '' : request.body.content
}

/**
 * 导出时只保留启用且非空的 key/value 项，避免把 UI 草稿行写进目标格式。
 */
function enabledKeyValues(values: HttpKeyValue[]): HttpKeyValue[] {
  return values.filter((item) => item.enabled !== false && (item.key || item.value))
}

function authHeader(auth: HttpAuth): string {
  if (auth.type === 'bearer' && auth.token) return `Bearer ${auth.token}`
  if (auth.type === 'basic') return `Basic ${auth.username}:${auth.password}`
  return ''
}

function postmanUrlToString(value: PostmanRequest['url']): string {
  if (typeof value === 'string') return value
  return value?.raw ?? ''
}

/**
 * Postman 目录是树结构，真正请求节点与文件夹节点混在一起。
 * 这里先拍平成请求列表，后续解析逻辑就能统一处理。
 */
function collectPostmanItems(items: PostmanItem[] | undefined): PostmanItem[] {
  const result: PostmanItem[] = []

  for (const item of items ?? []) {
    if (item.request) {
      result.push(item)
    }
    result.push(...collectPostmanItems(item.item))
  }

  return result
}

/**
 * Postman auth 只映射当前内部模型支持的 bearer/basic 两类。
 */
function postmanAuthToRequestAuth(auth: PostmanRequest['auth']): Partial<HttpAuth> | undefined {
  if (auth?.type === 'bearer') {
    return {
      type: 'bearer',
      token: auth.bearer?.find((item) => item.key === 'token')?.value ?? ''
    }
  }

  if (auth?.type === 'basic') {
    return {
      type: 'basic',
      username: auth.basic?.find((item) => item.key === 'username')?.value ?? '',
      password: auth.basic?.find((item) => item.key === 'password')?.value ?? ''
    }
  }

  return undefined
}

/**
 * Apifox 可能导出成 Postman / OpenAPI 兼容结构，因此先做格式探测。
 */
function hasPostmanSchema(input: unknown): boolean {
  const candidate = input as PostmanCollection
  return Boolean(candidate.info?.schema?.includes('postman') || candidate.item)
}

function apifoxParametersToKeyValues(
  parameters: ApifoxParameter[] | undefined
): Array<Partial<HttpKeyValue>> {
  return (parameters ?? [])
    .filter((parameter) => parameter.enable !== false && parameter.enabled !== false)
    .map((parameter) => ({
      key: parameter.name ?? parameter.key ?? '',
      value: valueFromParameter(parameter),
      enabled: true,
      description: parameter.description ?? ''
    }))
}

function bodyFromApifoxRequestBody(body: ApifoxApi['requestBody']): HttpBody {
  if (!body) return { type: 'none', content: '' }
  if (body.content) return bodyFromOpenApiContent(body.content)

  const type = body.type ?? ''
  const firstExample = body.examples?.[0]
  const example =
    firstExample && typeof firstExample === 'object' && 'value' in firstExample
      ? firstExample.value
      : firstExample

  if (type.includes('application/json') || type.includes('json')) {
    return {
      type: 'json',
      content: stringifyExample(example ?? body.raw)
    }
  }

  if (type.includes('application/x-www-form-urlencoded') || type.includes('form')) {
    return {
      type: 'form',
      content: stringifyExample(example ?? body.raw)
    }
  }

  if (example || body.raw) {
    return {
      type: 'text',
      content: stringifyExample(example ?? body.raw)
    }
  }

  return { type: 'none', content: '' }
}

/**
 * 导出为 Apifox item 时复用统一脱敏逻辑，避免泄露认证头。
 */
function requestToApifoxItem(request: HttpRequestRecord): ApifoxItem {
  const parameters = {
    query: enabledKeyValues(request.params).map((param) => ({
      name: param.key,
      value: param.value,
      description: param.description,
      enable: true
    })),
    header: enabledKeyValues(request.headers).map((header) => ({
      name: header.key,
      value: redactedHeaderValue(header),
      description: header.description,
      enable: true
    }))
  }

  const bodyContent = requestBodyForExport(request)

  return {
    name: request.name,
    api: {
      method: request.method,
      path: request.url,
      description: request.description,
      tags: request.tags,
      parameters,
      requestBody:
        bodyContent && !['GET', 'HEAD'].includes(request.method)
          ? {
              type:
                request.body.type === 'json'
                  ? 'application/json'
                  : request.body.type === 'form'
                    ? 'application/x-www-form-urlencoded'
                    : 'text/plain',
              examples: [{ name: '默认示例', value: bodyContent }]
            }
          : undefined
    }
  }
}

export function parseCurlCommand(input: string, collectionId?: string): HttpRequestSaveInput {
  /**
   * cURL 导入入口。
   * 覆盖常见的 `-X/-H/-d/-u/--url` 用法，不识别的参数默认忽略，
   * 目标是让用户从终端复制常见命令后能快速得到请求草稿。
   */
  const words = splitShellWords(input.replace(/\\\r?\n/g, ' '))
  if (words[0] !== 'curl') {
    throw new Error('当前只支持以 curl 开头的命令')
  }

  let method: HttpMethod | undefined
  let url = ''
  let bodyContent = ''
  const headers: Array<Partial<HttpKeyValue>> = []
  let auth: Partial<HttpAuth> | undefined

  for (let index = 1; index < words.length; index += 1) {
    const word = words[index]
    const next = words[index + 1]

    if (word === '-X' || word === '--request') {
      method = normalizeMethod(next)
      index += 1
      continue
    }

    if (word.startsWith('-X') && word.length > 2) {
      method = normalizeMethod(word.slice(2))
      continue
    }

    if (word === '-H' || word === '--header') {
      if (next) headers.push(parseHeader(next))
      index += 1
      continue
    }

    if (word === '-d' || word === '--data' || word === '--data-raw' || word === '--data-binary') {
      // 只要出现 data 且未显式指定 method，就按 cURL 的常见语义推断为 POST。
      bodyContent = next ?? ''
      if (!method) method = 'POST'
      index += 1
      continue
    }

    if (word.startsWith('--data-raw=') || word.startsWith('--data=')) {
      bodyContent = word.slice(word.indexOf('=') + 1)
      if (!method) method = 'POST'
      continue
    }

    if (word === '-u' || word === '--user') {
      const [username = '', password = ''] = String(next ?? '').split(':')
      auth = {
        type: 'basic',
        username,
        password
      }
      index += 1
      continue
    }

    if (word === '--url') {
      url = next ?? ''
      index += 1
      continue
    }

    if (!word.startsWith('-') && !url) {
      url = word
    }
  }

  if (!url) {
    throw new Error('cURL 命令缺少 URL')
  }

  const requestMethod = method ?? 'GET'

  return {
    collectionId,
    name: `${requestMethod} ${url}`,
    method: requestMethod,
    url,
    description: '从 cURL 命令导入',
    headers,
    params: [],
    body: {
      type: detectBodyType(headers, bodyContent),
      content: bodyContent
    },
    auth,
    tags: ['curl-import']
  }
}

export function exportRequestAsCurl(request: HttpRequestRecord): string {
  /**
   * cURL 导出会把 auth 统一折算为 Authorization header，方便直接复制执行。
   */
  const parts = ['curl', '-X', request.method, shellQuote(request.url)]
  const headers = [...enabledKeyValues(request.headers)]
  const auth = authHeader(request.auth)
  if (auth) headers.push(createKeyValue('Authorization', auth) as HttpKeyValue)

  for (const header of headers) {
    parts.push('-H', shellQuote(`${header.key}: ${header.value}`))
  }

  const bodyContent = requestBodyForExport(request)
  if (bodyContent && !['GET', 'HEAD'].includes(request.method)) {
    parts.push('--data-raw', shellQuote(bodyContent))
  }

  return parts.join(' ')
}

export function exportRequestAsHttpie(request: HttpRequestRecord): string {
  /**
   * HTTPie 导出复用同一份归一化请求数据，只调整命令格式。
   */
  const parts = ['http', request.method, shellQuote(request.url)]
  const headers = [...enabledKeyValues(request.headers)]
  const auth = authHeader(request.auth)
  if (auth) headers.push(createKeyValue('Authorization', auth) as HttpKeyValue)

  for (const header of headers) {
    parts.push(shellQuote(`${header.key}:${header.value}`))
  }

  const bodyContent = requestBodyForExport(request)
  if (bodyContent && !['GET', 'HEAD'].includes(request.method)) {
    parts.push(shellQuote(bodyContent))
  }

  return parts.join(' ')
}

export function parsePostmanCollection(
  input: string,
  collectionId?: string
): HttpRequestSaveInput[] {
  /**
   * Postman 导入前先拍平目录树，再把请求节点映射为内部结构。
   */
  const parsed = JSON.parse(input) as PostmanCollection
  const items = collectPostmanItems(parsed.item)

  return items.map((item) => {
    const request = item.request ?? {}
    const headers = (request.header ?? []).map((header) => ({
      key: header.key ?? '',
      value: header.value ?? '',
      enabled: header.disabled !== true,
      description: typeof header.description === 'string' ? header.description : ''
    }))
    const rawBody = request.body?.raw ?? ''
    const formBody =
      request.body?.urlencoded
        ?.filter((entry) => entry.disabled !== true)
        .map(
          (entry) =>
            `${encodeURIComponent(entry.key ?? '')}=${encodeURIComponent(entry.value ?? '')}`
        )
        .join('&') ?? ''
    const bodyContent = rawBody || formBody
    const method = normalizeMethod(request.method)

    return {
      collectionId,
      name: item.name || `${method} ${postmanUrlToString(request.url)}`,
      method,
      url: postmanUrlToString(request.url),
      description:
        typeof request.description === 'string' ? request.description : '从 Postman 导入',
      headers,
      params: [],
      body: {
        type: detectBodyType(headers, bodyContent),
        content: bodyContent
      },
      auth: postmanAuthToRequestAuth(request.auth),
      tags: ['postman-import']
    }
  })
}

export function parseOpenApiDocument(input: string, collectionId?: string): HttpRequestSaveInput[] {
  /**
   * OpenAPI 导入按 path + method 展开成多条内部请求草稿。
   */
  const parsed = JSON.parse(input) as OpenApiDocument
  const requests: HttpRequestSaveInput[] = []

  if (!parsed.paths || typeof parsed.paths !== 'object') {
    throw new Error('OpenAPI 文档缺少 paths')
  }

  for (const [path, pathItem] of Object.entries(parsed.paths)) {
    const sharedParameters = pathItem.parameters ?? []

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method.toLowerCase() as Lowercase<HttpMethod>]
      if (!operation) continue

      const parts = openApiParametersToRequestParts([
        ...sharedParameters,
        ...(operation.parameters ?? [])
      ])
      const body = bodyFromOpenApiContent(operation.requestBody?.content)

      requests.push({
        collectionId,
        name: operation.summary || operation.operationId || `${method} ${path}`,
        method,
        url: buildUrlFromOpenApiPath(path, parsed.servers),
        description: operation.description || operation.summary || '从 OpenAPI 导入',
        headers: parts.headers,
        params: parts.params,
        body,
        auth: { type: 'none' },
        tags: appendUniqueTags(operation.tags ?? [], 'openapi-import')
      })
    }
  }

  return requests
}

export function parseApifoxCollection(
  input: string,
  collectionId?: string
): HttpRequestSaveInput[] {
  /**
   * Apifox 导入兼容 OpenAPI 兼容导出、Postman 兼容导出和 Apifox 自有树结构三种来源。
   */
  const parsed = JSON.parse(input) as ApifoxDocument | OpenApiDocument | PostmanCollection

  if ('openapi' in parsed || 'swagger' in parsed) {
    return parseOpenApiDocument(input, collectionId).map((request) => ({
      ...request,
      tags: appendUniqueTags(request.tags ?? [], 'apifox-import')
    }))
  }

  if (hasPostmanSchema(parsed)) {
    return parsePostmanCollection(input, collectionId).map((request) => ({
      ...request,
      tags: appendUniqueTags(request.tags ?? [], 'apifox-import')
    }))
  }

  const apifox = parsed as ApifoxDocument
  const roots = apifox.apiCollection ?? apifox.items ?? []
  const requests: HttpRequestSaveInput[] = []

  function visit(items: ApifoxItem[]): void {
    for (const item of items) {
      const api = item.api ?? item.request
      if (api) {
        const method = normalizeMethod(api.method)
        const parameters = api.parameters ?? {}
        requests.push({
          collectionId,
          name: item.name || `${method} ${api.path ?? api.url ?? ''}`,
          method,
          url: api.url || api.path || '',
          description: api.description || '从 Apifox 导入',
          headers: apifoxParametersToKeyValues(parameters.header),
          params: [
            ...apifoxParametersToKeyValues(parameters.query),
            ...apifoxParametersToKeyValues(parameters.path)
          ],
          body: bodyFromApifoxRequestBody(api.requestBody),
          auth: { type: 'none' },
          tags: appendUniqueTags(api.tags ?? [], 'apifox-import')
        })
      }

      visit(item.items ?? [])
      visit(item.children ?? [])
    }
  }

  visit(roots)
  if (requests.length === 0) {
    throw new Error('Apifox 文档中没有可导入的接口')
  }

  return requests
}

export function exportCollectionAsOpenApi(
  collection: HttpCollection,
  requests: HttpRequestRecord[]
): string {
  /**
   * OpenAPI 导出按 path 聚合请求，再把 method 挂到 operation 上。
   */
  const servers = new Set<string>()
  const paths: NonNullable<OpenApiDocument['paths']> = {}
  const securitySchemes: Record<string, unknown> = {}

  for (const request of requests) {
    const parsed = parseRequestUrlForExport(request.url)
    if (parsed.serverUrl) servers.add(parsed.serverUrl)

    // content-type 由 requestBody 语义表达，不重复塞进 header parameters。
    const enabledHeaders = enabledKeyValues(request.headers).filter(
      (header) => header.key.toLowerCase() !== 'content-type'
    )
    const headerKeys = new Set(enabledHeaders.map((header) => header.key))
    const parameters: OpenApiParameter[] = [
      ...enabledKeyValues(request.params),
      ...parsed.queryParams,
      ...enabledHeaders
    ].map((item) => ({
      name: item.key ?? '',
      in: headerKeys.has(item.key ?? '') ? 'header' : 'query',
      required: false,
      description: item.description ?? '',
      schema: { type: 'string' },
      example:
        'id' in item && item.id ? redactedHeaderValue(item as HttpKeyValue) : (item.value ?? '')
    }))

    const operation: OpenApiOperation = {
      summary: request.name,
      description: request.description,
      operationId: `${request.method.toLowerCase()}_${request.id.replace(/[^a-zA-Z0-9_]/g, '_')}`,
      tags: [collection.name],
      parameters,
      responses: {
        '200': { description: '成功响应' }
      }
    }

    const content = requestBodyToOpenApiContent(request.body)
    if (content && !['GET', 'HEAD'].includes(request.method)) {
      operation.requestBody = { content }
    }

    if (request.auth.type === 'bearer') {
      securitySchemes.bearerAuth = { type: 'http', scheme: 'bearer' }
      operation.security = [{ bearerAuth: [] }]
    } else if (request.auth.type === 'basic') {
      securitySchemes.basicAuth = { type: 'http', scheme: 'basic' }
      operation.security = [{ basicAuth: [] }]
    }

    paths[parsed.path] = {
      ...(paths[parsed.path] ?? {}),
      [request.method.toLowerCase()]: operation
    }
  }

  const document: OpenApiDocument = {
    openapi: OPENAPI_VERSION,
    info: {
      title: collection.name,
      description: collection.description || 'doggy-toolbox-web 导出的 API 集合',
      version: '1.0.0'
    },
    servers: Array.from(servers).map((url) => ({ url })),
    paths,
    components: {
      securitySchemes
    }
  }

  if (document.servers?.length === 0) {
    document.servers = [{ url: 'http://localhost' }]
  }

  return JSON.stringify(document, null, 2)
}

export function exportCollectionAsPostman(
  collection: HttpCollection,
  requests: HttpRequestRecord[]
): string {
  /**
   * Postman 导出更关注“导回 Postman 后可继续编辑”，因此结构尽量贴近其原生模型。
   */
  const document: PostmanCollection = {
    info: {
      name: collection.name,
      schema: POSTMAN_SCHEMA_URL
    },
    item: requests.map((request) => {
      const headers = enabledKeyValues(request.headers).map((header) => ({
        key: header.key,
        value: header.value,
        disabled: false,
        description: header.description
      }))
      const bodyContent = requestBodyForExport(request)

      return {
        name: request.name,
        request: {
          method: request.method,
          header: headers,
          url: request.url,
          body:
            bodyContent && !['GET', 'HEAD'].includes(request.method)
              ? {
                  mode: request.body.type === 'form' ? 'urlencoded' : 'raw',
                  raw: bodyContent
                }
              : undefined,
          auth:
            request.auth.type === 'bearer'
              ? {
                  type: 'bearer',
                  bearer: [{ key: 'token', value: request.auth.token }]
                }
              : request.auth.type === 'basic'
                ? {
                    type: 'basic',
                    basic: [
                      { key: 'username', value: request.auth.username },
                      { key: 'password', value: request.auth.password }
                    ]
                  }
                : undefined,
          description: request.description
        }
      }
    })
  }

  return JSON.stringify(document, null, 2)
}

export function exportCollectionAsApifox(
  collection: HttpCollection,
  requests: HttpRequestRecord[]
): string {
  /**
   * Apifox 导出当前采用单根目录包裹所有请求，保证结构简单直观。
   */
  const document: ApifoxDocument = {
    info: {
      name: collection.name,
      description: collection.description || 'doggy-toolbox-web 导出的 Apifox 集合'
    },
    apiCollection: [
      {
        name: collection.name,
        items: requests.map(requestToApifoxItem)
      }
    ]
  }

  return JSON.stringify(document, null, 2)
}
