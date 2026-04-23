import { describe, expect, it } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { CommandService } from '../src/main/services/command-service'
import { CredentialService } from '../src/main/services/credential-service'
import { LegacyImportService } from '../src/main/services/legacy-import-service'
import { NodeService } from '../src/main/services/node-service'
import { PromptService } from '../src/main/services/prompt-service'

async function createLegacyFixture(): Promise<{
  commandService: CommandService
  credentialService: CredentialService
  nodeService: NodeService
  promptService: PromptService
  legacyImportService: LegacyImportService
}> {
  const rootDir = await mkdtemp(join(tmpdir(), 'doggy-toolbox-web-legacy-import-'))
  const commandService = new CommandService(rootDir)
  const credentialService = new CredentialService(rootDir)
  const nodeService = new NodeService(rootDir)
  const promptService = new PromptService(rootDir)
  const legacyImportService = new LegacyImportService({
    commandService,
    credentialService,
    nodeService,
    promptService
  })

  return { commandService, credentialService, nodeService, promptService, legacyImportService }
}

describe('LegacyImportService', () => {
  it('analyzes old doggy-toolbox backup json', async () => {
    const { legacyImportService } = await createLegacyFixture()

    const analysis = await legacyImportService.analyze(
      JSON.stringify({
        version: '1.0',
        app: '狗狗百宝箱',
        data: {
          tabs: [{ id: '0', name: '默认' }],
          commands: [{ title: '状态', commands: ['git status'] }],
          credentials: [{ service: 'GitHub', account: 'doggy', password: 'token' }],
          nodes: [{ name: '香港节点', raw_link: 'vless://demo', 'config.yaml': 'name: 香港节点' }]
        }
      })
    )

    expect(analysis.sourceKind).toBe('doggy-toolbox-backup')
    expect(analysis.availableSections).toEqual(['commands', 'credentials', 'nodes'])
    expect(analysis.summary.commands).toBe(1)
    expect(analysis.summary.credentials).toBe(1)
    expect(analysis.summary.nodes).toBe(1)
  })

  it('imports old backup into commands, credentials and nodes modules', async () => {
    const { commandService, credentialService, nodeService, legacyImportService } =
      await createLegacyFixture()

    await commandService.saveCommand({ title: '旧命令', lines: ['old'] })
    await credentialService.saveCredential({
      service: '旧凭证',
      account: 'old',
      password: 'old'
    })
    await nodeService.saveNode({
      name: '旧节点',
      type: 'ss',
      server: 'legacy.example.com',
      port: 8388
    })

    await legacyImportService.import({
      json: JSON.stringify({
        version: '1.0',
        app: '狗狗百宝箱',
        data: {
          tabs: [
            { id: '0', name: '默认' },
            { id: '100', name: 'Git' }
          ],
          commands: [
            {
              title: '状态',
              description: '查看分支状态',
              commands: ['git status'],
              tab_id: '100',
              tags: ['git']
            }
          ],
          credentials: [{ service: 'GitHub', account: 'doggy', password: 'token', extra: ['2FA'] }],
          nodes: [
            {
              name: '香港节点',
              type: 'vless',
              server: 'hk.example.com',
              port: 443,
              raw_link: 'vless://demo',
              'config.yaml': 'proxies:\n  - name: 香港节点',
              tags: ['香港', '稳定'],
              order_index: 9
            }
          ]
        }
      })
    })

    const commands = await commandService.getState()
    const credentials = await credentialService.getState()
    const nodes = await nodeService.getState()

    expect(commands.commands.map((item) => item.title)).toEqual(['状态'])
    expect(commands.tabs.some((tab) => tab.name === 'Git')).toBe(true)
    expect(credentials.credentials.map((item) => item.service)).toEqual(['GitHub'])
    expect(nodes.nodes).toMatchObject([
      {
        name: '香港节点',
        type: 'vless',
        server: 'hk.example.com',
        port: 443,
        rawLink: 'vless://demo',
        configText: 'proxies:\n  - name: 香港节点',
        tags: ['香港', '稳定'],
        order: 9
      }
    ])
  })

  it('imports only selected sections from old backup', async () => {
    const { commandService, credentialService, nodeService, legacyImportService } =
      await createLegacyFixture()

    await commandService.saveCommand({ title: '保留命令', lines: ['echo keep'] })
    await credentialService.saveCredential({
      service: '旧凭证',
      account: 'old',
      password: 'old'
    })
    await nodeService.saveNode({
      name: '保留节点',
      type: 'ss',
      server: 'keep.example.com',
      port: 8388
    })

    const result = await legacyImportService.import({
      json: JSON.stringify({
        version: '1.0',
        app: '狗狗百宝箱',
        data: {
          tabs: [
            { id: '0', name: '默认' },
            { id: '100', name: 'Git' }
          ],
          commands: [{ title: '状态', commands: ['git status'], tab_id: '100' }],
          credentials: [{ service: 'GitHub', account: 'doggy', password: 'token' }],
          nodes: [{ name: '新节点', type: 'vless', server: 'new.example.com', port: 443 }]
        }
      }),
      sections: ['credentials']
    })

    const commands = await commandService.getState()
    const credentials = await credentialService.getState()
    const nodes = await nodeService.getState()

    expect(result.sections).toEqual(['credentials'])
    expect(result.summary.commands).toBe(0)
    expect(result.summary.credentials).toBe(1)
    expect(commands.commands.map((item) => item.title)).toEqual(['保留命令'])
    expect(credentials.credentials.map((item) => item.service)).toEqual(['GitHub'])
    expect(nodes.nodes.map((item) => item.name)).toEqual(['保留节点'])
  })

  it('imports old prompt export by merging categories and appending new templates', async () => {
    const { promptService, legacyImportService } = await createLegacyFixture()

    await legacyImportService.import({
      json: JSON.stringify({
        version: '1.0',
        export_time: '2026-04-22T00:00:00',
        categories: [{ id: 'cat_custom', name: '排障', icon: 'DBG' }],
        templates: [
          {
            title: '日志分析',
            content: '请分析 {{log}}',
            description: '导入测试模板',
            tags: ['log'],
            category_id: 'cat_custom'
          }
        ]
      })
    })

    const state = await promptService.getState()

    expect(state.categories.some((category) => category.name === '排障')).toBe(true)
    expect(state.templates.some((template) => template.title === '日志分析')).toBe(true)
  })

  it('skips duplicate prompt template titles when importing old prompt export repeatedly', async () => {
    const { promptService, legacyImportService } = await createLegacyFixture()
    const exportJson = JSON.stringify({
      version: '1.0',
      export_time: '2026-04-22T00:00:00',
      categories: [{ id: 'cat_custom', name: '排障', icon: 'DBG' }],
      templates: [
        {
          title: '日志分析',
          content: '请分析 {{log}}',
          description: '导入测试模板',
          tags: ['log'],
          category_id: 'cat_custom'
        }
      ]
    })

    await legacyImportService.import({ json: exportJson })
    await legacyImportService.import({ json: exportJson })

    const state = await promptService.getState()

    expect(state.categories.filter((category) => category.name === '排障')).toHaveLength(1)
    expect(state.templates.filter((template) => template.title === '日志分析')).toHaveLength(1)
  })
})
