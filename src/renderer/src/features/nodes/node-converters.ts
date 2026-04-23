import type { NodeSaveInput } from '@shared/ipc-contract'

/**
 * 节点分享链接转换器。
 * 负责把多种代理分享协议解析成统一的 `NodeSaveInput`，
 * 这样 store 和主进程只需要消费标准化后的字段，不必感知协议差异。
 */

type ParsedNode = {
  name: string
  type: string
  server: string
  port: number
  rawLink: string
  configText: string
  tags: string[]
}

/**
 * 一些分享链接使用 URL-safe Base64 或省略 padding，这里统一补齐后再解码。
 */
function addPadding(value: string): string {
  const missing = value.length % 4
  return missing === 0 ? value : value + '='.repeat(4 - missing)
}

/**
 * 优先使用浏览器环境的 `atob`，必要时回退到 Buffer，
 * 兼容 renderer 在不同运行环境下的解码能力。
 */
function decodeBase64(value: string): string {
  const normalized = addPadding(value.replace(/-/g, '+').replace(/_/g, '/'))
  if (typeof atob === 'function') {
    return decodeURIComponent(
      Array.from(atob(normalized))
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join('')
    )
  }

  return Buffer.from(normalized, 'base64').toString('utf8')
}

/**
 * 所有协议最后都收口成统一保存输入，便于后续复用节点保存链路。
 */
function toNodeInput(node: ParsedNode): NodeSaveInput {
  return {
    name: node.name,
    type: node.type,
    server: node.server,
    port: node.port,
    rawLink: node.rawLink,
    configText: node.configText,
    tags: node.tags
  }
}

/**
 * SS 链接的认证信息可能位于 userinfo，也可能混在 host 前缀里，这里同时兼容。
 */
function parseSsLink(rawLink: string): ParsedNode {
  const parsed = new URL(rawLink)
  const encoded =
    `${parsed.username}${parsed.password ? `:${parsed.password}` : ''}` || parsed.host.split('@')[0]
  const decoded = decodeBase64(encoded)
  const [method, password] = decoded.split(':')
  if (!parsed.hostname || !parsed.port || !method || password === undefined) {
    throw new Error('SS 链接缺少必要字段')
  }

  return {
    name: decodeURIComponent(parsed.hash.slice(1) || 'ss-node'),
    type: 'ss',
    server: parsed.hostname,
    port: Number(parsed.port),
    rawLink,
    configText: `type=ss\nserver=${parsed.hostname}\nport=${parsed.port}\ncipher=${method}\npassword=${password}`,
    tags: ['分享链接导入', 'ss']
  }
}

/**
 * Trojan 协议字段较少，直接从 URL 主体提取密码、主机和端口。
 */
function parseTrojanLink(rawLink: string): ParsedNode {
  const parsed = new URL(rawLink)
  if (!parsed.hostname || !parsed.port || !parsed.username) {
    throw new Error('Trojan 链接缺少必要字段')
  }

  return {
    name: decodeURIComponent(parsed.hash.slice(1) || 'trojan-node'),
    type: 'trojan',
    server: parsed.hostname,
    port: Number(parsed.port),
    rawLink,
    configText: `type=trojan\nserver=${parsed.hostname}\nport=${parsed.port}\npassword=${parsed.username}`,
    tags: ['分享链接导入', 'trojan']
  }
}

/**
 * VLESS 和 URI 形式 VMess 在 URL 结构上足够接近，因此复用同一条解析链。
 * 这里只保留当前工具页会用到的核心 query 参数，避免把未知字段原样抄入配置。
 */
function parseVlessLikeLink(rawLink: string, type: 'vless' | 'vmess'): ParsedNode {
  const parsed = new URL(rawLink)
  if (!parsed.hostname || !parsed.port || !parsed.username) {
    throw new Error(`${type.toUpperCase()} 链接缺少必要字段`)
  }

  const params = parsed.searchParams
  const lines = [
    `type=${type}`,
    `server=${parsed.hostname}`,
    `port=${parsed.port}`,
    `id=${parsed.username}`
  ]
  // 仅保留当前节点页能稳定展示和编辑的常见参数。
  for (const key of ['security', 'sni', 'type', 'path', 'host', 'fp', 'pbk', 'sid']) {
    const value = params.get(key)
    if (value) lines.push(`${key}=${value}`)
  }

  return {
    name: decodeURIComponent(parsed.hash.slice(1) || `${type}-node`),
    type,
    server: parsed.hostname,
    port: Number(parsed.port),
    rawLink,
    configText: lines.join('\n'),
    tags: ['分享链接导入', type]
  }
}

/**
 * VMess 旧分享格式是 Base64 JSON，因此先解码再投影到统一字段。
 */
function parseVmessLink(rawLink: string): ParsedNode {
  const encoded = rawLink.replace(/^vmess:\/\//i, '')
  const decoded = JSON.parse(decodeBase64(encoded)) as Record<string, string>
  if (!decoded.add || !decoded.port) {
    throw new Error('VMess 链接缺少必要字段')
  }

  const lines = [
    'type=vmess',
    `server=${decoded.add}`,
    `port=${decoded.port}`,
    `id=${decoded.id ?? ''}`,
    `aid=${decoded.aid ?? ''}`,
    `net=${decoded.net ?? ''}`,
    `host=${decoded.host ?? ''}`,
    `path=${decoded.path ?? ''}`,
    `tls=${decoded.tls ?? ''}`
  ].filter(Boolean)

  return {
    name: decoded.ps || 'vmess-node',
    type: 'vmess',
    server: decoded.add,
    port: Number(decoded.port),
    rawLink,
    configText: lines.join('\n'),
    tags: ['分享链接导入', 'vmess']
  }
}

/**
 * 单条分享链接解析入口，先按协议头分发，再由具体解析器做字段校验。
 */
export function parseNodeShareLink(rawLink: string): NodeSaveInput {
  const trimmed = rawLink.trim()
  if (!trimmed) {
    throw new Error('分享链接不能为空')
  }

  if (/^vmess:\/\//i.test(trimmed)) return toNodeInput(parseVmessLink(trimmed))
  if (/^vless:\/\//i.test(trimmed)) return toNodeInput(parseVlessLikeLink(trimmed, 'vless'))
  if (/^trojan:\/\//i.test(trimmed)) return toNodeInput(parseTrojanLink(trimmed))
  if (/^ss:\/\//i.test(trimmed)) return toNodeInput(parseSsLink(trimmed))

  throw new Error('当前只支持 vmess://、vless://、trojan://、ss:// 分享链接')
}

/**
 * 多条导入只是逐行编排，不在这里吞错；
 * 任意一行异常都会直接抛出，让上层把原始问题反馈给用户。
 */
export function parseNodeShareLinks(text: string): NodeSaveInput[] {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseNodeShareLink(line))
}
