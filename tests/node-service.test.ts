import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolveAppDataPaths } from '../src/main/services/app-data'
import { NodeService } from '../src/main/services/node-service'

async function createService(): Promise<{ rootDir: string; service: NodeService }> {
  const rootDir = await mkdtemp(join(tmpdir(), 'doggy-toolbox-web-nodes-'))
  return {
    rootDir,
    service: new NodeService(rootDir)
  }
}

describe('NodeService', () => {
  it('bootstraps nodes repository on first read', async () => {
    const { rootDir, service } = await createService()

    const state = await service.getState()
    const paths = resolveAppDataPaths(rootDir)

    expect(state.storageFile).toBe(paths.files.nodes)
    expect(state.nodes).toEqual([])

    const fileContent = await readFile(paths.files.nodes, 'utf8')
    expect(JSON.parse(fileContent)).toMatchObject({
      version: 1
    })
  })

  it('saves and normalizes nodes into repository file', async () => {
    const { service } = await createService()

    const saved = await service.saveNode({
      name: '香港节点',
      type: 'vless',
      server: 'hk.example.com',
      port: 443,
      rawLink: 'vless://demo',
      configText: 'proxies:\n  - name: 香港节点',
      tags: ['香港', '稳定', '香港']
    })
    const state = await service.getState()

    expect(saved).toMatchObject({
      name: '香港节点',
      type: 'vless',
      server: 'hk.example.com',
      port: 443,
      tags: ['香港', '稳定']
    })
    expect(state.nodes).toHaveLength(1)
    expect(state.nodes[0].id).toBe(saved.id)
  })

  it('updates and deletes nodes', async () => {
    const { service } = await createService()

    const saved = await service.saveNode({
      name: '旧节点',
      type: 'ss',
      server: 'old.example.com',
      port: 8388,
      configText: 'legacy',
      tags: ['旧']
    })
    const updated = await service.saveNode({
      id: saved.id,
      name: '新节点',
      type: 'hysteria2',
      server: 'new.example.com',
      port: 8443,
      rawLink: 'hysteria2://demo',
      configText: 'updated',
      tags: ['新', '可用']
    })
    const deleteResult = await service.deleteNode(updated.id)
    const state = await service.getState()

    expect(updated).toMatchObject({
      id: saved.id,
      name: '新节点',
      type: 'hysteria2',
      server: 'new.example.com',
      port: 8443,
      tags: ['新', '可用']
    })
    expect(deleteResult.ok).toBe(true)
    expect(state.nodes).toEqual([])
  })
})
