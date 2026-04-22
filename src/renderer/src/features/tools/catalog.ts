import type { ToolDefinition } from './types'

export const toolCatalog: ToolDefinition[] = [
  {
    key: 'base64',
    title: 'Base64',
    description: 'UTF-8 文本与 Base64 互转，保留旧项目内容识别思路。',
    accent: 'amber'
  },
  {
    key: 'url',
    title: 'URL',
    description: '支持单条和批量 URL 编解码，保留非法编码错误提示。',
    accent: 'orange'
  },
  {
    key: 'uuid',
    title: 'UUID',
    description: '生成 UUID v4，后续可扩展到批量与格式选项。',
    accent: 'yellow'
  },
  {
    key: 'hash',
    title: 'Hash',
    description: 'MD5 / SHA-256 文本摘要，兼容旧工具的 UTF-8 语义。',
    accent: 'green'
  },
  {
    key: 'time',
    title: 'Time',
    description: 'Unix 时间戳与标准时间互转，保留 UTC / UTC+8 视角。',
    accent: 'teal'
  },
  {
    key: 'json',
    title: 'JSON',
    description: '格式化、校验、常见错误修复和字段排序。',
    accent: 'cyan'
  },
  {
    key: 'text',
    title: 'Text',
    description: '去重、排序、去空行、行号处理等高频文本操作。',
    accent: 'blue'
  },
  {
    key: 'unicode',
    title: 'Unicode',
    description: '支持 \\uXXXX、\\xXX 和 HTML 实体互转。',
    accent: 'indigo'
  },
  {
    key: 'radix',
    title: 'Radix',
    description: '2/8/10/16 进制自动识别与 BigInt 转换。',
    accent: 'violet'
  },
  {
    key: 'naming',
    title: 'Naming',
    description: 'camel / pascal / snake / kebab 等命名风格转换。',
    accent: 'pink'
  }
]
