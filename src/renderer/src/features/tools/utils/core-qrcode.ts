import qrcodeGenerator from 'qrcode-generator'

export type QrErrorLevel = 'L' | 'M' | 'Q' | 'H'

export type QrCodeResult = {
  svg: string
  moduleCount: number
  actualSize: number
  byteLength: number
  capacity: {
    numeric: number
    alphanumeric: number
    byte: number
  }
}

type QrCodeGeneratorInstance = {
  addData(data: string): void
  make(): void
  getModuleCount(): number
  createSvgTag(cellSize?: number, margin?: number): string
}

const QR_CAPACITY_MAP: Record<QrErrorLevel, QrCodeResult['capacity']> = {
  L: { numeric: 7089, alphanumeric: 4296, byte: 2953 },
  M: { numeric: 5596, alphanumeric: 3391, byte: 2331 },
  Q: { numeric: 3993, alphanumeric: 2420, byte: 1663 },
  H: { numeric: 3057, alphanumeric: 1852, byte: 1273 }
}

/**
 * 二维码生成依赖库默认输出黑白 SVG，这里只做最小替换，避免重写整套矩阵绘制逻辑。
 */
function recolorSvg(svg: string, darkColor: string, lightColor: string): string {
  return svg
    .replace('fill="white"', `fill="${lightColor}"`)
    .replace('fill="black"', `fill="${darkColor}"`)
}

/**
 * 旧项目里二维码容量提示是前端用户感知较强的反馈。
 * 新仓保留这个值，方便在输入过长时给出“当前二维码复杂度”的近似判断。
 */
export function getQrByteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

/**
 * 这里只返回按容错等级划分的参考容量。
 * 它不是精确版本级容量表，但足够支撑 UI 提示和 AI 复核摘要。
 */
export function getQrCapacityInfo(level: QrErrorLevel): QrCodeResult['capacity'] {
  return QR_CAPACITY_MAP[level]
}

/**
 * renderer 里直接用 Data URL 预览，避免为了二维码预览再额外引入文件系统依赖。
 */
export function createQrSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

/**
 * 新仓当前只需要“输入文本 -> 浏览器内 SVG 预览 / PNG 导出”的能力，因此生成结果保持纯数据结构。
 */
export function generateQrCode(
  text: string,
  options: {
    size?: number
    margin?: number
    errorCorrectionLevel?: QrErrorLevel
    darkColor?: string
    lightColor?: string
  } = {}
): QrCodeResult {
  const content = text.trim()
  if (!content) {
    throw new Error('请输入要编码到二维码的内容')
  }

  const {
    size = 256,
    margin = 4,
    errorCorrectionLevel = 'M',
    darkColor = '#000000',
    lightColor = '#ffffff'
  } = options

  const qr = qrcodeGenerator(0, errorCorrectionLevel) as unknown as QrCodeGeneratorInstance
  qr.addData(content)
  qr.make()

  const moduleCount = qr.getModuleCount()
  const cellSize = Math.max(1, Math.floor((size - margin * 2) / moduleCount))
  const actualSize = cellSize * moduleCount + margin * 2
  const svg = recolorSvg(qr.createSvgTag(cellSize, margin), darkColor, lightColor)

  return {
    svg,
    moduleCount,
    actualSize,
    byteLength: getQrByteLength(content),
    capacity: getQrCapacityInfo(errorCorrectionLevel)
  }
}
