export type ToolAiAssistPromptInput = {
  toolTitle: string
  toolDescription: string
  input: string
  output: string
  extra: string
}

const MAX_SECTION_LENGTH = 4_000

function clipSection(value: string): string {
  if (value.length <= MAX_SECTION_LENGTH) return value || '无'
  return `${value.slice(0, MAX_SECTION_LENGTH)}\n\n[内容过长，已截断，只保留前 ${MAX_SECTION_LENGTH} 个字符]`
}

export function buildToolAiAssistPrompt(input: ToolAiAssistPromptInput): string {
  return [
    '你是 doggy-toolbox-web 工具页的本地 AI 助手。',
    '请基于当前工具、输入、运行结果和附加信息，完成一次结果复核。',
    '',
    '要求：',
    '1. 先给结论，再给证据和边界。',
    '2. 如果结果可疑，指出可能原因和下一步可执行检查。',
    '3. 如果结果正常，用简短语言解释关键输出含义。',
    '4. 全程使用简体中文。',
    '5. 不要调用工具，不要修改文件。',
    '',
    `当前工具：${input.toolTitle}`,
    `工具说明：${input.toolDescription}`,
    '',
    '用户输入：',
    '```text',
    clipSection(input.input),
    '```',
    '',
    '工具输出：',
    '```text',
    clipSection(input.output),
    '```',
    '',
    '附加信息：',
    '```text',
    clipSection(input.extra),
    '```'
  ].join('\n')
}
