import { describe, expect, it } from 'vitest'
import { buildToolAiAssistPrompt } from '../src/renderer/src/features/tools/tool-ai-assist'

describe('tool ai assist prompt', () => {
  it('builds a local sdk review prompt from tool context', () => {
    const prompt = buildToolAiAssistPrompt({
      toolTitle: 'JSON',
      toolDescription: '格式化、校验、常见错误修复和字段排序。',
      input: "{foo:'bar'}",
      output: '{"foo":"bar"}',
      extra: '校验: 通过'
    })

    expect(prompt).toContain('不要调用工具，不要修改文件')
    expect(prompt).toContain('当前工具：JSON')
    expect(prompt).toContain("{foo:'bar'}")
    expect(prompt).toContain('{"foo":"bar"}')
  })

  it('clips oversized sections before sending to AI', () => {
    const prompt = buildToolAiAssistPrompt({
      toolTitle: 'Text',
      toolDescription: '文本处理。',
      input: 'a'.repeat(5_000),
      output: '',
      extra: ''
    })

    expect(prompt).toContain('已截断，只保留前 4000 个字符')
    expect(prompt).not.toContain('a'.repeat(4_500))
  })
})
