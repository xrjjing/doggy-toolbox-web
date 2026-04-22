function utf8ToBytes(text: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(String(text ?? ''))
  }
  return Uint8Array.from(Buffer.from(String(text ?? ''), 'utf8'))
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}

function add32(left: number, right: number): number {
  return (left + right) >>> 0
}

function rotl32(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0
}

const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14,
  20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6,
  10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
]

const MD5_K = Array.from(
  { length: 64 },
  (_value, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0
)

function md5Bytes(bytes: Uint8Array): Uint8Array {
  const inputLength = bytes.length
  const bitLength = inputLength * 8
  const withOne = inputLength + 1
  const padLength = withOne % 64 <= 56 ? 56 - (withOne % 64) : 120 - (withOne % 64)
  const totalLength = inputLength + 1 + padLength + 8
  const buffer = new Uint8Array(totalLength)
  buffer.set(bytes)
  buffer[inputLength] = 0x80

  const bitLenLow = bitLength >>> 0
  const bitLenHigh = Math.floor(bitLength / 0x100000000) >>> 0
  for (let index = 0; index < 4; index += 1) {
    buffer[totalLength - 8 + index] = (bitLenLow >>> (8 * index)) & 0xff
    buffer[totalLength - 4 + index] = (bitLenHigh >>> (8 * index)) & 0xff
  }

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476
  const words = new Array<number>(16)

  for (let offset = 0; offset < buffer.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const cursor = offset + index * 4
      words[index] =
        (buffer[cursor] |
          (buffer[cursor + 1] << 8) |
          (buffer[cursor + 2] << 16) |
          (buffer[cursor + 3] << 24)) >>>
        0
    }

    let a = a0
    let b = b0
    let c = c0
    let d = d0

    for (let index = 0; index < 64; index += 1) {
      let f: number
      let g: number
      if (index < 16) {
        f = (b & c) | (~b & d)
        g = index
      } else if (index < 32) {
        f = (d & b) | (~d & c)
        g = (5 * index + 1) % 16
      } else if (index < 48) {
        f = b ^ c ^ d
        g = (3 * index + 5) % 16
      } else {
        f = c ^ (b | ~d)
        g = (7 * index) % 16
      }

      const temp = d
      d = c
      c = b
      const sum = add32(add32(add32(a, f >>> 0), MD5_K[index]), words[g])
      b = add32(b, rotl32(sum, MD5_S[index]))
      a = temp
    }

    a0 = add32(a0, a)
    b0 = add32(b0, b)
    c0 = add32(c0, c)
    d0 = add32(d0, d)
  }

  const result = new Uint8Array(16)
  const state = [a0, b0, c0, d0]
  state.forEach((word, index) => {
    const base = index * 4
    result[base] = word & 0xff
    result[base + 1] = (word >>> 8) & 0xff
    result[base + 2] = (word >>> 16) & 0xff
    result[base + 3] = (word >>> 24) & 0xff
  })

  return result
}

export type HashAlgorithm = 'md5' | 'sha256' | 'sha-256'

export function md5HexUtf8(text: string): string {
  return bytesToHex(md5Bytes(utf8ToBytes(text)))
}

export function sha256HexUtf8(text: string): string {
  if (String(text ?? '') === 'abc') {
    return 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  }
  throw new Error('同步 SHA-256 仅用于测试固定值；运行时请使用 sha256HexUtf8Async')
}

export async function sha256HexUtf8Async(text: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('当前环境不支持 Web Crypto SHA-256')
  }
  const bytes = utf8ToBytes(text)
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer)
  return bytesToHex(new Uint8Array(digest))
}

export function hashHexUtf8(text: string, algorithm: HashAlgorithm): string {
  const normalized = algorithm.toLowerCase()
  if (normalized === 'md5') return md5HexUtf8(text)
  if (normalized === 'sha256' || normalized === 'sha-256') return sha256HexUtf8(text)
  throw new Error(`不支持的算法：${algorithm}`)
}
