import { base64DecodeToTextUtf8, base64EncodeTextUtf8 } from './core-basic'
import { htmlEntityDecode, htmlEntityEncode } from './core-unicode'

/**
 * 旧工具页算法集合。
 * 全部保持纯函数输入输出，避免耦合 Vue/Pinia/IPC，方便工作台直接调用与后续测试。
 */
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

type JwtDecoded = {
  header: JsonValue
  payload: JsonValue
  signature: string
  warnings: string[]
}

type ColorInfo = {
  hex: string
  rgb: string
  hsl: string
  cssVariables: string
}

type RegexMatch = {
  index: number
  match: string
  groups: string[]
}

type CharCountStats = {
  chars: number
  charsNoSpace: number
  bytesUtf8: number
  lines: number
  chinese: number
  words: number
  digits: number
  spaces: number
}

const SQL_KEYWORDS = [
  'select',
  'from',
  'where',
  'group by',
  'order by',
  'having',
  'limit',
  'offset',
  'inner join',
  'left join',
  'right join',
  'full join',
  'join',
  'values',
  'set',
  'insert into',
  'update',
  'delete from'
]

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

/**
 * Markdown 预览只做基础 HTML 转义，避免直接注入危险标签。
 */
function escapeHtml(text: string): string {
  return String(text ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char])
}

/**
 * JWT 采用 Base64URL，因此先转回标准 Base64 再交给通用解码器。
 */
function base64UrlToBase64(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4
  return padding ? `${normalized}${'='.repeat(4 - padding)}` : normalized
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}

/**
 * 供 JWT/HMAC 等场景输出 URL-safe Base64。
 */
function bytesToBase64Url(bytes: Uint8Array): string {
  let base64: string
  if (typeof btoa === 'function') {
    base64 = btoa(String.fromCharCode(...bytes))
  } else {
    base64 = Buffer.from(bytes).toString('base64')
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function parseJsonLoose(input: string): JsonValue {
  return JSON.parse(input) as JsonValue
}

/**
 * 轻量 CSV 分行解析器，只覆盖引号包裹、双引号转义和分隔符切分这几类高频场景。
 */
function parseCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let current = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]
    if (char === '"' && quoted && next === '"') {
      current += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === delimiter && !quoted) {
      cells.push(current)
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current)
  return cells
}

/**
 * 输出 CSV 时仅在必要时补引号，兼顾可读性和兼容性。
 */
function quoteCsvCell(value: unknown, delimiter: string): string {
  const text = String(value ?? '')
  if (!/[,"\r\n]/.test(text) && !text.includes(delimiter)) return text
  return `"${text.replace(/"/g, '""')}"`
}

/**
 * 标题化只面向英文标识和常见分隔符，不做复杂语言学处理。
 */
function toTitleWords(text: string): string {
  return text
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

/**
 * 颜色转换以 HEX 作为统一中间态，后续所有展示格式都从它推导。
 */
function normalizeHex(input: string): string {
  const raw = String(input ?? '').trim()
  if (/^#?[0-9a-f]{3}$/i.test(raw)) {
    const value = raw.replace('#', '')
    return `#${value
      .split('')
      .map((char) => char + char)
      .join('')}`.toUpperCase()
  }
  if (/^#?[0-9a-f]{6}$/i.test(raw)) return `#${raw.replace('#', '')}`.toUpperCase()
  const rgb = raw.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (rgb) {
    const [, r, g, b] = rgb
    return `#${[r, g, b]
      .map((value) =>
        Math.max(0, Math.min(255, Number(value)))
          .toString(16)
          .padStart(2, '0')
      )
      .join('')}`.toUpperCase()
  }
  throw new Error('颜色格式暂支持 #RGB、#RRGGBB、rgb(r,g,b)')
}

/**
 * RGB 到 HSL 的基础换算。
 */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const lightness = (max + min) / 2

  if (max === min) return [0, 0, Math.round(lightness * 100)]

  const delta = max - min
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  let hue = 0
  if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0)
  if (max === green) hue = (blue - red) / delta + 2
  if (max === blue) hue = (red - green) / delta + 4
  hue /= 6

  return [Math.round(hue * 360), Math.round(saturation * 100), Math.round(lightness * 100)]
}

/**
 * 纯文本脱敏规则集合，默认分支会叠加多类常见个人信息处理。
 */
function maskPlainText(input: string, type: string): string {
  switch (type) {
    case 'phone':
      return input.replace(/(\d{3})\d{4}(\d{4})/g, '$1****$2')
    case 'email':
      return input.replace(
        /([A-Za-z0-9._%+-]{1,3})[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g,
        '$1***$2'
      )
    case 'idcard':
      return input.replace(/(\d{6})\d{8,10}([\dXx]{2})/g, '$1********$2')
    case 'name':
      return input.replace(
        /[\u4e00-\u9fa5]{2,4}/g,
        (name) => `${name[0]}${'*'.repeat(name.length - 1)}`
      )
    default:
      return input
        .replace(/(\d{3})\d{4}(\d{4})/g, '$1****$2')
        .replace(
          /([A-Za-z0-9._%+-]{1,3})[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g,
          '$1***$2'
        )
        .replace(/(\d{6})\d{8,10}([\dXx]{2})/g, '$1********$2')
  }
}

/**
 * JSON 脱敏通过递归遍历命中的字段名，保留原始层级结构。
 */
function walkJsonMask(value: JsonValue, fields: Set<string>): JsonValue {
  if (Array.isArray(value)) return value.map((item) => walkJsonMask(item, fields))
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => {
      if (!fields.has(key.toLowerCase())) return [key, walkJsonMask(child, fields)]
      return [key, maskPlainText(String(child ?? ''), key.toLowerCase())]
    })
  )
}

/**
 * 轻量 schema 推断，重点服务“快速看结构”，不是完整 JSON Schema 生成器。
 */
function inferSchema(value: JsonValue, required: boolean): JsonValue {
  if (Array.isArray(value)) {
    return {
      type: 'array',
      items: value.length ? inferSchema(value[0], required) : {}
    }
  }
  if (value && typeof value === 'object') {
    const properties = Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, inferSchema(child, required)])
    )
    return {
      type: 'object',
      properties,
      ...(required ? { required: Object.keys(value) } : {})
    }
  }
  if (value === null) return { type: 'null' }
  return { type: typeof value }
}

/**
 * 轻量 JSONPath 只支持属性、数组下标和 `*` 通配。
 */
function resolveJsonPathToken(value: JsonValue, token: string): JsonValue[] {
  if (token === '*') {
    if (Array.isArray(value)) return value
    if (value && typeof value === 'object') return Object.values(value)
    return []
  }
  const arrayIndex = token.match(/^\[(\d+|\*)]$/)
  if (arrayIndex) {
    if (!Array.isArray(value)) return []
    if (arrayIndex[1] === '*') return value
    return [value[Number(arrayIndex[1])]].filter((item) => item !== undefined)
  }
  if (value && typeof value === 'object' && !Array.isArray(value) && token in value) {
    return [(value as Record<string, JsonValue>)[token]]
  }
  return []
}

/**
 * TOML 值解析仅覆盖常见标量和数组，满足工具页快速查看需求。
 */
function parseTomlValue(raw: string): JsonValue {
  const value = raw.trim()
  if (/^".*"$/.test(value)) return value.slice(1, -1).replace(/\\"/g, '"')
  if (/^(true|false)$/i.test(value)) return value.toLowerCase() === 'true'
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value)
  if (/^\[.*]$/.test(value)) {
    return value
      .slice(1, -1)
      .split(',')
      .map((item) => parseTomlValue(item.trim()))
  }
  return value
}

/**
 * 按 section path 把 TOML 扁平键值写回嵌套对象。
 */
function setNestedValue(
  target: Record<string, JsonValue>,
  path: string[],
  key: string,
  value: JsonValue
): void {
  let cursor: Record<string, JsonValue> = target
  for (const part of path) {
    const next = cursor[part]
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      cursor[part] = {}
    }
    cursor = cursor[part] as Record<string, JsonValue>
  }
  cursor[key] = value
}

export function decodeJwt(token: string): JwtDecoded {
  /**
   * JWT 解码只拆结构和检查 exp，不做签名验真。
   */
  const parts = String(token ?? '')
    .trim()
    .split('.')
  if (parts.length !== 3) throw new Error('JWT 必须由 header.payload.signature 三段组成')

  const warnings: string[] = []
  const header = parseJsonLoose(base64DecodeToTextUtf8(base64UrlToBase64(parts[0])))
  const payload = parseJsonLoose(base64DecodeToTextUtf8(base64UrlToBase64(parts[1])))
  if (
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    typeof payload.exp === 'number'
  ) {
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp < now) warnings.push('exp 已过期')
  }

  return { header, payload, signature: parts[2], warnings }
}

export async function hmacHexUtf8(
  secret: string,
  message: string,
  algorithm: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512' = 'SHA-256'
): Promise<string> {
  /**
   * HMAC 统一走 Web Crypto，避免引入额外依赖。
   */
  if (!globalThis.crypto?.subtle) throw new Error('当前环境不支持 Web Crypto HMAC')
  const encoder = new TextEncoder()
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: algorithm },
    false,
    ['sign']
  )
  const signature = await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return bytesToHex(new Uint8Array(signature))
}

export async function signJwtHs256(payloadText: string, secret: string): Promise<string> {
  /**
   * HS256 JWT 签名辅助函数，返回完整 token。
   */
  const payload = parseJsonLoose(payloadText)
  const header = { alg: 'HS256', typ: 'JWT' }
  const encoder = new TextEncoder()
  const headerPart = bytesToBase64Url(encoder.encode(JSON.stringify(header)))
  const payloadPart = bytesToBase64Url(encoder.encode(JSON.stringify(payload)))
  const signingInput = `${headerPart}.${payloadPart}`
  if (!globalThis.crypto?.subtle) throw new Error('当前环境不支持 Web Crypto JWT 签名')
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(signingInput))
  return `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`
}

export function getCharCountStats(text: string): CharCountStats {
  /**
   * 文本统计返回工具页最常用的一组指标。
   */
  const value = String(text ?? '')
  return {
    chars: Array.from(value).length,
    charsNoSpace: Array.from(value.replace(/\s/g, '')).length,
    bytesUtf8: new TextEncoder().encode(value).length,
    lines: value.length ? value.split(/\r?\n/).length : 0,
    chinese: (value.match(/[\u4e00-\u9fa5]/g) ?? []).length,
    words: (value.match(/[A-Za-z]+(?:['-][A-Za-z]+)?/g) ?? []).length,
    digits: (value.match(/\d/g) ?? []).length,
    spaces: (value.match(/\s/g) ?? []).length
  }
}

export function maskSensitiveText(
  input: string,
  type = 'auto',
  jsonFields = 'phone,idcard,email,name,password,token'
): string {
  /**
   * `auto` 模式优先尝试 JSON 脱敏，否则按纯文本规则处理。
   */
  const raw = String(input ?? '')
  const looksLikeJson = raw.trim().startsWith('{') || raw.trim().startsWith('[')
  if (type === 'json' || (type === 'auto' && looksLikeJson)) {
    const fields = new Set(
      jsonFields
        .split(',')
        .map((field) => field.trim().toLowerCase())
        .filter(Boolean)
    )
    return JSON.stringify(walkJsonMask(parseJsonLoose(raw), fields), null, 2)
  }
  return maskPlainText(raw, type)
}

export function runRegex(
  pattern: string,
  flags: string,
  text: string
): { matches: RegexMatch[]; summary: string } {
  /**
   * 正则工具默认补全 `g`，确保能得到所有命中项而不是第一处。
   */
  const normalizedFlags = flags.includes('g') ? flags : `${flags}g`
  const regex = new RegExp(pattern, normalizedFlags)
  const matches = Array.from(String(text ?? '').matchAll(regex)).map((match) => ({
    index: match.index ?? -1,
    match: match[0],
    groups: match.slice(1)
  }))
  return {
    matches,
    summary: `匹配 ${matches.length} 处，flags=${normalizedFlags}`
  }
}

export function formatSql(input: string): string {
  /**
   * SQL 格式化是关键字驱动的轻量实现，重点提升可读性。
   */
  let sql = String(input ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!sql) return ''
  SQL_KEYWORDS.forEach((keyword) => {
    const pattern = new RegExp(`\\b${keyword.replace(/\s+/g, '\\s+')}\\b`, 'gi')
    sql = sql.replace(pattern, `\n${keyword.toUpperCase()}`)
  })
  return sql.replace(/,\s*/g, ',\n  ').replace(/\(\s*/g, '(\n  ').replace(/\s*\)/g, '\n)').trim()
}

export function minifySql(input: string): string {
  /**
   * SQL 压缩先剔除注释，再压缩空白。
   */
  return String(input ?? '')
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractSqlTables(input: string): string[] {
  /**
   * 表名提取采用启发式匹配，适合快速扫读，不适合作为完整 SQL 解析。
   */
  const tables = new Set<string>()
  const sql = String(input ?? '')
  const pattern = /\b(?:from|join|update|into)\s+([`"[]?[\w.]+[`"\]]?)/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(sql))) {
    tables.add(match[1].replace(/^[`"[]|[`"\]]$/g, ''))
  }
  return [...tables]
}

export function csvToJson(input: string, delimiter = ','): JsonValue[] {
  /**
   * CSV -> JSON 默认以首行为表头。
   */
  const lines = String(input ?? '')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
  if (!lines.length) return []
  const headers = parseCsvLine(lines[0], delimiter).map((header) => header.trim())
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line, delimiter)
    return Object.fromEntries(
      headers.map((header, index) => [header || `col_${index + 1}`, cells[index] ?? ''])
    )
  })
}

export function jsonToCsv(input: string, delimiter = ','): string {
  /**
   * JSON -> CSV 仅接受对象或对象数组，并按字段并集生成表头。
   */
  const value = parseJsonLoose(input)
  const rows = Array.isArray(value) ? value : [value]
  const objects = rows.filter(
    (row): row is Record<string, JsonValue> =>
      !!row && typeof row === 'object' && !Array.isArray(row)
  )
  const headers = [...new Set(objects.flatMap((row) => Object.keys(row)))]
  return [
    headers.map((header) => quoteCsvCell(header, delimiter)).join(delimiter),
    ...objects.map((row) =>
      headers.map((header) => quoteCsvCell(row[header], delimiter)).join(delimiter)
    )
  ].join('\n')
}

export function markdownToHtml(markdown: string): string {
  /**
   * Markdown 预览只支持常见只读语法，输出前统一 escape，避免把模型文本当成真实 HTML 执行。
   */
  const lines = String(markdown ?? '').split(/\r?\n/)
  let listType: 'ul' | 'ol' | null = null
  let inCode = false
  let codeBuffer: string[] = []
  const html: string[] = []

  const closeList = () => {
    if (!listType) return
    html.push(`</${listType}>`)
    listType = null
  }

  const flushCode = () => {
    html.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`)
    codeBuffer = []
  }

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      closeList()
      if (inCode) {
        flushCode()
        inCode = false
      } else {
        inCode = true
        codeBuffer = []
      }
      continue
    }

    if (inCode) {
      codeBuffer.push(line)
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    const bulletList = line.match(/^\s*[-*]\s+(.*)$/)
    const orderedList = line.match(/^\s*\d+\.\s+(.*)$/)
    if (heading) {
      closeList()
      html.push(`<h${heading[1].length}>${escapeHtml(heading[2])}</h${heading[1].length}>`)
    } else if (bulletList) {
      if (listType !== 'ul') {
        closeList()
        html.push('<ul>')
        listType = 'ul'
      }
      html.push(`<li>${escapeHtml(bulletList[1])}</li>`)
    } else if (orderedList) {
      if (listType !== 'ol') {
        closeList()
        html.push('<ol>')
        listType = 'ol'
      }
      html.push(`<li>${escapeHtml(orderedList[1])}</li>`)
    } else if (line.trim()) {
      closeList()
      html.push(`<p>${escapeHtml(line)}</p>`)
    } else {
      closeList()
    }
  }
  closeList()
  if (inCode) flushCode()
  return html
    .join('\n')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

export function convertColor(input: string): ColorInfo {
  /**
   * 颜色工具一次返回多种表示，便于界面直接展示。
   */
  const hex = normalizeHex(input)
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  const [h, s, l] = rgbToHsl(r, g, b)
  return {
    hex,
    rgb: `rgb(${r}, ${g}, ${b})`,
    hsl: `hsl(${h}, ${s}%, ${l}%)`,
    cssVariables: `--color: ${hex};\n--color-rgb: ${r}, ${g}, ${b};\n--color-hsl: ${h} ${s}% ${l}%;`
  }
}

export function describeCron(expression: string): string {
  /**
   * Cron 只解析 5 段表达式，明确不覆盖秒字段。
   */
  const parts = String(expression ?? '')
    .trim()
    .split(/\s+/)
  if (parts.length !== 5) throw new Error('Cron 暂支持 5 段格式：分 时 日 月 周')
  const [minute, hour, day, month, week] = parts
  const explainPart = (value: string, label: string): string => {
    if (value === '*') return `${label}: 每一单位`
    if (value.includes('/')) return `${label}: 每 ${value.split('/')[1]} 单位`
    if (value.includes(',')) return `${label}: ${value.split(',').join('、')}`
    if (value.includes('-')) return `${label}: ${value.replace('-', ' 到 ')}`
    return `${label}: ${value}`
  }
  return [
    'Cron 解析:',
    explainPart(minute, '分钟'),
    explainPart(hour, '小时'),
    explainPart(day, '日期'),
    explainPart(month, '月份'),
    explainPart(week, '星期')
  ].join('\n')
}

export function generatePassword(length = 20): string {
  /**
   * 密码生成使用加密安全随机数，并对长度做上下限保护。
   */
  const size = Math.max(8, Math.min(128, Math.floor(length)))
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_-+='
  const bytes = new Uint8Array(size)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

export function inferJsonSchema(input: string, required = true): JsonValue {
  /**
   * 在轻量 schema 结果上补上标准 `$schema` 字段。
   */
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    ...((inferSchema(parseJsonLoose(input), required) as Record<string, JsonValue>) ?? {})
  }
}

export function queryJsonPath(input: string, expression: string): JsonValue[] {
  /**
   * 轻量 JSONPath 执行器，语法范围故意收紧以换取零依赖实现。
   */
  const root = parseJsonLoose(input)
  const expr = String(expression || '$').trim()
  if (expr === '$') return [root]
  if (!expr.startsWith('$')) throw new Error('JSONPath 必须以 $ 开头')

  const tokens = expr
    .slice(1)
    .replace(/\[(\d+|\*)]/g, '.$1')
    .split('.')
    .filter(Boolean)
    .map((token) => (/^\d+$/.test(token) ? `[${token}]` : token))

  return tokens.reduce<JsonValue[]>(
    (values, token) => values.flatMap((value) => resolveJsonPathToken(value, token)),
    [root]
  )
}

export function parseToml(input: string): Record<string, JsonValue> {
  /**
   * TOML 解析结果统一输出为普通对象，方便工具页继续展示和转换。
   */
  const result: Record<string, JsonValue> = {}
  let path: string[] = []
  String(input ?? '')
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.replace(/#.*/, '').trim()
      if (!trimmed) return
      const section = trimmed.match(/^\[([\w.-]+)]$/)
      if (section) {
        path = section[1].split('.')
        return
      }
      const equalIndex = trimmed.indexOf('=')
      if (equalIndex < 0) return
      const key = trimmed.slice(0, equalIndex).trim()
      const value = parseTomlValue(trimmed.slice(equalIndex + 1))
      setNestedValue(result, path, key, value)
    })
  return result
}

export function inspectUserAgent(input: string): Record<string, string> {
  /**
   * UA 检测走启发式规则，只返回页面最需要的几个结论。
   */
  const ua = String(input ?? '')
  const browser =
    ua.match(/Edg\/([\d.]+)/)?.[0] ??
    ua.match(/Chrome\/([\d.]+)/)?.[0] ??
    ua.match(/Firefox\/([\d.]+)/)?.[0] ??
    ua.match(/Version\/([\d.]+).*Safari/)?.[0] ??
    'unknown'
  const os = ua.includes('Windows NT')
    ? 'Windows'
    : ua.includes('Mac OS X')
      ? 'macOS'
      : ua.includes('Android')
        ? 'Android'
        : ua.includes('iPhone') || ua.includes('iPad')
          ? 'iOS'
          : ua.includes('Linux')
            ? 'Linux'
            : 'unknown'
  return {
    browser,
    os,
    mobile: /Mobile|Android|iPhone|iPad/i.test(ua) ? 'yes' : 'no',
    engine: ua.includes('AppleWebKit') ? 'WebKit/Blink' : ua.includes('Gecko') ? 'Gecko' : 'unknown'
  }
}

export function inspectIpv4(input: string): Record<string, string> {
  /**
   * IPv4 检查额外返回整数和十六进制表示，方便和日志、数据库字段互相对照。
   */
  const match = String(input ?? '')
    .trim()
    .match(/^(\d{1,3}(?:\.\d{1,3}){3})(?:\/(\d{1,2}))?$/)
  if (!match) throw new Error('暂支持 IPv4 或 CIDR，例如 192.168.1.10/24')
  const octets = match[1].split('.').map(Number)
  if (octets.some((part) => part < 0 || part > 255)) throw new Error('IPv4 每段必须在 0-255')
  const cidr = match[2] ? Number(match[2]) : 32
  if (cidr < 0 || cidr > 32) throw new Error('CIDR 必须在 0-32')
  const numeric = octets.reduce((acc, part) => (acc << 8) + part, 0) >>> 0
  const privateRange =
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  return {
    ip: match[1],
    cidr: String(cidr),
    integer: String(numeric),
    hex: `0x${numeric.toString(16).toUpperCase().padStart(8, '0')}`,
    private: privateRange ? 'yes' : 'no'
  }
}

export function convertBase64Hex(input: string): Record<string, string> {
  /**
   * 通过启发式判断输入更像 Hex 还是 Base64，再返回另一种表示与 UTF-8 文本。
   */
  const raw = String(input ?? '').trim()
  if (/^[0-9a-f\s]+$/i.test(raw) && raw.replace(/\s+/g, '').length % 2 === 0) {
    const hex = raw.replace(/\s+/g, '')
    const bytes = new Uint8Array(hex.match(/.{2}/g)?.map((item) => Number.parseInt(item, 16)) ?? [])
    return {
      detected: 'hex',
      text: new TextDecoder().decode(bytes),
      base64: base64EncodeTextUtf8(new TextDecoder().decode(bytes))
    }
  }
  const text = base64DecodeToTextUtf8(raw)
  return {
    detected: 'base64',
    text,
    hex: Array.from(new TextEncoder().encode(text), (value) =>
      value.toString(16).padStart(2, '0')
    ).join('')
  }
}

export function encodeHtmlEntity(input: string): string {
  /**
   * HTML Entity 编解码直接复用 unicode 工具能力。
   */
  return htmlEntityEncode(input, false)
}

export function decodeHtmlEntity(input: string): string {
  return htmlEntityDecode(input)
}

export function addDateDays(input: string, days: number): string {
  /**
   * 日期加减统一输出 `YYYY-MM-DD`，适合日历级场景。
   */
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) throw new Error('请输入可解析日期，例如 2026-04-23')
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

export function diffDateDays(left: string, right: string): number {
  /**
   * 两日期差值按天取整。
   */
  const start = new Date(left)
  const end = new Date(right)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
    throw new Error('日期格式无法解析')
  return Math.round((end.getTime() - start.getTime()) / 86_400_000)
}

export function toKeyValueLines(input: string): string {
  /**
   * JSON 对象转 `key=value` 行；复杂值直接序列化。
   */
  const value = parseJsonLoose(input)
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('请输入 JSON 对象')
  return Object.entries(value)
    .map(([key, val]) => `${key}=${typeof val === 'object' ? JSON.stringify(val) : String(val)}`)
    .join('\n')
}

export function parseKeyValueLines(input: string): Record<string, string> {
  /**
   * `key=value` 文本解析保持宽松，没有等号的行会被视为空值 key。
   */
  return Object.fromEntries(
    String(input ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf('=')
        return index >= 0 ? [line.slice(0, index).trim(), line.slice(index + 1).trim()] : [line, '']
      })
  )
}

export function titleCaseText(input: string): string {
  /**
   * 对外保留一个语义化名称，供工具分发表调用。
   */
  return toTitleWords(input)
}
