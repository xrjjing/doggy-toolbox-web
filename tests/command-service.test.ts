import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { CommandService } from '../src/main/services/command-service'
import { resolveAppDataPaths } from '../src/main/services/app-data'

async function createService(): Promise<{ rootDir: string; service: CommandService }> {
  const rootDir = await mkdtemp(join(tmpdir(), 'doggy-toolbox-web-commands-'))
  return {
    rootDir,
    service: new CommandService(rootDir)
  }
}

describe('CommandService', () => {
  it('bootstraps appData layout and default tab on first read', async () => {
    const { rootDir, service } = await createService()

    const state = await service.getState()
    const paths = resolveAppDataPaths(rootDir)

    expect(state.storageFile).toBe(paths.files.commands)
    expect(state.tabs).toHaveLength(1)
    expect(state.tabs[0]).toMatchObject({
      id: 'default',
      name: '默认分组'
    })

    const fileContent = await readFile(paths.files.commands, 'utf8')
    expect(JSON.parse(fileContent)).toMatchObject({
      version: 1
    })
  })

  it('saves tabs and commands into the repository file', async () => {
    const { service } = await createService()

    const gitTab = await service.saveTab({ name: 'Git' })
    const command = await service.saveCommand({
      title: '最近 20 条提交',
      description: '排查分支改动时常用',
      lines: ['git log --oneline -20'],
      tabId: gitTab.id,
      tags: ['git', 'log']
    })

    const state = await service.getState()

    expect(state.tabs.map((tab) => tab.name)).toContain('Git')
    expect(state.commands).toHaveLength(1)
    expect(command).toMatchObject({
      title: '最近 20 条提交',
      tabId: gitTab.id,
      tags: ['git', 'log']
    })
    expect(state.commands[0].id).toBe(command.id)
  })

  it('reassigns moved commands to the end of the target tab and supports deletion', async () => {
    const { service } = await createService()

    const dockerTab = await service.saveTab({ name: 'Docker' })
    const commandA = await service.saveCommand({
      title: '查看容器',
      lines: ['docker ps'],
      tabId: dockerTab.id
    })
    await service.saveCommand({
      title: '查看镜像',
      lines: ['docker images'],
      tabId: dockerTab.id
    })

    const updatedA = await service.saveCommand({
      id: commandA.id,
      title: '查看容器详情',
      lines: ['docker ps -a'],
      tabId: 'default'
    })
    const deleteResult = await service.deleteCommand(updatedA.id)
    const state = await service.getState()

    expect(updatedA.tabId).toBe('default')
    expect(deleteResult.ok).toBe(true)
    expect(state.commands.map((command) => command.title)).toEqual(['查看镜像'])
  })
})
