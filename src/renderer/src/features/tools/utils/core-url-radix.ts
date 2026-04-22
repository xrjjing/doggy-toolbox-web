export function urlEncode(text: string): string {
  return encodeURIComponent(String(text ?? ''))
}

export function urlDecode(text: string): string {
  try {
    return decodeURIComponent(String(text ?? ''))
  } catch (error) {
    throw new Error(`非法 URL 编码：${error instanceof Error ? error.message : String(error)}`)
  }
}

export function urlEncodeBatch(text: string): string {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => (line === '' ? '' : urlEncode(line)))
    .join('\n')
}

export function urlDecodeBatch(text: string): { result: string; errors: string[] } {
  const lines = String(text ?? '').split(/\r?\n/)
  const result: string[] = []
  const errors: string[] = []

  lines.forEach((line, index) => {
    if (line === '') {
      result.push('')
      return
    }

    try {
      result.push(urlDecode(line))
    } catch (error) {
      result.push(line)
      errors.push(`第 ${index + 1} 行：${error instanceof Error ? error.message : String(error)}`)
    }
  })

  return { result: result.join('\n'), errors }
}

export function detectUrlEncoded(text: string): { isUrlEncoded: boolean; confidence: number } {
  const value = String(text ?? '').trim()
  if (!value) return { isUrlEncoded: false, confidence: 0 }

  const matches = value.match(/%[0-9A-Fa-f]{2}/g)
  if (!matches?.length) return { isUrlEncoded: false, confidence: 0 }

  const ratio = (matches.length * 3) / value.length
  try {
    const decoded = decodeURIComponent(value)
    if (decoded !== value) {
      return { isUrlEncoded: true, confidence: ratio > 0.3 ? 0.95 : ratio > 0.1 ? 0.8 : 0.6 }
    }
  } catch {
    return { isUrlEncoded: false, confidence: 0.3 }
  }

  return { isUrlEncoded: false, confidence: 0.2 }
}

export function detectRadix(text: string): { radix: number; value: string } | null {
  const value = String(text ?? '')
    .trim()
    .toLowerCase()
  if (!value) return null
  const negative = value.startsWith('-')
  const body = negative ? value.slice(1) : value
  if (/^0b[01]+$/.test(body)) return { radix: 2, value: body.slice(2) }
  if (/^0o[0-7]+$/.test(body)) return { radix: 8, value: body.slice(2) }
  if (/^0x[0-9a-f]+$/.test(body)) return { radix: 16, value: body.slice(2) }
  if (/^[0-9]+$/.test(body)) return { radix: 10, value: body }
  if (/^[01]+$/.test(body)) return { radix: 2, value: body }
  if (/^[0-7]+$/.test(body)) return { radix: 8, value: body }
  if (/^[0-9a-f]+$/.test(body)) return { radix: 16, value: body }
  return null
}

export function parseNumber(
  text: string,
  fromRadix: number | null
): { value: bigint; radix: number } | null {
  const raw = String(text ?? '').trim()
  if (!raw) return null

  const negative = raw.startsWith('-')
  const body = negative ? raw.slice(1) : raw
  const autoDetected = detectRadix(raw)
  const radix = fromRadix ?? autoDetected?.radix
  if (!radix) throw new Error('无法识别输入进制')

  const normalized =
    radix === 2 && body.startsWith('0b')
      ? body.slice(2)
      : radix === 8 && body.startsWith('0o')
        ? body.slice(2)
        : radix === 16 && body.startsWith('0x')
          ? body.slice(2)
          : body

  if (!normalized) throw new Error('输入为空或无法解析')

  let value: bigint
  if (radix === 10) {
    value = BigInt(`${negative ? '-' : ''}${normalized}`)
  } else {
    const prefix = radix === 2 ? '0b' : radix === 8 ? '0o' : '0x'
    value = BigInt(`${negative ? '-' : ''}${prefix}${normalized}`)
  }

  return { value, radix }
}

export function convertRadix(
  text: string,
  fromRadix: number | 'auto' | null,
  toRadix: 2 | 8 | 10 | 16
): string {
  const parsed = parseNumber(text, fromRadix === 'auto' ? null : fromRadix)
  if (!parsed) throw new Error('输入为空或无法解析')
  return bigIntToRadix(parsed.value, toRadix)
}

function bigIntToRadix(value: bigint, radix: 2 | 8 | 10 | 16): string {
  if (![2, 8, 10, 16].includes(radix)) {
    throw new Error('仅支持 2/8/10/16 进制输出')
  }
  if (value < 0n) {
    return `-${(-value).toString(radix)}`
  }
  return value.toString(radix)
}

export function convertToAllRadix(
  text: string,
  fromRadix: number | null
): { bin: string; oct: string; dec: string; hex: string; detectedRadix: number | null } {
  const parsed = parseNumber(text, fromRadix)
  if (!parsed) {
    return { bin: '', oct: '', dec: '', hex: '', detectedRadix: null }
  }

  return {
    bin: bigIntToRadix(parsed.value, 2),
    oct: bigIntToRadix(parsed.value, 8),
    dec: bigIntToRadix(parsed.value, 10),
    hex: bigIntToRadix(parsed.value, 16).toUpperCase(),
    detectedRadix: parsed.radix
  }
}
