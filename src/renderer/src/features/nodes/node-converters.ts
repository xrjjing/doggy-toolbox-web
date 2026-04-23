import type { NodeSaveInput } from '@shared/ipc-contract'

type ParsedNode = {
  name: string
  type: string
  server: string
  port: number
  rawLink: string
  configText: string
  tags: string[]
}

function addPadding(value: string): string {
  const missing = value.length % 4
  return missing === 0 ? value : value + '='.repeat(4 - missing)
}

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

export function parseNodeShareLinks(text: string): NodeSaveInput[] {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseNodeShareLink(line))
}
