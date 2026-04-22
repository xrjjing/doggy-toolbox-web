import { describe, expect, it } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { BackupService } from '../src/main/services/backup-service'
import { CommandService } from '../src/main/services/command-service'
import { CredentialService } from '../src/main/services/credential-service'
import { PromptService } from '../src/main/services/prompt-service'

async function createBackupFixture(): Promise<{
  commandService: CommandService
  credentialService: CredentialService
  promptService: PromptService
  backupService: BackupService
}> {
  const rootDir = await mkdtemp(join(tmpdir(), 'doggy-toolbox-web-backup-'))
  const commandService = new CommandService(rootDir)
  const credentialService = new CredentialService(rootDir)
  const promptService = new PromptService(rootDir)
  const backupService = new BackupService({ commandService, credentialService, promptService })

  return { commandService, credentialService, promptService, backupService }
}

describe('BackupService', () => {
  it('exports commands, credentials and prompts in one document', async () => {
    const { commandService, credentialService, backupService } = await createBackupFixture()

    await commandService.saveCommand({ title: '状态', lines: ['git status'] })
    await credentialService.saveCredential({
      service: 'GitHub',
      account: 'doggy',
      password: 'token'
    })

    const document = await backupService.exportBackup()

    expect(document).toMatchObject({
      version: '1.0',
      app: 'doggy-toolbox-web',
      sections: ['commands', 'credentials', 'prompts']
    })
    expect(document.summary.commands).toBe(1)
    expect(document.summary.credentials).toBe(1)
    expect(document.summary.promptTemplates).toBeGreaterThan(0)
  })

  it('imports selected sections and overwrites existing module data', async () => {
    const source = await createBackupFixture()
    await source.commandService.saveCommand({ title: '源命令', lines: ['npm run build'] })
    await source.credentialService.saveCredential({
      service: '源凭证',
      account: 'source',
      password: 'secret'
    })
    const document = await source.backupService.exportBackup({
      sections: ['commands', 'credentials']
    })

    const target = await createBackupFixture()
    await target.commandService.saveCommand({ title: '旧命令', lines: ['old'] })
    await target.backupService.importBackup({
      json: JSON.stringify(document),
      sections: ['commands']
    })

    const commands = await target.commandService.getState()
    const credentials = await target.credentialService.getState()

    expect(commands.commands.map((command) => command.title)).toEqual(['源命令'])
    expect(credentials.credentials).toEqual([])
  })
})
