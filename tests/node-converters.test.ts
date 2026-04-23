import { describe, expect, it } from 'vitest'
import { parseNodeShareLink, parseNodeShareLinks } from '@renderer/features/nodes/node-converters'

function encodeBase64(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64').replace(/=/g, '')
}

describe('node converters', () => {
  it('parses vless share link', () => {
    const node = parseNodeShareLink(
      'vless://uuid-demo@example.com:443?security=tls&sni=api.example.com#Tokyo'
    )

    expect(node).toMatchObject({
      name: 'Tokyo',
      type: 'vless',
      server: 'example.com',
      port: 443
    })
  })

  it('parses trojan share link', () => {
    const node = parseNodeShareLink('trojan://secret@example.com:443#Trojan-Line')

    expect(node).toMatchObject({
      name: 'Trojan-Line',
      type: 'trojan',
      server: 'example.com',
      port: 443
    })
  })

  it('parses ss share link', () => {
    const encoded = encodeBase64('aes-256-gcm:password')
    const node = parseNodeShareLink(`ss://${encoded}@example.com:8388#SS-Line`)

    expect(node).toMatchObject({
      name: 'SS-Line',
      type: 'ss',
      server: 'example.com',
      port: 8388
    })
  })

  it('parses vmess share link list', () => {
    const vmessPayload = encodeBase64(
      JSON.stringify({
        ps: 'VMess-Line',
        add: 'example.com',
        port: '443',
        id: 'uuid-demo',
        aid: '0',
        net: 'ws',
        path: '/ws',
        tls: 'tls'
      })
    )
    const nodes = parseNodeShareLinks(
      `vmess://${vmessPayload}\n\ntrojan://secret@example.com:443#Trojan-Line`
    )

    expect(nodes).toHaveLength(2)
    expect(nodes[0]).toMatchObject({
      name: 'VMess-Line',
      type: 'vmess',
      server: 'example.com',
      port: 443
    })
    expect(nodes[1].type).toBe('trojan')
  })
})
