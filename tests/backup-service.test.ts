import { describe, expect, it } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AiSettingsService } from '../src/main/services/ai-settings-service'
import { BackupService } from '../src/main/services/backup-service'
import { CommandService } from '../src/main/services/command-service'
import { CredentialService } from '../src/main/services/credential-service'
import { HttpCollectionService } from '../src/main/services/http-collection-service'
import { NodeService } from '../src/main/services/node-service'
import { PromptService } from '../src/main/services/prompt-service'

const LOCAL_HTTP_URL = 'http://127.0.0.1:65535/backup-history'

async function createBackupFixture(): Promise<{
  aiSettingsService: AiSettingsService
  commandService: CommandService
  credentialService: CredentialService
  httpCollectionService: HttpCollectionService
  nodeService: NodeService
  promptService: PromptService
  backupService: BackupService
}> {
  const rootDir = await mkdtemp(join(tmpdir(), 'doggy-toolbox-web-backup-'))
  const aiSettingsService = new AiSettingsService(rootDir)
  const commandService = new CommandService(rootDir)
  const credentialService = new CredentialService(rootDir)
  const httpCollectionService = new HttpCollectionService(rootDir)
  const nodeService = new NodeService(rootDir)
  const promptService = new PromptService(rootDir)
  const backupService = new BackupService({
    aiSettingsService,
    commandService,
    credentialService,
    httpCollectionService,
    nodeService,
    promptService
  })

  return {
    aiSettingsService,
    commandService,
    credentialService,
    httpCollectionService,
    nodeService,
    promptService,
    backupService
  }
}

describe('BackupService', () => {
  it('exports commands, credentials, nodes, http collections and prompts in one document', async () => {
    const {
      aiSettingsService,
      commandService,
      credentialService,
      httpCollectionService,
      nodeService,
      backupService
    } = await createBackupFixture()

    await aiSettingsService.saveSettings({
      workingDirectory: '/tmp/doggy-ai',
      features: { tools: false }
    })
    await commandService.saveCommand({ title: '状态', lines: ['git status'] })
    await credentialService.saveCredential({
      service: 'GitHub',
      account: 'doggy',
      password: 'token'
    })
    await nodeService.saveNode({
      name: '香港节点',
      type: 'vless',
      server: 'hk.example.com',
      port: 443,
      tags: ['香港']
    })
    await httpCollectionService.saveRequest({
      name: '查询用户',
      method: 'GET',
      url: 'https://api.example.com/users'
    })
    const historyRequest = await httpCollectionService.saveRequest({
      name: '历史记录',
      method: 'GET',
      url: LOCAL_HTTP_URL
    })
    await httpCollectionService.executeRequest({ requestId: historyRequest.id, timeoutMs: 1000 })

    const document = await backupService.exportBackup()

    expect(document).toMatchObject({
      version: '1.0',
      app: 'doggy-toolbox-web',
      sections: ['commands', 'credentials', 'prompts', 'nodes', 'httpCollections', 'aiSettings']
    })
    expect(document.summary.commands).toBe(1)
    expect(document.summary.credentials).toBe(1)
    expect(document.summary.nodes).toBe(1)
    expect(document.summary.httpCollections).toBe(1)
    expect(document.summary.httpRequests).toBe(2)
    expect(document.summary.promptTemplates).toBeGreaterThan(0)
    expect(document.summary.httpHistoryRecords).toBe(1)
    expect(document.summary.aiSettings).toBe(1)
    expect(document.data.aiSettings?.settings.workingDirectory).toBe('/tmp/doggy-ai')
    expect(document.data.httpCollections?.history).toHaveLength(1)
  })

  it('imports selected sections and overwrites existing module data', async () => {
    const source = await createBackupFixture()
    await source.commandService.saveCommand({ title: '源命令', lines: ['npm run build'] })
    await source.credentialService.saveCredential({
      service: '源凭证',
      account: 'source',
      password: 'secret'
    })
    await source.nodeService.saveNode({
      name: '源节点',
      type: 'vless',
      server: 'source.example.com',
      port: 443
    })
    await source.httpCollectionService.saveRequest({
      name: '源请求',
      method: 'POST',
      url: 'https://source.example.com'
    })
    const document = await source.backupService.exportBackup({
      sections: ['commands', 'credentials', 'nodes', 'httpCollections']
    })

    const target = await createBackupFixture()
    await target.commandService.saveCommand({ title: '旧命令', lines: ['old'] })
    await target.nodeService.saveNode({
      name: '旧节点',
      type: 'ss',
      server: 'old.example.com',
      port: 8388
    })
    await target.httpCollectionService.saveRequest({
      name: '旧请求',
      method: 'GET',
      url: 'https://old.example.com'
    })
    await target.backupService.importBackup({
      json: JSON.stringify(document),
      sections: ['commands']
    })

    const commands = await target.commandService.getState()
    const credentials = await target.credentialService.getState()
    const nodes = await target.nodeService.getState()
    const httpCollections = await target.httpCollectionService.getState()

    expect(commands.commands.map((command) => command.title)).toEqual(['源命令'])
    expect(credentials.credentials).toEqual([])
    expect(nodes.nodes.map((node) => node.name)).toEqual(['旧节点'])
    expect(httpCollections.requests.map((request) => request.name)).toEqual(['旧请求'])
  })
})
