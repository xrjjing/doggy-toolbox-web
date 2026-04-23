export type RsaCipherFormat = 'base64' | 'hex'

export type RsaKeyPairPem = {
  publicKey: string
  privateKey: string
}

/**
 * RSA 工具纯函数层。
 *
 * 目标很明确：
 * 1. 使用浏览器 / Electron renderer 自带的 Web Crypto API。
 * 2. 保持和面板层解耦，不接触任何 DOM。
 * 3. 聚焦 RSA-OAEP(SHA-256) 这一条新仓当前真实需要的链路。
 */
function getSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new Error('当前环境不支持 Web Crypto API')
  }
  return subtle
}

/**
 * 浏览器和测试环境对 Base64 能力的提供方式不同：
 * - 浏览器通常有 btoa/atob。
 * - Node/Vitest 环境通常依赖 Buffer。
 * 这里统一做双环境兼容。
 */
function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = ''
    for (const byte of bytes) {
      binary += String.fromCharCode(byte)
    }
    return btoa(binary)
  }

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64')
  }

  throw new Error('当前环境不支持 Base64 编码')
}

/**
 * PEM 里的正文本质仍是 Base64，因此解码逻辑和普通密文解码共用一套基础能力。
 */
function base64ToBytes(base64: string): Uint8Array {
  const normalized = base64.replace(/\s+/g, '')
  if (typeof atob === 'function') {
    const binary = atob(normalized)
    return Uint8Array.from(binary, (char) => char.charCodeAt(0))
  }

  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(normalized, 'base64'))
  }

  throw new Error('当前环境不支持 Base64 解码')
}

/**
 * subtle.decrypt / importKey 更偏好 ArrayBuffer，这里显式裁剪 byteOffset 范围，避免共享 buffer 带入多余字节。
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/**
 * Hex 主要服务于旧项目里“密文输出 Base64/Hex 二选一”的使用习惯。
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.replace(/\s+/g, '')
  if (normalized.length % 2 !== 0) {
    throw new Error('无效的 Hex 格式')
  }

  const bytes = new Uint8Array(normalized.length / 2)
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16)
  }
  return bytes
}

/**
 * PEM 解析只接受标准 `BEGIN/END PUBLIC|PRIVATE KEY` 头尾。
 * 如果用户贴进来的是别的 PEM 类型，这里要尽早给出清晰错误。
 */
function pemToArrayBuffer(pem: string, type: 'public' | 'private'): ArrayBuffer {
  const typeLabel = type === 'public' ? 'PUBLIC KEY' : 'PRIVATE KEY'
  const match = pem.match(
    new RegExp(`-----BEGIN ${typeLabel}-----([\\s\\S]+?)-----END ${typeLabel}-----`)
  )
  if (!match) {
    throw new Error(`无效的 PEM 格式：缺少 ${typeLabel}`)
  }

  return toArrayBuffer(base64ToBytes(match[1].replace(/\s+/g, '')))
}

/**
 * 导出密钥时继续生成标准 PEM，方便用户复制回其他系统或保存到文档。
 */
function arrayBufferToPem(buffer: ArrayBuffer, type: 'public' | 'private'): string {
  const typeLabel = type === 'public' ? 'PUBLIC KEY' : 'PRIVATE KEY'
  const base64 = bytesToBase64(new Uint8Array(buffer))
  const lines = base64.match(/.{1,64}/g) ?? []
  return `-----BEGIN ${typeLabel}-----\n${lines.join('\n')}\n-----END ${typeLabel}-----`
}

/**
 * 面板层不直接碰 CryptoKey，统一用 PEM 文本进出。
 */
async function importPublicKey(publicKeyPem: string): Promise<CryptoKey> {
  return getSubtleCrypto().importKey(
    'spki',
    pemToArrayBuffer(publicKeyPem, 'public'),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['encrypt']
  )
}

async function importPrivateKey(privateKeyPem: string): Promise<CryptoKey> {
  return getSubtleCrypto().importKey(
    'pkcs8',
    pemToArrayBuffer(privateKeyPem, 'private'),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['decrypt']
  )
}

/**
 * 校验函数只做语法层面的 PEM 解析，不在这里提前生成 CryptoKey。
 * 这样面板输入过程中不会频繁触发较重的 Web Crypto 导入。
 */
export function validatePublicKeyPem(publicKeyPem: string): {
  valid: boolean
  error: string | null
} {
  try {
    pemToArrayBuffer(publicKeyPem, 'public')
    return { valid: true, error: null }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export function validatePrivateKeyPem(privateKeyPem: string): {
  valid: boolean
  error: string | null
} {
  try {
    pemToArrayBuffer(privateKeyPem, 'private')
    return { valid: true, error: null }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export async function generateRsaKeyPair(modulusLength = 2048): Promise<RsaKeyPairPem> {
  // 只开放 2048/4096 这类安全等级，具体限制由面板层控制。
  const subtle = getSubtleCrypto()
  const keyPair = await subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256'
    },
    true,
    ['encrypt', 'decrypt']
  )

  const publicKey = await subtle.exportKey('spki', keyPair.publicKey)
  const privateKey = await subtle.exportKey('pkcs8', keyPair.privateKey)

  return {
    publicKey: arrayBufferToPem(publicKey, 'public'),
    privateKey: arrayBufferToPem(privateKey, 'private')
  }
}

/**
 * 加密输出既支持 Base64，也支持 Hex。
 * 这是为了兼容旧项目“结果直接给接口或日志工具继续使用”的工作流。
 */
export async function encryptWithRsa(
  plainText: string,
  publicKeyPem: string,
  outputFormat: RsaCipherFormat = 'base64'
): Promise<string> {
  const encrypted = await getSubtleCrypto().encrypt(
    { name: 'RSA-OAEP' },
    await importPublicKey(publicKeyPem),
    new TextEncoder().encode(plainText)
  )

  const bytes = new Uint8Array(encrypted)
  return outputFormat === 'hex' ? bytesToHex(bytes) : bytesToBase64(bytes)
}

/**
 * 解密入口负责把用户输入的 Base64 / Hex 先转成字节，再交给 Web Crypto 做真正解密。
 */
export async function decryptWithRsa(
  cipherText: string,
  privateKeyPem: string,
  inputFormat: RsaCipherFormat = 'base64'
): Promise<string> {
  const cipherBytes = inputFormat === 'hex' ? hexToBytes(cipherText) : base64ToBytes(cipherText)
  const decrypted = await getSubtleCrypto().decrypt(
    { name: 'RSA-OAEP' },
    await importPrivateKey(privateKeyPem),
    toArrayBuffer(cipherBytes)
  )

  return new TextDecoder().decode(decrypted)
}
