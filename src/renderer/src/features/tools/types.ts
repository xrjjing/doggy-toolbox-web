export type ToolKind =
  | 'base64'
  | 'url'
  | 'uuid'
  | 'hash'
  | 'time'
  | 'json'
  | 'text'
  | 'unicode'
  | 'radix'
  | 'naming'

export type ToolDefinition = {
  key: ToolKind
  title: string
  description: string
  accent: string
}
