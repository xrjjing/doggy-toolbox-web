export type WebSocketMessageType = 'sent' | 'received' | 'system'

export type WebSocketMessageRecord = {
  id: string
  type: WebSocketMessageType
  content: string
  timestamp: string
  fullTimestamp: string
}

/**
 * WebSocket 面板纯函数层。
 * 这里只负责时间戳、消息结构和轻量格式化，不直接管理真实 socket 生命周期。
 */
function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * 用毫秒时间戳是为了让收发历史更容易和服务端日志对齐。
 */
export function formatWebSocketTimestamp(date = new Date()): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}.${String(
    date.getMilliseconds()
  ).padStart(3, '0')}`
}

/**
 * 所有消息统一转成同一结构，避免 UI 分支里到处判断 sent/received/system 的展示字段。
 */
export function createWebSocketMessage(
  type: WebSocketMessageType,
  content: string,
  timestamp = new Date()
): WebSocketMessageRecord {
  return {
    id: `${timestamp.getTime()}-${Math.random().toString(16).slice(2)}`,
    type,
    content,
    timestamp: formatWebSocketTimestamp(timestamp),
    fullTimestamp: timestamp.toISOString()
  }
}

/**
 * 仅在“看起来像 JSON”时做美化，失败就原样返回，不影响文本消息查看。
 */
export function tryFormatWebSocketJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

/**
 * 浏览器原生 WebSocket 只接受 ws/wss，因此这里提前过滤协议，避免运行时异常。
 */
export function isValidWebSocketUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'ws:' || parsed.protocol === 'wss:'
  } catch {
    return false
  }
}

/**
 * AI 复核只需要最近一段消息上下文，不需要无限长历史。
 * 因此摘要默认只截取最后几条消息。
 */
export function summarizeWebSocketMessages(messages: WebSocketMessageRecord[], limit = 8): string {
  return messages
    .slice(-limit)
    .map((message) => `[${message.timestamp}] ${message.type}: ${message.content}`)
    .join('\n')
}
