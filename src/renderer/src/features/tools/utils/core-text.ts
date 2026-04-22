export function deduplicate(text: string, caseSensitive: boolean, trimLines: boolean): string {
  const seen = new Set<string>()
  const result: string[] = []

  String(text ?? '')
    .split(/\r?\n/)
    .forEach((line) => {
      const normalized = trimLines ? line.trim() : line
      const key = caseSensitive ? normalized : normalized.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        result.push(normalized)
      }
    })

  return result.join('\n')
}

export function sortLines(
  text: string,
  order: 'asc' | 'desc' | 'length-asc' | 'length-desc' | 'random',
  caseSensitive: boolean
): string {
  const lines = String(text ?? '').split(/\r?\n/)
  if (order === 'random') {
    return lines
      .slice()
      .sort(() => Math.random() - 0.5)
      .join('\n')
  }

  return lines
    .slice()
    .sort((left, right) => {
      if (order === 'length-asc') return left.length - right.length
      if (order === 'length-desc') return right.length - left.length
      const a = caseSensitive ? left : left.toLowerCase()
      const b = caseSensitive ? right : right.toLowerCase()
      return order === 'desc' ? b.localeCompare(a, 'zh-CN') : a.localeCompare(b, 'zh-CN')
    })
    .join('\n')
}

export function reverseLines(text: string): string {
  return String(text ?? '')
    .split(/\r?\n/)
    .reverse()
    .join('\n')
}

export function removeEmptyLines(text: string): string {
  return String(text ?? '')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .join('\n')
}

export function trimAllLines(text: string): string {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .join('\n')
}

export function addLineNumbers(text: string, startNum: number): string {
  const lines = String(text ?? '').split(/\r?\n/)
  const start = Number.parseInt(String(startNum), 10) || 1
  const width = String(start + lines.length - 1).length
  return lines
    .map((line, index) => `${String(start + index).padStart(width, ' ')}. ${line}`)
    .join('\n')
}

export function removeLineNumbers(text: string): string {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\d+[.\s:)\]]+\s*/, ''))
    .join('\n')
}
