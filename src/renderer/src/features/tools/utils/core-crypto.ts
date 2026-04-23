/**
 * 这份实现直接承接旧项目的纯前端 AES / DES 算法。
 * 目标不是做“密码学库替代品”，而是把旧工具已经验证过的 ECB + PKCS7 行为原样搬到新仓。
 */
export type SymmetricCryptoAlgorithm = 'aes' | 'des'
export type AesKeySize = 128 | 256
export type CryptoCipherFormat = 'base64' | 'hex'
export type CryptoCipherInputFormat = 'auto' | 'base64' | 'hex'

export type CryptoKeyDescription = {
  targetLength: number
  inputLength: number
  autoAdjust: boolean
  hint: string
}

export type EncryptSymmetricCryptoOptions = {
  algorithm: SymmetricCryptoAlgorithm
  plainText: string
  keyText: string
  aesKeySize?: AesKeySize
  autoAdjustKey?: boolean
  outputFormat?: CryptoCipherFormat
}

export type DecryptSymmetricCryptoOptions = {
  algorithm: SymmetricCryptoAlgorithm
  cipherText: string
  keyText: string
  aesKeySize?: AesKeySize
  autoAdjustKey?: boolean
  inputFormat?: CryptoCipherInputFormat
}

export type EncryptSymmetricCryptoResult = {
  output: string
  outputBytes: number
  inputBytes: number
  keyLength: number
  format: CryptoCipherFormat
}

export type DecryptSymmetricCryptoResult = {
  output: string
  inputBytes: number
  outputBytes: number
  keyLength: number
  resolvedInputFormat: CryptoCipherFormat
}

function isNodeEnv(): boolean {
  return typeof process !== 'undefined' && !!process.versions?.node
}

export function utf8ToBytes(text: string): Uint8Array {
  const raw = String(text ?? '')
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(raw)
  }
  if (isNodeEnv()) {
    return Uint8Array.from(Buffer.from(raw, 'utf8'))
  }
  const bytes = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index) & 0xff
  }
  return bytes
}

export function bytesToUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  }
  if (isNodeEnv()) {
    return Buffer.from(bytes).toString('utf8')
  }
  return Array.from(bytes, (value) => String.fromCharCode(value)).join('')
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function hexToBytes(hex: string): Uint8Array {
  const normalized = String(hex ?? '')
    .trim()
    .replace(/\s+/g, '')
  if (!normalized) return new Uint8Array(0)
  if (normalized.length % 2 !== 0) {
    throw new Error('非法 Hex：长度必须为偶数')
  }
  if (!/^[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error('非法 Hex：包含非十六进制字符')
  }

  const bytes = new Uint8Array(normalized.length / 2)
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16)
  }
  return bytes
}

export function base64EncodeBytes(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = ''
    for (const byte of bytes) {
      binary += String.fromCharCode(byte)
    }
    return btoa(binary)
  }
  if (isNodeEnv()) {
    return Buffer.from(bytes).toString('base64')
  }
  throw new Error('当前环境不支持 Base64 编码')
}

export function base64DecodeToBytes(base64Text: string): Uint8Array {
  let normalized = String(base64Text ?? '')
    .trim()
    .replace(/\s+/g, '')
  if (!normalized) return new Uint8Array(0)

  const mod = normalized.length % 4
  if (mod === 1) {
    throw new Error('非法 Base64：长度不合法')
  }
  if (mod === 2) normalized += '=='
  if (mod === 3) normalized += '='

  if (!/^[A-Za-z0-9+/=]+$/.test(normalized)) {
    throw new Error('非法 Base64：包含不支持的字符')
  }

  if (typeof atob === 'function') {
    const binary = atob(normalized)
    return Uint8Array.from(binary, (char) => char.charCodeAt(0))
  }
  if (isNodeEnv()) {
    return Uint8Array.from(Buffer.from(normalized, 'base64'))
  }
  throw new Error('当前环境不支持 Base64 解码')
}

export function pkcs7Pad(bytes: Uint8Array, blockSize: number): Uint8Array {
  const size = Number(blockSize)
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error('blockSize 不合法')
  }
  const padLength = size - (bytes.length % size || 0)
  const output = new Uint8Array(bytes.length + padLength)
  output.set(bytes)
  output.fill(padLength & 0xff, bytes.length)
  return output
}

export function pkcs7Unpad(bytes: Uint8Array, blockSize: number): Uint8Array {
  const size = Number(blockSize)
  if (bytes.length === 0 || bytes.length % size !== 0) {
    throw new Error('非法密文长度（非整块）')
  }

  const padLength = bytes[bytes.length - 1]
  if (padLength <= 0 || padLength > size) {
    throw new Error('PKCS7 填充不合法')
  }
  for (let index = bytes.length - padLength; index < bytes.length; index += 1) {
    if (bytes[index] !== padLength) {
      throw new Error('PKCS7 填充不合法')
    }
  }
  return bytes.slice(0, bytes.length - padLength)
}

export function getSymmetricKeyLength(
  algorithm: SymmetricCryptoAlgorithm,
  aesKeySize: AesKeySize = 128
): number {
  if (algorithm === 'des') return 8
  return aesKeySize === 256 ? 32 : 16
}

export function adjustKeyUtf8(
  keyText: string,
  targetLength: number,
  autoAdjust: boolean
): Uint8Array {
  const raw = utf8ToBytes(keyText)
  const length = Number(targetLength)
  if (!Number.isFinite(length) || length <= 0) {
    throw new Error('目标 key 长度不合法')
  }

  if (!autoAdjust) {
    if (raw.length !== length) {
      throw new Error(`key 长度必须为 ${length} 字节（UTF-8）`)
    }
    return raw
  }

  const adjusted = new Uint8Array(length)
  adjusted.set(raw.slice(0, length))
  return adjusted
}

export function describeCryptoKey(
  algorithm: SymmetricCryptoAlgorithm,
  aesKeySize: AesKeySize,
  keyText: string,
  autoAdjust: boolean
): CryptoKeyDescription {
  const targetLength = getSymmetricKeyLength(algorithm, aesKeySize)
  const inputLength = utf8ToBytes(keyText).length
  return {
    targetLength,
    inputLength,
    autoAdjust,
    hint: autoAdjust
      ? `目标 key 长度：${targetLength} 字节（不足右补 0x00，超出截断）`
      : `严格 key 长度：必须为 ${targetLength} 字节（UTF-8）`
  }
}

export function detectCipherFormatAuto(text: string): CryptoCipherFormat {
  const normalized = String(text ?? '')
    .trim()
    .replace(/\s+/g, '')
  if (!normalized) return 'base64'
  if (normalized.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(normalized)) {
    return 'hex'
  }
  return 'base64'
}

const AES_SBOX = [
  0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
  0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
  0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
  0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
  0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
  0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
  0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
  0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
  0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
  0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
  0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
  0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
  0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
  0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
  0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
  0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16
] as const

const AES_INV_SBOX = [
  0x52, 0x09, 0x6a, 0xd5, 0x30, 0x36, 0xa5, 0x38, 0xbf, 0x40, 0xa3, 0x9e, 0x81, 0xf3, 0xd7, 0xfb,
  0x7c, 0xe3, 0x39, 0x82, 0x9b, 0x2f, 0xff, 0x87, 0x34, 0x8e, 0x43, 0x44, 0xc4, 0xde, 0xe9, 0xcb,
  0x54, 0x7b, 0x94, 0x32, 0xa6, 0xc2, 0x23, 0x3d, 0xee, 0x4c, 0x95, 0x0b, 0x42, 0xfa, 0xc3, 0x4e,
  0x08, 0x2e, 0xa1, 0x66, 0x28, 0xd9, 0x24, 0xb2, 0x76, 0x5b, 0xa2, 0x49, 0x6d, 0x8b, 0xd1, 0x25,
  0x72, 0xf8, 0xf6, 0x64, 0x86, 0x68, 0x98, 0x16, 0xd4, 0xa4, 0x5c, 0xcc, 0x5d, 0x65, 0xb6, 0x92,
  0x6c, 0x70, 0x48, 0x50, 0xfd, 0xed, 0xb9, 0xda, 0x5e, 0x15, 0x46, 0x57, 0xa7, 0x8d, 0x9d, 0x84,
  0x90, 0xd8, 0xab, 0x00, 0x8c, 0xbc, 0xd3, 0x0a, 0xf7, 0xe4, 0x58, 0x05, 0xb8, 0xb3, 0x45, 0x06,
  0xd0, 0x2c, 0x1e, 0x8f, 0xca, 0x3f, 0x0f, 0x02, 0xc1, 0xaf, 0xbd, 0x03, 0x01, 0x13, 0x8a, 0x6b,
  0x3a, 0x91, 0x11, 0x41, 0x4f, 0x67, 0xdc, 0xea, 0x97, 0xf2, 0xcf, 0xce, 0xf0, 0xb4, 0xe6, 0x73,
  0x96, 0xac, 0x74, 0x22, 0xe7, 0xad, 0x35, 0x85, 0xe2, 0xf9, 0x37, 0xe8, 0x1c, 0x75, 0xdf, 0x6e,
  0x47, 0xf1, 0x1a, 0x71, 0x1d, 0x29, 0xc5, 0x89, 0x6f, 0xb7, 0x62, 0x0e, 0xaa, 0x18, 0xbe, 0x1b,
  0xfc, 0x56, 0x3e, 0x4b, 0xc6, 0xd2, 0x79, 0x20, 0x9a, 0xdb, 0xc0, 0xfe, 0x78, 0xcd, 0x5a, 0xf4,
  0x1f, 0xdd, 0xa8, 0x33, 0x88, 0x07, 0xc7, 0x31, 0xb1, 0x12, 0x10, 0x59, 0x27, 0x80, 0xec, 0x5f,
  0x60, 0x51, 0x7f, 0xa9, 0x19, 0xb5, 0x4a, 0x0d, 0x2d, 0xe5, 0x7a, 0x9f, 0x93, 0xc9, 0x9c, 0xef,
  0xa0, 0xe0, 0x3b, 0x4d, 0xae, 0x2a, 0xf5, 0xb0, 0xc8, 0xeb, 0xbb, 0x3c, 0x83, 0x53, 0x99, 0x61,
  0x17, 0x2b, 0x04, 0x7e, 0xba, 0x77, 0xd6, 0x26, 0xe1, 0x69, 0x14, 0x63, 0x55, 0x21, 0x0c, 0x7d
] as const

const AES_RCON = [
  0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36, 0x6c, 0xd8, 0xab, 0x4d, 0x9a
] as const

function xtime(value: number): number {
  return ((value << 1) ^ (value & 0x80 ? 0x1b : 0x00)) & 0xff
}

function gmul(a: number, b: number): number {
  let product = 0
  let left = a & 0xff
  let right = b & 0xff
  for (let index = 0; index < 8; index += 1) {
    if (right & 1) product ^= left
    const highBit = left & 0x80
    left = (left << 1) & 0xff
    if (highBit) left ^= 0x1b
    right >>= 1
  }
  return product & 0xff
}

function subBytes(state: Uint8Array): void {
  for (let index = 0; index < 16; index += 1) {
    state[index] = AES_SBOX[state[index]]
  }
}

function invSubBytes(state: Uint8Array): void {
  for (let index = 0; index < 16; index += 1) {
    state[index] = AES_INV_SBOX[state[index]]
  }
}

function shiftRows(state: Uint8Array): void {
  const snapshot = state.slice()
  state[1] = snapshot[5]
  state[5] = snapshot[9]
  state[9] = snapshot[13]
  state[13] = snapshot[1]
  state[2] = snapshot[10]
  state[6] = snapshot[14]
  state[10] = snapshot[2]
  state[14] = snapshot[6]
  state[3] = snapshot[15]
  state[7] = snapshot[3]
  state[11] = snapshot[7]
  state[15] = snapshot[11]
}

function invShiftRows(state: Uint8Array): void {
  const snapshot = state.slice()
  state[1] = snapshot[13]
  state[5] = snapshot[1]
  state[9] = snapshot[5]
  state[13] = snapshot[9]
  state[2] = snapshot[10]
  state[6] = snapshot[14]
  state[10] = snapshot[2]
  state[14] = snapshot[6]
  state[3] = snapshot[7]
  state[7] = snapshot[11]
  state[11] = snapshot[15]
  state[15] = snapshot[3]
}

function mixColumns(state: Uint8Array): void {
  for (let column = 0; column < 4; column += 1) {
    const index = column * 4
    const a0 = state[index]
    const a1 = state[index + 1]
    const a2 = state[index + 2]
    const a3 = state[index + 3]
    const total = a0 ^ a1 ^ a2 ^ a3
    const originalA0 = a0
    state[index] = (a0 ^ total ^ xtime(a0 ^ a1)) & 0xff
    state[index + 1] = (a1 ^ total ^ xtime(a1 ^ a2)) & 0xff
    state[index + 2] = (a2 ^ total ^ xtime(a2 ^ a3)) & 0xff
    state[index + 3] = (a3 ^ total ^ xtime(a3 ^ originalA0)) & 0xff
  }
}

function invMixColumns(state: Uint8Array): void {
  for (let column = 0; column < 4; column += 1) {
    const index = column * 4
    const a0 = state[index]
    const a1 = state[index + 1]
    const a2 = state[index + 2]
    const a3 = state[index + 3]
    state[index] = (gmul(a0, 0x0e) ^ gmul(a1, 0x0b) ^ gmul(a2, 0x0d) ^ gmul(a3, 0x09)) & 0xff
    state[index + 1] = (gmul(a0, 0x09) ^ gmul(a1, 0x0e) ^ gmul(a2, 0x0b) ^ gmul(a3, 0x0d)) & 0xff
    state[index + 2] = (gmul(a0, 0x0d) ^ gmul(a1, 0x09) ^ gmul(a2, 0x0e) ^ gmul(a3, 0x0b)) & 0xff
    state[index + 3] = (gmul(a0, 0x0b) ^ gmul(a1, 0x0d) ^ gmul(a2, 0x09) ^ gmul(a3, 0x0e)) & 0xff
  }
}

function addRoundKey(state: Uint8Array, roundKeys: Uint8Array, round: number): void {
  const start = round * 16
  for (let index = 0; index < 16; index += 1) {
    state[index] ^= roundKeys[start + index]
  }
}

function expandAesKey(keyBytes: Uint8Array): { roundKeys: Uint8Array; rounds: number } {
  const keyLength = keyBytes.length
  const keyWords = keyLength === 16 ? 4 : keyLength === 32 ? 8 : 0
  if (!keyWords) {
    throw new Error('AES key 长度必须为 16 或 32 字节')
  }
  const rounds = keyWords === 4 ? 10 : 14
  const words = new Uint32Array(4 * (rounds + 1))

  for (let index = 0; index < keyWords; index += 1) {
    const base = index * 4
    words[index] =
      ((keyBytes[base] << 24) |
        (keyBytes[base + 1] << 16) |
        (keyBytes[base + 2] << 8) |
        keyBytes[base + 3]) >>>
      0
  }

  const rotWord = (word: number): number => ((word << 8) | (word >>> 24)) >>> 0
  const subWord = (word: number): number =>
    ((AES_SBOX[(word >>> 24) & 0xff] << 24) |
      (AES_SBOX[(word >>> 16) & 0xff] << 16) |
      (AES_SBOX[(word >>> 8) & 0xff] << 8) |
      AES_SBOX[word & 0xff]) >>>
    0

  for (let index = keyWords; index < words.length; index += 1) {
    let temp = words[index - 1]
    if (index % keyWords === 0) {
      temp = (subWord(rotWord(temp)) ^ (AES_RCON[index / keyWords] << 24)) >>> 0
    } else if (keyWords === 8 && index % keyWords === 4) {
      temp = subWord(temp)
    }
    words[index] = (words[index - keyWords] ^ temp) >>> 0
  }

  const roundKeys = new Uint8Array((rounds + 1) * 16)
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index]
    roundKeys[index * 4] = (word >>> 24) & 0xff
    roundKeys[index * 4 + 1] = (word >>> 16) & 0xff
    roundKeys[index * 4 + 2] = (word >>> 8) & 0xff
    roundKeys[index * 4 + 3] = word & 0xff
  }

  return { roundKeys, rounds }
}

function aesEncryptBlock(
  block: Uint8Array,
  expanded: { roundKeys: Uint8Array; rounds: number }
): Uint8Array {
  const state = Uint8Array.from(block)
  addRoundKey(state, expanded.roundKeys, 0)
  for (let round = 1; round < expanded.rounds; round += 1) {
    subBytes(state)
    shiftRows(state)
    mixColumns(state)
    addRoundKey(state, expanded.roundKeys, round)
  }
  subBytes(state)
  shiftRows(state)
  addRoundKey(state, expanded.roundKeys, expanded.rounds)
  return state
}

function aesDecryptBlock(
  block: Uint8Array,
  expanded: { roundKeys: Uint8Array; rounds: number }
): Uint8Array {
  const state = Uint8Array.from(block)
  addRoundKey(state, expanded.roundKeys, expanded.rounds)
  for (let round = expanded.rounds - 1; round >= 1; round -= 1) {
    invShiftRows(state)
    invSubBytes(state)
    addRoundKey(state, expanded.roundKeys, round)
    invMixColumns(state)
  }
  invShiftRows(state)
  invSubBytes(state)
  addRoundKey(state, expanded.roundKeys, 0)
  return state
}

export function aesEcbEncrypt(plainBytes: Uint8Array, keyBytes: Uint8Array): Uint8Array {
  const expanded = expandAesKey(keyBytes)
  const padded = pkcs7Pad(plainBytes, 16)
  const output = new Uint8Array(padded.length)
  for (let index = 0; index < padded.length; index += 16) {
    output.set(aesEncryptBlock(padded.slice(index, index + 16), expanded), index)
  }
  return output
}

export function aesEcbDecrypt(cipherBytes: Uint8Array, keyBytes: Uint8Array): Uint8Array {
  if (cipherBytes.length === 0 || cipherBytes.length % 16 !== 0) {
    throw new Error('非法密文长度（AES 块大小为 16 字节）')
  }
  const expanded = expandAesKey(keyBytes)
  const output = new Uint8Array(cipherBytes.length)
  for (let index = 0; index < cipherBytes.length; index += 16) {
    output.set(aesDecryptBlock(cipherBytes.slice(index, index + 16), expanded), index)
  }
  return pkcs7Unpad(output, 16)
}

const DES_IP = [
  58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4, 62, 54, 46, 38, 30, 22, 14, 6, 64,
  56, 48, 40, 32, 24, 16, 8, 57, 49, 41, 33, 25, 17, 9, 1, 59, 51, 43, 35, 27, 19, 11, 3, 61, 53,
  45, 37, 29, 21, 13, 5, 63, 55, 47, 39, 31, 23, 15, 7
] as const
const DES_FP = [
  40, 8, 48, 16, 56, 24, 64, 32, 39, 7, 47, 15, 55, 23, 63, 31, 38, 6, 46, 14, 54, 22, 62, 30, 37,
  5, 45, 13, 53, 21, 61, 29, 36, 4, 44, 12, 52, 20, 60, 28, 35, 3, 43, 11, 51, 19, 59, 27, 34, 2,
  42, 10, 50, 18, 58, 26, 33, 1, 41, 9, 49, 17, 57, 25
] as const
const DES_E = [
  32, 1, 2, 3, 4, 5, 4, 5, 6, 7, 8, 9, 8, 9, 10, 11, 12, 13, 12, 13, 14, 15, 16, 17, 16, 17, 18, 19,
  20, 21, 20, 21, 22, 23, 24, 25, 24, 25, 26, 27, 28, 29, 28, 29, 30, 31, 32, 1
] as const
const DES_P = [
  16, 7, 20, 21, 29, 12, 28, 17, 1, 15, 23, 26, 5, 18, 31, 10, 2, 8, 24, 14, 32, 27, 3, 9, 19, 13,
  30, 6, 22, 11, 4, 25
] as const
const DES_PC1 = [
  57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18, 10, 2, 59, 51, 43, 35, 27, 19, 11, 3, 60,
  52, 44, 36, 63, 55, 47, 39, 31, 23, 15, 7, 62, 54, 46, 38, 30, 22, 14, 6, 61, 53, 45, 37, 29, 21,
  13, 5, 28, 20, 12, 4
] as const
const DES_PC2 = [
  14, 17, 11, 24, 1, 5, 3, 28, 15, 6, 21, 10, 23, 19, 12, 4, 26, 8, 16, 7, 27, 20, 13, 2, 41, 52,
  31, 37, 47, 55, 30, 40, 51, 45, 33, 48, 44, 49, 39, 56, 34, 53, 46, 42, 50, 36, 29, 32
] as const
const DES_SHIFTS = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1] as const
const DES_SBOX = [
  [
    [14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7],
    [0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8],
    [4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0],
    [15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13]
  ],
  [
    [15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10],
    [3, 13, 4, 7, 15, 2, 8, 14, 12, 0, 1, 10, 6, 9, 11, 5],
    [0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15],
    [13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9]
  ],
  [
    [10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8],
    [13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1],
    [13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7],
    [1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12]
  ],
  [
    [7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15],
    [13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9],
    [10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4],
    [3, 15, 0, 6, 10, 1, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14]
  ],
  [
    [2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9],
    [14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6],
    [4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14],
    [11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3]
  ],
  [
    [12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11],
    [10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8],
    [9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6],
    [4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13]
  ],
  [
    [4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1],
    [13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6],
    [1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2],
    [6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12]
  ],
  [
    [13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7],
    [1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2],
    [7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8],
    [2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11]
  ]
] as const

function bytesToBigIntBE(bytes: Uint8Array): bigint {
  let value = 0n
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte & 0xff)
  }
  return value
}

function bigIntToBytesBE(value: bigint, size: number): Uint8Array {
  const output = new Uint8Array(size)
  let current = value
  for (let index = size - 1; index >= 0; index -= 1) {
    output[index] = Number(current & 0xffn)
    current >>= 8n
  }
  return output
}

function permuteBits(value: bigint, table: readonly number[], inputBits: number): bigint {
  let output = 0n
  const totalBits = BigInt(inputBits)
  for (const bitIndex of table) {
    const bit = (value >> (totalBits - BigInt(bitIndex))) & 1n
    output = (output << 1n) | bit
  }
  return output
}

function rotateLeft28(value: bigint, shift: number): bigint {
  const mask = (1n << 28n) - 1n
  const currentShift = BigInt(shift)
  return (((value << currentShift) & mask) | (value >> (28n - currentShift))) & mask
}

function createDesSubKeys(key64: bigint): bigint[] {
  const pc1 = permuteBits(key64, DES_PC1, 64)
  let left = (pc1 >> 28n) & ((1n << 28n) - 1n)
  let right = pc1 & ((1n << 28n) - 1n)
  const keys: bigint[] = []
  for (const shift of DES_SHIFTS) {
    left = rotateLeft28(left, shift)
    right = rotateLeft28(right, shift)
    keys.push(permuteBits((left << 28n) | right, DES_PC2, 56))
  }
  return keys
}

function desFeistel(right32: bigint, subKey48: bigint): bigint {
  const expanded = permuteBits(right32, DES_E, 32) ^ subKey48
  let output = 0n
  for (let boxIndex = 0; boxIndex < 8; boxIndex += 1) {
    const shift = BigInt((7 - boxIndex) * 6)
    const chunk = Number((expanded >> shift) & 0x3fn)
    const row = ((chunk & 0x20) >> 4) | (chunk & 0x01)
    const column = (chunk >> 1) & 0x0f
    output = (output << 4n) | BigInt(DES_SBOX[boxIndex][row][column] & 0x0f)
  }
  return permuteBits(output, DES_P, 32)
}

function desCryptBlock(block64: bigint, subKeys: bigint[], decrypt: boolean): bigint {
  const initial = permuteBits(block64, DES_IP, 64)
  let left = (initial >> 32n) & 0xffffffffn
  let right = initial & 0xffffffffn
  for (let index = 0; index < 16; index += 1) {
    const key = decrypt ? subKeys[15 - index] : subKeys[index]
    const nextLeft = right
    const nextRight = (left ^ desFeistel(right, key)) & 0xffffffffn
    left = nextLeft
    right = nextRight
  }
  return permuteBits((right << 32n) | left, DES_FP, 64)
}

export function desEcbEncrypt(plainBytes: Uint8Array, keyBytes: Uint8Array): Uint8Array {
  if (keyBytes.length !== 8) {
    throw new Error('DES key 长度必须为 8 字节')
  }
  const subKeys = createDesSubKeys(bytesToBigIntBE(keyBytes))
  const padded = pkcs7Pad(plainBytes, 8)
  const output = new Uint8Array(padded.length)
  for (let index = 0; index < padded.length; index += 8) {
    const block = bytesToBigIntBE(padded.slice(index, index + 8))
    output.set(bigIntToBytesBE(desCryptBlock(block, subKeys, false), 8), index)
  }
  return output
}

export function desEcbDecrypt(cipherBytes: Uint8Array, keyBytes: Uint8Array): Uint8Array {
  if (keyBytes.length !== 8) {
    throw new Error('DES key 长度必须为 8 字节')
  }
  if (cipherBytes.length === 0 || cipherBytes.length % 8 !== 0) {
    throw new Error('非法密文长度（DES 块大小为 8 字节）')
  }
  const subKeys = createDesSubKeys(bytesToBigIntBE(keyBytes))
  const output = new Uint8Array(cipherBytes.length)
  for (let index = 0; index < cipherBytes.length; index += 8) {
    const block = bytesToBigIntBE(cipherBytes.slice(index, index + 8))
    output.set(bigIntToBytesBE(desCryptBlock(block, subKeys, true), 8), index)
  }
  return pkcs7Unpad(output, 8)
}

export function encryptWithSymmetricCrypto(
  options: EncryptSymmetricCryptoOptions
): EncryptSymmetricCryptoResult {
  const algorithm = options.algorithm
  const format = options.outputFormat ?? 'base64'
  const keyLength = getSymmetricKeyLength(algorithm, options.aesKeySize ?? 128)
  const keyBytes = adjustKeyUtf8(options.keyText, keyLength, options.autoAdjustKey ?? true)
  const plainBytes = utf8ToBytes(options.plainText)
  const cipherBytes =
    algorithm === 'aes' ? aesEcbEncrypt(plainBytes, keyBytes) : desEcbEncrypt(plainBytes, keyBytes)
  return {
    output: format === 'hex' ? bytesToHex(cipherBytes) : base64EncodeBytes(cipherBytes),
    outputBytes: cipherBytes.length,
    inputBytes: plainBytes.length,
    keyLength: keyBytes.length,
    format
  }
}

export function decryptWithSymmetricCrypto(
  options: DecryptSymmetricCryptoOptions
): DecryptSymmetricCryptoResult {
  const algorithm = options.algorithm
  const resolvedInputFormat =
    options.inputFormat && options.inputFormat !== 'auto'
      ? options.inputFormat
      : detectCipherFormatAuto(options.cipherText)
  const keyLength = getSymmetricKeyLength(algorithm, options.aesKeySize ?? 128)
  const keyBytes = adjustKeyUtf8(options.keyText, keyLength, options.autoAdjustKey ?? true)
  const cipherBytes =
    resolvedInputFormat === 'hex'
      ? hexToBytes(options.cipherText)
      : base64DecodeToBytes(options.cipherText)
  const outputBytes =
    algorithm === 'aes'
      ? aesEcbDecrypt(cipherBytes, keyBytes)
      : desEcbDecrypt(cipherBytes, keyBytes)

  return {
    output: bytesToUtf8(outputBytes),
    inputBytes: cipherBytes.length,
    outputBytes: outputBytes.length,
    keyLength: keyBytes.length,
    resolvedInputFormat
  }
}
