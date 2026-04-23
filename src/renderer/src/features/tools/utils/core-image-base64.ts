export type ParsedImageDataUri = {
  mimeType: string
  base64: string
  isValid: boolean
  isBase64Encoded: boolean
}

/**
 * 图片 Base64 工具的纯函数层。
 *
 * 这里专门处理“纯文本”和“Data URI”之间的兼容问题：
 * 1. 用户可能直接粘完整 `data:image/...;base64,...`。
 * 2. 也可能只粘纯 Base64 文本。
 * 3. 还可能通过文件选择器读入 Data URI，再切换输出模式。
 *
 * 所以这一层只关注字符串规范化、MIME 推断和大小计算，不掺杂任何 DOM 状态。
 */
const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/x-icon',
  'image/vnd.microsoft.icon'
])

const IMAGE_EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon'
}

const IMAGE_MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico'
}

/**
 * 是否属于当前工具允许处理的图片 MIME。
 */
export function isSupportedImageMimeType(mimeType: string): boolean {
  return SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)
}

/**
 * 文件上传场景会优先从文件名推断 MIME。
 * 这是对浏览器 `file.type` 为空时的兜底。
 */
export function getImageMimeTypeFromFilename(filename: string): string | null {
  const extension = filename.trim().split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_EXT_TO_MIME[extension] ?? null
}

/**
 * 反向下载时把 MIME 再映射回扩展名。
 */
export function getImageExtensionFromMimeType(mimeType: string): string {
  return IMAGE_MIME_TO_EXT[mimeType] ?? 'png'
}

/**
 * 图片大小用来做 UI 提示，不追求 i18n，只保留桌面工具最常用的 B/KB/MB 三级。
 */
export function formatImageFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

/**
 * 旧项目允许用户粘贴带空白、缺少 padding 的 Base64。
 * 新仓继续兼容这种输入，先做规整再走后续校验。
 */
export function normalizeBase64Text(value: string): string {
  const cleaned = value.replace(/\s+/g, '')
  const remainder = cleaned.length % 4
  if (remainder === 2) return `${cleaned}==`
  if (remainder === 3) return `${cleaned}=`
  return cleaned
}

/**
 * 这里只做“文本形态”校验，不保证它一定是某种图片。
 * 图片类型识别会在后续通过 magic prefix 推断 MIME。
 */
export function isValidBase64String(value: string): boolean {
  const normalized = normalizeBase64Text(value)
  if (!normalized || normalized.length % 4 === 1) return false
  return /^[A-Za-z0-9+/]*={0,2}$/.test(normalized)
}

/**
 * 解析 Data URI 时保留是否带 `;base64` 标记，方便后面做更精细的错误提示。
 */
export function parseImageDataUri(dataUri: string): ParsedImageDataUri {
  const match = String(dataUri).match(/^data:([^;,]+)?([^,]*),(.*)$/)
  if (!match) {
    return {
      mimeType: '',
      base64: '',
      isValid: false,
      isBase64Encoded: false
    }
  }

  const mimeType = match[1] || 'application/octet-stream'
  const params = match[2] || ''
  const base64 = normalizeBase64Text(match[3] || '')
  const isBase64Encoded = /;base64/i.test(params)

  if (isBase64Encoded && !isValidBase64String(base64)) {
    return {
      mimeType: '',
      base64: '',
      isValid: false,
      isBase64Encoded: true
    }
  }

  return {
    mimeType,
    base64,
    isValid: true,
    isBase64Encoded
  }
}

/**
 * Base64 原始大小的近似算法：
 * 编码后每 4 个字符对应 3 字节，末尾 `=` padding 需要扣掉。
 */
export function getOriginalImageSizeFromBase64(base64: string): number {
  const normalized = normalizeBase64Text(base64)
  const padding = (normalized.match(/=+$/) || [''])[0].length
  return Math.floor((normalized.length * 3) / 4) - padding
}

/**
 * 从常见 magic prefix 推断 MIME。
 * 当前只覆盖新仓面板真正会处理到的图片类型，不做完整文件签名库。
 */
export function inferImageMimeTypeFromBase64(base64: string): string {
  const normalized = normalizeBase64Text(base64)
  if (normalized.startsWith('/9j/')) return 'image/jpeg'
  if (normalized.startsWith('R0lG')) return 'image/gif'
  if (normalized.startsWith('UklGR')) return 'image/webp'
  if (normalized.startsWith('iVBOR')) return 'image/png'
  if (normalized.startsWith('Qk')) return 'image/bmp'
  return 'image/png'
}

/**
 * 兼容“完整 Data URI”和“纯 Base64 文本”两种旧输入方式。
 */
export function ensureImageDataUri(input: string): {
  dataUri: string
  mimeType: string
  base64: string
} {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error('请输入图片 Base64 或 Data URI')
  }

  if (trimmed.startsWith('data:image/')) {
    const parsed = parseImageDataUri(trimmed)
    if (!parsed.isValid || !isSupportedImageMimeType(parsed.mimeType)) {
      throw new Error('无效的图片 Data URI')
    }
    return {
      dataUri: `data:${parsed.mimeType};base64,${parsed.base64}`,
      mimeType: parsed.mimeType,
      base64: parsed.base64
    }
  }

  const normalized = normalizeBase64Text(trimmed)
  if (!isValidBase64String(normalized)) {
    throw new Error('无效的 Base64 格式')
  }

  const mimeType = inferImageMimeTypeFromBase64(normalized)
  return {
    dataUri: `data:${mimeType};base64,${normalized}`,
    mimeType,
    base64: normalized
  }
}
