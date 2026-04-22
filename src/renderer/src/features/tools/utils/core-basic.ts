function isNodeEnv(): boolean {
  return typeof process !== 'undefined' && !!process.versions?.node
}

function utf8ToBytes(text: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text)
  }
  if (isNodeEnv()) {
    return Uint8Array.from(Buffer.from(text, 'utf8'))
  }
  const arr = new Uint8Array(text.length)
  for (let index = 0; index < text.length; index += 1) {
    arr[index] = text.charCodeAt(index) & 0xff
  }
  return arr
}

function bytesToUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  }
  if (isNodeEnv()) {
    return Buffer.from(bytes).toString('utf8')
  }
  return Array.from(bytes)
    .map((value) => String.fromCharCode(value))
    .join('')
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = ''
    const chunkSize = 0x8000
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...Array.from(bytes.subarray(index, index + chunkSize)))
    }
    return btoa(binary)
  }
  if (isNodeEnv()) {
    return Buffer.from(bytes).toString('base64')
  }
  throw new Error('当前环境不支持 Base64 编码')
}

function normalizeBase64Input(input: string): string {
  const stripped = input.replace(/\s+/g, '')
  if (!stripped) return ''
  if (!/^[A-Za-z0-9+/=]+$/.test(stripped)) {
    throw new Error('非法 Base64：包含不支持的字符')
  }

  const mod = stripped.length % 4
  if (mod === 1) {
    throw new Error('非法 Base64：长度不合法')
  }
  if (mod === 2) return `${stripped}==`
  if (mod === 3) return `${stripped}=`
  return stripped
}

function base64ToBytes(base64Text: string): Uint8Array {
  const normalized = normalizeBase64Input(base64Text)
  if (!normalized) return new Uint8Array(0)

  if (typeof atob === 'function') {
    const binary = atob(normalized)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index) & 0xff
    }
    return bytes
  }
  if (isNodeEnv()) {
    return Uint8Array.from(Buffer.from(normalized, 'base64'))
  }
  throw new Error('当前环境不支持 Base64 解码')
}

function splitWords(input: string): string[] {
  const raw = input.trim()
  if (!raw) return []

  const normalized = raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  const parts = normalized.split(' ').filter(Boolean)
  const pattern = /[A-Z]+(?=[A-Z][a-z]|[0-9]|$)|[A-Z]?[a-z]+|[0-9]+/g

  return parts.flatMap((part) => part.match(pattern) ?? [])
}

function isAcronym(word: string): boolean {
  return word.length > 1 && word === word.toUpperCase() && word !== word.toLowerCase()
}

function titleize(word: string): string {
  if (!word) return ''
  if (isAcronym(word)) return word
  const lower = word.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

export function base64EncodeTextUtf8(text: string): string {
  return bytesToBase64(utf8ToBytes(String(text ?? '')))
}

export function base64DecodeToTextUtf8(text: string): string {
  return bytesToUtf8(base64ToBytes(String(text ?? '')))
}

export function generateUuidV4(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  throw new Error('当前环境不支持安全随机数（crypto）')
}

export function toNamingFormats(input: string): Record<string, string> {
  const words = splitWords(String(input ?? ''))
  if (!words.length) {
    return {
      space: '',
      camelSpace: '',
      kebab: '',
      snakeUpper: '',
      pascal: '',
      camel: '',
      snake: ''
    }
  }

  const lowerWords = words.map((word) => word.toLowerCase())
  const upperWords = words.map((word) => word.toUpperCase())
  const pascal = words.map(titleize).join('')
  const camel = lowerWords[0] + words.slice(1).map(titleize).join('')

  return {
    space: lowerWords.join(' '),
    camelSpace: words.map(titleize).join(' '),
    kebab: lowerWords.join('-'),
    snakeUpper: upperWords.join('_'),
    pascal,
    camel,
    snake: lowerWords.join('_')
  }
}
