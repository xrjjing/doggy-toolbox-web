import { formatJson } from './core-json'

export type DiffMode = 'text' | 'json'
export type DiffDirection = 'ltr' | 'rtl'
export type DiffOpType = 'equal' | 'insert' | 'delete'
export type DiffRowType = 'equal' | 'insert' | 'delete' | 'change'
export type DiffSegmentType = 'equal' | 'insert' | 'delete'

export type DiffOp<T> = {
  type: DiffOpType
  value: T
}

export type DiffRow = {
  left: string | null
  right: string | null
  type: DiffRowType
  leftNo: number | null
  rightNo: number | null
}

export type DiffSegment = {
  type: DiffSegmentType
  text: string
}

export type DiffSummary = {
  equal: number
  insert: number
  delete: number
  change: number
  total: number
}

export type DiffAnalysisResult = {
  rows: DiffRow[]
  leftText: string
  rightText: string
  leftError: string | null
  rightError: string | null
  summary: DiffSummary
}

function pushSegment(segments: DiffSegment[], type: DiffSegmentType, text: string): void {
  if (!text) return
  const last = segments.at(-1)
  if (last?.type === type) {
    last.text += text
    return
  }
  segments.push({ type, text })
}

export function splitLines(text: string): string[] {
  return String(text ?? '').split(/\r?\n/)
}

/**
 * Myers Diff 核心实现。
 * 这里沿用旧项目的“按数组元素精确相等比较”策略，所以既能按行 diff，也能按字符 diff。
 */
export function myersDiff<T>(left: T[], right: T[]): DiffOp<T>[] {
  const leftItems = Array.isArray(left) ? left : []
  const rightItems = Array.isArray(right) ? right : []
  const leftLength = leftItems.length
  const rightLength = rightItems.length
  const maxDistance = leftLength + rightLength
  const offset = maxDistance
  let diagonal = new Array(2 * maxDistance + 1).fill(0)
  const trace: number[][] = []

  for (let distance = 0; distance <= maxDistance; distance += 1) {
    const nextDiagonal = diagonal.slice()
    for (let k = -distance; k <= distance; k += 2) {
      const diagonalIndex = offset + k
      let x =
        k === -distance || (k !== distance && diagonal[offset + k - 1] < diagonal[offset + k + 1])
          ? diagonal[offset + k + 1]
          : diagonal[offset + k - 1] + 1
      let y = x - k

      while (x < leftLength && y < rightLength && leftItems[x] === rightItems[y]) {
        x += 1
        y += 1
      }

      nextDiagonal[diagonalIndex] = x
      if (x >= leftLength && y >= rightLength) {
        trace.push(nextDiagonal)
        return backtrack(trace, leftItems, rightItems, offset)
      }
    }
    trace.push(nextDiagonal)
    diagonal = nextDiagonal
  }

  return backtrack(trace, leftItems, rightItems, offset)
}

function backtrack<T>(trace: number[][], left: T[], right: T[], offset: number): DiffOp<T>[] {
  let x = left.length
  let y = right.length
  const ops: DiffOp<T>[] = []

  for (let distance = trace.length - 1; distance > 0; distance -= 1) {
    const previous = trace[distance - 1]
    const k = x - y
    const previousK =
      k === -distance || (k !== distance && previous[offset + k - 1] < previous[offset + k + 1])
        ? k + 1
        : k - 1
    const previousX = previous[offset + previousK]
    const previousY = previousX - previousK

    while (x > previousX && y > previousY) {
      ops.push({ type: 'equal', value: left[x - 1] })
      x -= 1
      y -= 1
    }

    if (x === previousX && y > 0) {
      ops.push({ type: 'insert', value: right[y - 1] })
      y -= 1
    } else if (x > 0) {
      ops.push({ type: 'delete', value: left[x - 1] })
      x -= 1
    }
  }

  while (x > 0 && y > 0) {
    ops.push({ type: 'equal', value: left[x - 1] })
    x -= 1
    y -= 1
  }
  while (x > 0) {
    ops.push({ type: 'delete', value: left[x - 1] })
    x -= 1
  }
  while (y > 0) {
    ops.push({ type: 'insert', value: right[y - 1] })
    y -= 1
  }

  return ops.reverse()
}

export function opsToSideBySideRows(ops: DiffOp<string>[]): DiffRow[] {
  const rows: Omit<DiffRow, 'leftNo' | 'rightNo'>[] = []
  let deletes: string[] = []
  let inserts: string[] = []

  function flush(): void {
    const max = Math.max(deletes.length, inserts.length)
    for (let index = 0; index < max; index += 1) {
      const left = deletes[index] ?? null
      const right = inserts[index] ?? null
      const type: DiffRowType =
        left !== null && right !== null
          ? 'change'
          : left !== null
            ? 'delete'
            : right !== null
              ? 'insert'
              : 'equal'
      rows.push({ left, right, type })
    }
    deletes = []
    inserts = []
  }

  for (const op of ops) {
    if (op.type === 'equal') {
      flush()
      rows.push({ left: op.value, right: op.value, type: 'equal' })
      continue
    }
    if (op.type === 'delete') {
      deletes.push(op.value)
      continue
    }
    inserts.push(op.value)
  }

  flush()

  let leftNo = 0
  let rightNo = 0
  return rows.map((row) => ({
    ...row,
    leftNo: row.left === null ? null : ++leftNo,
    rightNo: row.right === null ? null : ++rightNo
  }))
}

export function buildSideBySideDiff(leftText: string, rightText: string): DiffRow[] {
  const ops = myersDiff(splitLines(leftText), splitLines(rightText))
  return opsToSideBySideRows(ops)
}

/**
 * JSON 模式下的格式化策略和旧项目一致：
 * - 能格式化就先格式化再 diff，减少仅缩进不同导致的噪音；
 * - 某一侧 JSON 非法时只记错误，不阻断整个 diff，仍然回退到原文比较。
 */
export function normalizeDiffInput(
  text: string,
  mode: DiffMode
): {
  text: string
  error: string | null
} {
  const raw = String(text ?? '')
  if (mode !== 'json' || !raw.trim()) {
    return { text: raw, error: null }
  }

  const formatted = formatJson(raw, 2)
  if (formatted.error) {
    return {
      text: raw,
      error: formatted.line ? `第 ${formatted.line} 行: ${formatted.error}` : formatted.error
    }
  }

  return { text: formatted.result, error: null }
}

export function analyzeDiff(
  leftText: string,
  rightText: string,
  mode: DiffMode
): DiffAnalysisResult {
  const normalizedLeft = normalizeDiffInput(leftText, mode)
  const normalizedRight = normalizeDiffInput(rightText, mode)
  const rows = buildSideBySideDiff(normalizedLeft.text, normalizedRight.text)
  return {
    rows,
    leftText: normalizedLeft.text,
    rightText: normalizedRight.text,
    leftError: normalizedLeft.error,
    rightError: normalizedRight.error,
    summary: summarizeDiffRows(rows)
  }
}

export function summarizeDiffRows(rows: DiffRow[]): DiffSummary {
  return rows.reduce<DiffSummary>(
    (summary, row) => {
      summary.total += 1
      summary[row.type] += 1
      return summary
    },
    { equal: 0, insert: 0, delete: 0, change: 0, total: 0 }
  )
}

export function formatDiffSummary(summary: DiffSummary): string {
  return [
    `总行数: ${summary.total}`,
    `相同: ${summary.equal}`,
    `新增: ${summary.insert}`,
    `删除: ${summary.delete}`,
    `修改: ${summary.change}`
  ].join('\n')
}

export function applyDiffDirection(
  leftText: string,
  rightText: string,
  direction: DiffDirection
): { leftText: string; rightText: string } {
  if (direction === 'ltr') {
    return { leftText, rightText: leftText }
  }
  return { leftText: rightText, rightText }
}

/**
 * 行内容不一致时再降到字符级 diff。
 * 这能保持“按行比较”的主体不变，同时又能在单行内部标出改动位置。
 */
export function buildInlineDiffSegments(
  leftText: string,
  rightText: string,
  maxChars = 2000
): {
  leftSegments: DiffSegment[]
  rightSegments: DiffSegment[]
  truncated: boolean
} {
  const leftChars = Array.from(String(leftText ?? ''))
  const rightChars = Array.from(String(rightText ?? ''))

  if (leftChars.length + rightChars.length > maxChars) {
    return buildSimpleInlineDiffSegments(leftChars, rightChars)
  }

  const leftSegments: DiffSegment[] = []
  const rightSegments: DiffSegment[] = []
  for (const op of myersDiff(leftChars, rightChars)) {
    if (op.type === 'equal') {
      pushSegment(leftSegments, 'equal', op.value)
      pushSegment(rightSegments, 'equal', op.value)
      continue
    }
    if (op.type === 'delete') {
      pushSegment(leftSegments, 'delete', op.value)
      continue
    }
    pushSegment(rightSegments, 'insert', op.value)
  }

  return { leftSegments, rightSegments, truncated: false }
}

function buildSimpleInlineDiffSegments(
  leftChars: string[],
  rightChars: string[]
): {
  leftSegments: DiffSegment[]
  rightSegments: DiffSegment[]
  truncated: boolean
} {
  let prefix = 0
  while (
    prefix < leftChars.length &&
    prefix < rightChars.length &&
    leftChars[prefix] === rightChars[prefix]
  ) {
    prefix += 1
  }

  let suffix = 0
  while (
    suffix < leftChars.length - prefix &&
    suffix < rightChars.length - prefix &&
    leftChars[leftChars.length - 1 - suffix] === rightChars[rightChars.length - 1 - suffix]
  ) {
    suffix += 1
  }

  const leftSegments: DiffSegment[] = []
  const rightSegments: DiffSegment[] = []
  pushSegment(leftSegments, 'equal', leftChars.slice(0, prefix).join(''))
  pushSegment(
    leftSegments,
    'delete',
    leftChars.slice(prefix, Math.max(prefix, leftChars.length - suffix)).join('')
  )
  pushSegment(leftSegments, 'equal', leftChars.slice(leftChars.length - suffix).join(''))

  pushSegment(rightSegments, 'equal', rightChars.slice(0, prefix).join(''))
  pushSegment(
    rightSegments,
    'insert',
    rightChars.slice(prefix, Math.max(prefix, rightChars.length - suffix)).join('')
  )
  pushSegment(rightSegments, 'equal', rightChars.slice(rightChars.length - suffix).join(''))

  return { leftSegments, rightSegments, truncated: true }
}

export function serializeDiffRows(rows: DiffRow[]): string {
  return rows
    .map((row) => {
      const left = row.left ?? ''
      const right = row.right ?? ''
      return `[${row.type}] L${row.leftNo ?? '-'}:${left} | R${row.rightNo ?? '-'}:${right}`
    })
    .join('\n')
}
