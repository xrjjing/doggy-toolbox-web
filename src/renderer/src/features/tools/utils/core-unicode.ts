function isNodeEnv(): boolean {
  return typeof process !== 'undefined' && !!process.versions?.node
}

export function unicodeEscape(text: string): string {
  let result = ''
  for (const char of String(text ?? '')) {
    const code = char.codePointAt(0) ?? 0
    if (code > 0xffff) {
      const high = Math.floor((code - 0x10000) / 0x400) + 0xd800
      const low = ((code - 0x10000) % 0x400) + 0xdc00
      result += `\\u${high.toString(16).toUpperCase().padStart(4, '0')}`
      result += `\\u${low.toString(16).toUpperCase().padStart(4, '0')}`
    } else {
      result += `\\u${code.toString(16).toUpperCase().padStart(4, '0')}`
    }
  }
  return result
}

export function unicodeUnescape(text: string): string {
  return String(text ?? '').replace(/\\u([0-9A-Fa-f]{4})/g, (_match, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16))
  )
}

export function hexEscape(text: string): string {
  const value = String(text ?? '')
  const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null
  const bytes = encoder
    ? encoder.encode(value)
    : isNodeEnv()
      ? Uint8Array.from(Buffer.from(value, 'utf8'))
      : (() => {
          throw new Error('当前环境不支持 TextEncoder')
        })()

  return Array.from(bytes)
    .map((byte) => `\\x${byte.toString(16).toUpperCase().padStart(2, '0')}`)
    .join('')
}

export function hexUnescape(text: string): string {
  const value = String(text ?? '')
  const bytes: number[] = []
  let index = 0

  while (index < value.length) {
    if (value[index] === '\\' && value[index + 1] === 'x' && index + 3 < value.length) {
      const hex = value.slice(index + 2, index + 4)
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(Number.parseInt(hex, 16))
        index += 4
        continue
      }
    }

    const char = value[index]
    const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null
    const encoded = encoder
      ? encoder.encode(char)
      : isNodeEnv()
        ? Uint8Array.from(Buffer.from(char, 'utf8'))
        : (() => {
            throw new Error('当前环境不支持 TextEncoder')
          })()
    bytes.push(...encoded)
    index += 1
  }

  const result = new Uint8Array(bytes)
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8', { fatal: false }).decode(result)
  }
  if (isNodeEnv()) {
    return Buffer.from(result).toString('utf8')
  }
  throw new Error('当前环境不支持 TextDecoder')
}

export function htmlEntityEncode(text: string, useHex = true): string {
  return Array.from(String(text ?? ''))
    .map((char) => {
      const code = char.codePointAt(0) ?? 0
      return useHex ? `&#x${code.toString(16).toUpperCase()};` : `&#${code};`
    })
    .join('')
}

export function htmlEntityDecode(text: string): string {
  return String(text ?? '').replace(/&#x([0-9A-Fa-f]+);|&#(\d+);/g, (_match, hex, dec) =>
    String.fromCodePoint(hex ? Number.parseInt(hex, 16) : Number.parseInt(dec, 10))
  )
}

export function detectFormat(
  text: string
): 'unicode' | 'hex' | 'html_hex' | 'html_dec' | 'plain' | 'unknown' {
  const value = String(text ?? '').trim()
  if (!value) return 'unknown'
  if (/\\u[0-9A-Fa-f]{4}/.test(value)) return 'unicode'
  if (/\\x[0-9A-Fa-f]{2}/.test(value)) return 'hex'
  if (/&#x[0-9A-Fa-f]+;/.test(value)) return 'html_hex'
  if (/&#\d+;/.test(value)) return 'html_dec'
  return 'plain'
}

export function smartDecode(text: string): { result: string; format: string } {
  const format = detectFormat(text)
  if (format === 'unicode') return { result: unicodeUnescape(text), format: 'Unicode (\\uXXXX)' }
  if (format === 'hex') return { result: hexUnescape(text), format: 'Hex (\\xXX)' }
  if (format === 'html_hex' || format === 'html_dec') {
    return { result: htmlEntityDecode(text), format: 'HTML Entity' }
  }
  return { result: String(text ?? ''), format: '纯文本' }
}

export function batchEncode(
  text: string,
  format: 'unicode' | 'hex' | 'html_hex' | 'html_dec'
): string {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => {
      if (!line) return ''
      if (format === 'unicode') return unicodeEscape(line)
      if (format === 'hex') return hexEscape(line)
      return htmlEntityEncode(line, format === 'html_hex')
    })
    .join('\n')
}

export function batchDecode(
  text: string,
  format: 'unicode' | 'hex' | 'html' | 'html_hex' | 'html_dec' | 'auto'
): string {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => {
      if (!line) return ''
      if (format === 'unicode') return unicodeUnescape(line)
      if (format === 'hex') return hexUnescape(line)
      if (format === 'html' || format === 'html_hex' || format === 'html_dec')
        return htmlEntityDecode(line)
      return smartDecode(line).result
    })
    .join('\n')
}

export function encodeAll(text: string): {
  unicode: string
  hex: string
  htmlHex: string
  htmlDec: string
} {
  const value = String(text ?? '')
  return {
    unicode: unicodeEscape(value),
    hex: hexEscape(value),
    htmlHex: htmlEntityEncode(value, true),
    htmlDec: htmlEntityEncode(value, false)
  }
}
