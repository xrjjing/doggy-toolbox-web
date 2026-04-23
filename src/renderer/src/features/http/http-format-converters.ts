import type {
  HttpCollection,
  HttpAuth,
  HttpBody,
  HttpKeyValue,
  HttpMethod,
  HttpRequestRecord,
  HttpRequestSaveInput
} from '@shared/ipc-contract'

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const POSTMAN_SCHEMA_URL = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'

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

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

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

export function parseCurlCommand(input: string, collectionId?: string): HttpRequestSaveInput {
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

export function exportCollectionAsPostman(
  collection: HttpCollection,
  requests: HttpRequestRecord[]
): string {
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
