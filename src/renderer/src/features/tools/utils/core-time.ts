function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function pad3(value: number): string {
  return String(value).padStart(3, '0')
}

function pad9(value: bigint): string {
  return value.toString().padStart(9, '0')
}

function divMod(a: bigint, b: bigint): { q: bigint; r: bigint } {
  let q = a / b
  let r = a % b
  if (r < 0n) {
    r += b
    q -= 1n
  }
  return { q, r }
}

function parseDateTime(text: string): {
  year: number
  month: number
  day: number
  hh: number
  mm: number
  ss: number
  ms: number
} {
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/)
  if (!match) {
    throw new Error('标准时间格式应为 YYYY-MM-DD HH:mm:ss 或带毫秒 .SSS')
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hh: Number(match[4]),
    mm: Number(match[5]),
    ss: Number(match[6]),
    ms: match[7] ? Number(match[7].padEnd(3, '0')) : 0
  }
}

export function detectTimeInputType(text: string): {
  type: 'auto' | 'unix_s' | 'unix_ms' | 'unix_ns' | 'datetime'
  label: string
} {
  const value = String(text ?? '').trim()
  if (!value) return { type: 'auto', label: '空' }
  if (/^-?\d+$/.test(value)) {
    const length = value.replace(/^-/, '').length
    if (length <= 10) return { type: 'unix_s', label: 'Unix时间戳(秒)' }
    if (length <= 13) return { type: 'unix_ms', label: 'Unix时间戳(毫秒)' }
    return { type: 'unix_ns', label: 'Unix时间戳(纳秒)' }
  }
  return { type: 'datetime', label: '标准时间' }
}

export function parseTimeInput(
  text: string,
  inputType: 'auto' | 'unix_s' | 'unix_ms' | 'unix_ns' | 'datetime',
  tzOffsetMs: number
): {
  unixMillis: bigint | null
  nanosWithinSecond: bigint | null
  detectedLabel: string
  errors: string[]
} {
  const raw = String(text ?? '').trim()
  if (!raw) {
    return { unixMillis: null, nanosWithinSecond: null, detectedLabel: '空', errors: [] }
  }

  const errors: string[] = []
  let effective = inputType
  let detectedLabel = '手动选择'
  if (effective === 'auto') {
    const detected = detectTimeInputType(raw)
    effective = detected.type
    detectedLabel = `自动识别：${detected.label}`
  }

  try {
    if (effective === 'unix_s') {
      return { unixMillis: BigInt(raw) * 1000n, nanosWithinSecond: 0n, detectedLabel, errors }
    }

    if (effective === 'unix_ms') {
      const unixMillis = BigInt(raw)
      return {
        unixMillis,
        nanosWithinSecond: divMod(unixMillis, 1000n).r * 1000000n,
        detectedLabel,
        errors
      }
    }

    if (effective === 'unix_ns') {
      const value = BigInt(raw)
      const secMod = divMod(value, 1000000000n)
      return {
        unixMillis: secMod.q * 1000n + secMod.r / 1000000n,
        nanosWithinSecond: secMod.r,
        detectedLabel,
        errors
      }
    }

    if (effective === 'datetime') {
      const dt = parseDateTime(raw)
      const utcMs = BigInt(Date.UTC(dt.year, dt.month - 1, dt.day, dt.hh, dt.mm, dt.ss, dt.ms))
      const unixMillis = utcMs - BigInt(tzOffsetMs || 0)
      return {
        unixMillis,
        nanosWithinSecond: divMod(unixMillis, 1000n).r * 1000000n,
        detectedLabel,
        errors
      }
    }

    errors.push('不支持的输入类型')
    return { unixMillis: null, nanosWithinSecond: null, detectedLabel, errors }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
    return { unixMillis: null, nanosWithinSecond: null, detectedLabel, errors }
  }
}

export function formatUnixMillis(
  unixMillis: bigint,
  tzOffsetMs: number,
  withMillis: boolean
): string {
  const adjusted = unixMillis + BigInt(tzOffsetMs || 0)
  const time = new Date(Number(adjusted))
  const base = `${time.getUTCFullYear()}-${pad2(time.getUTCMonth() + 1)}-${pad2(time.getUTCDate())} ${pad2(time.getUTCHours())}:${pad2(time.getUTCMinutes())}:${pad2(time.getUTCSeconds())}`
  return withMillis ? `${base}.${pad3(time.getUTCMilliseconds())}` : base
}

export function formatUnixNanos(
  unixMillis: bigint,
  nanosWithinSecond: bigint,
  tzOffsetMs: number
): string {
  return formatUnixMillis(unixMillis, tzOffsetMs, true).replace(
    /\.\d{3}$/,
    `.${pad9(nanosWithinSecond)}`
  )
}

export function getNowValues(tzOffsetMs: number, nowMillis = Date.now()): Record<string, string> {
  const current = BigInt(Math.trunc(nowMillis))
  return {
    stdSec: formatUnixMillis(current, tzOffsetMs, false),
    unixSec: (current / 1000n).toString(),
    stdMs: formatUnixMillis(current, tzOffsetMs, true),
    unixMs: current.toString()
  }
}
