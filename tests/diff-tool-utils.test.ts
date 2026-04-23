import { describe, expect, it } from 'vitest'
import {
  analyzeDiff,
  applyDiffDirection,
  buildInlineDiffSegments,
  buildSideBySideDiff,
  formatDiffSummary
} from '../src/renderer/src/features/tools/utils/core-diff'

describe('diff tool utilities', () => {
  it('builds side by side rows using line diff', () => {
    const rows = buildSideBySideDiff('a\nb\nc', 'a\nx\nc\nd')
    expect(rows).toHaveLength(4)
    expect(rows[1]).toMatchObject({ type: 'change', left: 'b', right: 'x' })
    expect(rows[3]).toMatchObject({ type: 'insert', left: null, right: 'd' })
  })

  it('normalizes json mode and keeps per-side errors', () => {
    const result = analyzeDiff('{"a":1}', '{bad}', 'json')
    expect(result.leftError).toBeNull()
    expect(result.rightError).toContain('Expected property name')
    expect(result.rows.length).toBeGreaterThan(0)
  })

  it('applies direction by copying one side to the other', () => {
    expect(applyDiffDirection('left', 'right', 'ltr')).toEqual({
      leftText: 'left',
      rightText: 'left'
    })
    expect(applyDiffDirection('left', 'right', 'rtl')).toEqual({
      leftText: 'right',
      rightText: 'right'
    })
  })

  it('builds inline segments for changed rows', () => {
    const segments = buildInlineDiffSegments('abc', 'adc')
    expect(segments.leftSegments.some((item) => item.type === 'delete')).toBe(true)
    expect(segments.rightSegments.some((item) => item.type === 'insert')).toBe(true)
  })

  it('formats summary text for panel extra area', () => {
    const result = analyzeDiff('a\nb', 'a\nc', 'text')
    expect(formatDiffSummary(result.summary)).toContain('修改: 1')
  })
})
