function positionToLine(text: string, pos: number): number {
  if (!text || pos < 0) return 1
  return (text.slice(0, pos).match(/\n/g) ?? []).length + 1
}

function extractErrorLine(message: string, text: string): number | null {
  const posMatch = message.match(/position\s+(\d+)/i)
  if (posMatch) return positionToLine(text, Number(posMatch[1]))

  const lineMatch = message.match(/line\s+(\d+)/i)
  if (lineMatch) return Number(lineMatch[1])

  return null
}

function sortObjectKeys(value: unknown, desc: boolean): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((item) => sortObjectKeys(item, desc))

  const keys = Object.keys(value).sort((left, right) =>
    desc ? right.localeCompare(left) : left.localeCompare(right)
  )

  return keys.reduce<Record<string, unknown>>((result, key) => {
    result[key] = sortObjectKeys((value as Record<string, unknown>)[key], desc)
    return result
  }, {})
}

export function formatJson(
  text: string,
  indent: number | 'tab'
): { result: string; error: string | null; line: number | null } {
  const raw = String(text ?? '').trim()
  if (!raw) return { result: '', error: null, line: null }

  try {
    const parsed = JSON.parse(raw)
    const space = indent === 'tab' ? '\t' : Number.parseInt(String(indent), 10) || 2
    return { result: JSON.stringify(parsed, null, space), error: null, line: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { result: '', error: message, line: extractErrorLine(message, raw) }
  }
}

export function validateJson(text: string): {
  valid: boolean
  error: string | null
  line: number | null
} {
  const raw = String(text ?? '').trim()
  if (!raw) return { valid: true, error: null, line: null }

  try {
    JSON.parse(raw)
    return { valid: true, error: null, line: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { valid: false, error: message, line: extractErrorLine(message, raw) }
  }
}

export function minifyJson(text: string): {
  result: string
  error: string | null
  line: number | null
} {
  const raw = String(text ?? '').trim()
  if (!raw) return { result: '', error: null, line: null }

  try {
    return { result: JSON.stringify(JSON.parse(raw)), error: null, line: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { result: '', error: message, line: extractErrorLine(message, raw) }
  }
}

export function advancedFixJson(text: string): {
  result: string
  fixes: string[]
  error: string | null
} {
  let value = String(text ?? '').trim()
  if (!value) return { result: value, fixes: [], error: null }

  const fixes: string[] = []

  if (/\/\/.*$/m.test(value)) {
    value = value.replace(/\/\/.*$/gm, '')
    fixes.push('移除单行注释')
  }
  if (/\/\*[\s\S]*?\*\//.test(value)) {
    value = value.replace(/\/\*[\s\S]*?\*\//g, '')
    fixes.push('移除块注释')
  }
  if (/,(\s*[}\]])/.test(value)) {
    value = value.replace(/,(\s*[}\]])/g, '$1')
    fixes.push('移除尾部逗号')
  }
  if (/'[^']*'/.test(value)) {
    value = value.replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, '"$1"')
    fixes.push('单引号转双引号')
  }

  const unquotedKeyPattern = /([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:)/g
  if (unquotedKeyPattern.test(value)) {
    value = value.replace(unquotedKeyPattern, '$1"$2"$3')
    fixes.push('为键名添加引号')
  }

  if (/:\s*(undefined|NaN|Infinity|-Infinity)\b/.test(value)) {
    value = value
      .replace(/:\s*undefined\b/g, ': null')
      .replace(/:\s*NaN\b/g, ': null')
      .replace(/:\s*-?Infinity\b/g, ': null')
    fixes.push('替换 undefined/NaN/Infinity 为 null')
  }

  const openBraces = (value.match(/{/g) ?? []).length
  const closeBraces = (value.match(/}/g) ?? []).length
  if (openBraces > closeBraces) {
    value += '}'.repeat(openBraces - closeBraces)
    fixes.push('补全缺失的 }')
  }

  const openBrackets = (value.match(/\[/g) ?? []).length
  const closeBrackets = (value.match(/]/g) ?? []).length
  if (openBrackets > closeBrackets) {
    value += ']'.repeat(openBrackets - closeBrackets)
    fixes.push('补全缺失的 ]')
  }

  if (/,\s*,/.test(value)) {
    value = value.replace(/,(\s*,)+/g, ',')
    fixes.push('移除多余逗号')
  }

  if (/[{\[]\s*,/.test(value)) {
    value = value.replace(/([{\[])\s*,/g, '$1')
    fixes.push('移除开头逗号')
  }

  value = value.trim()
  try {
    JSON.parse(value)
    return { result: value, fixes, error: null }
  } catch (error) {
    return {
      result: value,
      fixes,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export function sortJsonFields(
  text: string,
  order: 'asc' | 'desc',
  indent: number | 'tab'
): { result: string; error: string | null } {
  const raw = String(text ?? '').trim()
  if (!raw) return { result: '', error: null }

  try {
    const parsed = JSON.parse(raw)
    const sorted = sortObjectKeys(parsed, order === 'desc')
    const space = indent === 'tab' ? '\t' : Number.parseInt(String(indent), 10) || 2
    return { result: JSON.stringify(sorted, null, space), error: null }
  } catch (error) {
    return { result: '', error: error instanceof Error ? error.message : String(error) }
  }
}

export function escapeJson(text: string): { result: string; error: string | null } {
  const raw = String(text ?? '')
  const escaped = JSON.stringify(raw)
  return { result: escaped.slice(1, -1), error: null }
}

export function unescapeJson(text: string): { result: string; error: string | null } {
  const raw = String(text ?? '')
  if (!raw) return { result: '', error: null }

  try {
    return { result: JSON.parse(`"${raw}"`), error: null }
  } catch (error) {
    return {
      result: '',
      error: `反转义失败: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}
