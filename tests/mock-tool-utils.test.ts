import { describe, expect, it, vi } from 'vitest'
import {
  buildMockData,
  clampMockCount,
  generateMockValues,
  serializeMockValues
} from '../src/renderer/src/features/tools/utils/core-mock'

describe('mock tool utilities', () => {
  it('clamps count to legacy-safe range', () => {
    expect(clampMockCount(0)).toBe(10)
    expect(clampMockCount(1001)).toBe(1000)
    expect(clampMockCount(12.8)).toBe(12)
  })

  it('serializes outputs using legacy mock formats', () => {
    const values = ['张三', '李四']
    expect(serializeMockValues(values, 'lines')).toBe('张三\n李四')
    expect(serializeMockValues(values, 'json')).toBe('[\n  "张三",\n  "李四"\n]')
    expect(serializeMockValues(values, 'csv')).toBe('"张三",\n"李四"')
    expect(serializeMockValues(values, 'jsonlines')).toBe('"张三"\n"李四"')
  })

  it('builds mock data with count summary', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const result = buildMockData('name', 2, 'lines')
    expect(result.values).toHaveLength(2)
    expect(result.output.split('\n')).toHaveLength(2)
    expect(result.summary).toContain('类型: name')
    expect(result.summary).toContain('数量: 2')
    vi.restoreAllMocks()
  })

  it('generates uuids without empty values', () => {
    const values = generateMockValues('uuid', 3)
    expect(values).toHaveLength(3)
    expect(values.every((item) => item.length > 0)).toBe(true)
  })
})
