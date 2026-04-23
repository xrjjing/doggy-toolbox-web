/**
 * 工具工作台共享类型。
 * `ToolKind` 是目录、视图和执行分发表之间的公共键。
 */
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
  | 'jwt'
  | 'hmac'
  | 'html-entity'
  | 'charcount'
  | 'text-sort'
  | 'mask'
  | 'regex'
  | 'sql'
  | 'csv'
  | 'markdown'
  | 'color'
  | 'cron'
  | 'password'
  | 'json-schema'
  | 'jsonpath'
  | 'toml'
  | 'ua'
  | 'ip'
  | 'b64hex'
  | 'datecalc'
  | 'data-convert'
  | 'qrcode'
  | 'img-base64'
  | 'rsa'
  | 'websocket'
  | 'mock'
  | 'diff'
  | 'crypto'
  | 'git'
  | 'docker'
  | 'docker-service'
  | 'docker-swarm'
  | 'nginx'

/**
 * 工具目录最小展示结构；`accent` 只服务视觉表现，不参与业务逻辑。
 */
export type ToolDefinition = {
  key: ToolKind
  title: string
  description: string
  accent: string
}

/**
 * 复杂工具面板回传给工作台的最小快照。
 * 工作台只依赖这三个字段来复用统一 AI 复核流程，不耦合每个面板的内部状态结构。
 */
export type ToolPanelSnapshot = {
  input: string
  output: string
  extra: string
}
