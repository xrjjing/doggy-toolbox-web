import { describe, expect, it } from 'vitest'
import {
  advancedFixJson,
  base64DecodeToTextUtf8,
  base64EncodeTextUtf8,
  batchDecode,
  batchEncode,
  convertRadix,
  convertToAllRadix,
  deduplicate,
  detectFormat,
  detectRadix,
  detectTimeInputType,
  detectUrlEncoded,
  encodeAll,
  escapeJson,
  formatJson,
  formatUnixMillis,
  getNowValues,
  hashHexUtf8,
  htmlEntityDecode,
  htmlEntityEncode,
  minifyJson,
  parseTimeInput,
  removeEmptyLines,
  sha256HexUtf8,
  sortJsonFields,
  sortLines,
  toNamingFormats,
  unicodeEscape,
  unicodeUnescape,
  unescapeJson,
  urlDecode,
  urlDecodeBatch,
  urlEncode,
  urlEncodeBatch,
  validateJson
} from '@renderer/features/tools/utils'

describe('base64 and naming utilities', () => {
  it('encodes and decodes UTF-8 text', () => {
    const encoded = base64EncodeTextUtf8('hello dog')
    expect(encoded).toBe('aGVsbG8gZG9n')
    expect(base64DecodeToTextUtf8(encoded)).toBe('hello dog')
  })

  it('ignores whitespace and restores missing Base64 padding', () => {
    expect(base64DecodeToTextUtf8('YQ')).toBe('a')
    expect(base64DecodeToTextUtf8('5rWL 6K+V')).toBe('\u6D4B\u8BD5')
  })

  it('converts mixed identifiers to old project naming formats', () => {
    expect(toNamingFormats('USER_ID userName dog2Age')).toEqual({
      space: 'user id user name dog 2 age',
      camelSpace: 'USER ID User Name Dog 2 Age',
      kebab: 'user-id-user-name-dog-2-age',
      snakeUpper: 'USER_ID_USER_NAME_DOG_2_AGE',
      pascal: 'USERIDUserNameDog2Age',
      camel: 'userIDUserNameDog2Age',
      snake: 'user_id_user_name_dog_2_age'
    })
  })
})

describe('URL utilities', () => {
  it('encodes and decodes single text with encodeURIComponent semantics', () => {
    const encoded = urlEncode('https://example.com?q=dog cat&x=1')
    expect(encoded).toBe('https%3A%2F%2Fexample.com%3Fq%3Ddog%20cat%26x%3D1')
    expect(urlDecode(encoded)).toBe('https://example.com?q=dog cat&x=1')
  })

  it('encodes and decodes by line in batch mode', () => {
    const encoded = urlEncodeBatch('a b\n\nc/d')
    expect(encoded).toBe('a%20b\n\nc%2Fd')
    expect(urlDecodeBatch(encoded)).toEqual({ result: 'a b\n\nc/d', errors: [] })
  })

  it('detects URL encoded content and preserves invalid batch lines', () => {
    expect(detectUrlEncoded('a%20b').isUrlEncoded).toBe(true)
    const decoded = urlDecodeBatch('ok%20line\nbad%ZZ')
    expect(decoded.result).toBe('ok line\nbad%ZZ')
    expect(decoded.errors).toHaveLength(1)
  })
})

describe('UUID and hash utilities', () => {
  it('generates UUID v4 format', async () => {
    const { generateUuidV4 } = await import('@renderer/features/tools/utils')
    expect(generateUuidV4()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
  })

  it('calculates MD5 hex for UTF-8 text', () => {
    expect(hashHexUtf8('doggy-toolbox-web', 'md5')).toBe('ea3f2d5efcfb2a9a803522b83b3a1a15')
  })

  it('calculates SHA-256 hex for UTF-8 text', () => {
    expect(sha256HexUtf8('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
  })
})

describe('time utilities', () => {
  it('detects timestamp length using old seconds/millis/nanos rules', () => {
    expect(detectTimeInputType('1713763200').type).toBe('unix_s')
    expect(detectTimeInputType('1713763200000').type).toBe('unix_ms')
    expect(detectTimeInputType('1713763200000000000').type).toBe('unix_ns')
  })

  it('formats unix milliseconds with explicit UTC+8 offset', () => {
    expect(formatUnixMillis(0n, 8 * 60 * 60 * 1000, false)).toBe('1970-01-01 08:00:00')
    expect(formatUnixMillis(1n, 0, true)).toBe('1970-01-01 00:00:00.001')
  })

  it('parses datetime as selected timezone local time', () => {
    const parsed = parseTimeInput('1970-01-01 08:00:00', 'datetime', 8 * 60 * 60 * 1000)
    expect(parsed.errors).toEqual([])
    expect(parsed.unixMillis?.toString()).toBe('0')
    expect(getNowValues(0, 1000)).toEqual({
      stdSec: '1970-01-01 00:00:01',
      unixSec: '1',
      stdMs: '1970-01-01 00:00:01.000',
      unixMs: '1000'
    })
  })
})

describe('JSON utilities', () => {
  it('formats, minifies, and validates JSON', () => {
    expect(formatJson('{"b":2,"a":1}', 2).result).toBe('{\n  "b": 2,\n  "a": 1\n}')
    expect(minifyJson('{\n  "a": 1\n}').result).toBe('{"a":1}')
    expect(validateJson('{"a":1}').valid).toBe(true)
  })

  it('repairs common JSON-like input', () => {
    const fixed = advancedFixJson("{foo:'bar', trailing: [1,2,], // comment\nbad: undefined}")
    expect(fixed.error).toBeNull()
    expect(JSON.parse(fixed.result)).toEqual({ foo: 'bar', trailing: [1, 2], bad: null })
    expect(fixed.fixes.length).toBeGreaterThan(0)
  })

  it('sorts and escapes JSON content', () => {
    expect(sortJsonFields('{"b":2,"a":{"d":4,"c":3}}', 'asc', 2).result).toBe(
      '{\n  "a": {\n    "c": 3,\n    "d": 4\n  },\n  "b": 2\n}'
    )
    expect(escapeJson('line\n"quote"').result).toBe('line\\n\\"quote\\"')
    expect(unescapeJson('line\\n\\"quote\\"').result).toBe('line\n"quote"')
  })
})

describe('text utilities', () => {
  it('deduplicates lines with trim and case-insensitive options', () => {
    expect(deduplicate(' Apple \napple\nDog', false, true)).toBe('Apple\nDog')
  })

  it('sorts lines by text and length', () => {
    expect(sortLines('b\nA\nc', 'asc', false)).toBe('A\nb\nc')
    expect(sortLines('aaaa\nb\ncc', 'length-desc', true)).toBe('aaaa\ncc\nb')
  })

  it('removes empty lines', () => {
    expect(removeEmptyLines('a\n\n  \nb')).toBe('a\nb')
  })
})

describe('Unicode utilities', () => {
  it('encodes and decodes unicode escape sequences', () => {
    expect(unicodeEscape('A')).toBe('\\u0041')
    expect(unicodeUnescape('\\u4F60\\u597D')).toBe('\u4F60\u597D')
  })

  it('handles hex and HTML entity formats', () => {
    const encoded = encodeAll('A')
    expect(encoded.hex).toBe('\\x41')
    expect(htmlEntityEncode('A', false)).toBe('&#65;')
    expect(htmlEntityDecode('&#x4F60;&#22909;')).toBe('\u4F60\u597D')
    expect(batchDecode(batchEncode('A\nB', 'unicode'), 'auto')).toBe('A\nB')
  })

  it('detects and smart-decodes known formats', async () => {
    const { smartDecode } = await import('@renderer/features/tools/utils')
    expect(detectFormat('\\xE4\\xBD\\xA0')).toBe('hex')
    expect(smartDecode('\\xE4\\xBD\\xA0').result).toBe('\u4F60')
  })
})

describe('radix utilities', () => {
  it('detects common radix prefixes', () => {
    expect(detectRadix('0xff')).toEqual({ radix: 16, value: 'ff' })
    expect(detectRadix('0b1010')).toEqual({ radix: 2, value: '1010' })
  })

  it('converts between bases with BigInt', () => {
    expect(convertRadix('0xff', 'auto', 10)).toBe('255')
    expect(convertRadix('255', 10, 16)).toBe('ff')
  })

  it('returns all primary radix outputs', () => {
    expect(convertToAllRadix('255', 10)).toEqual({
      bin: '11111111',
      oct: '377',
      dec: '255',
      hex: 'FF',
      detectedRadix: 10
    })
  })
})
