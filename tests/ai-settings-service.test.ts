import { describe, expect, it } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AiSettingsService } from '../src/main/services/ai-settings-service'

async function createFixture(): Promise<AiSettingsService> {
  const rootDir = await mkdtemp(join(tmpdir(), 'doggy-toolbox-web-ai-settings-'))
  return new AiSettingsService(rootDir)
}

describe('AiSettingsService', () => {
  it('returns default local sdk settings on first load', async () => {
    const service = await createFixture()
    const state = await service.getState()

    expect(state.settings).toMatchObject({
      workingDirectory: '',
      globalEnabled: true,
      features: {
        'ai-chat': true,
        tools: true,
        http: true,
        commands: true,
        prompts: true,
        nodes: true
      }
    })
    expect(state.settings.systemPrompt).toContain('先解释结果')
  })

  it('persists saved settings and supports partial feature updates', async () => {
    const service = await createFixture()

    await service.saveSettings({
      workingDirectory: '/tmp/doggy-project',
      globalEnabled: false,
      features: {
        http: false,
        nodes: false
      }
    })

    const state = await service.getState()
    expect(state.settings).toMatchObject({
      workingDirectory: '/tmp/doggy-project',
      globalEnabled: false,
      features: {
        'ai-chat': true,
        tools: true,
        http: false,
        commands: true,
        prompts: true,
        nodes: false
      }
    })
  })

  it('exports and restores ai settings through backup section shape', async () => {
    const source = await createFixture()
    await source.saveSettings({
      workingDirectory: '/tmp/source',
      systemPrompt: '只做针对当前输出的简洁审查。',
      features: {
        tools: false
      }
    })

    const section = await source.exportBackupSection()
    const target = await createFixture()
    const restored = await target.restoreBackupSection(section)

    expect(restored.settings).toMatchObject({
      workingDirectory: '/tmp/source',
      systemPrompt: '只做针对当前输出的简洁审查。',
      features: {
        tools: false
      }
    })
  })
})
