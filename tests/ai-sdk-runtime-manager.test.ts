import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AiSdkRuntimeManager } from '../src/main/services/ai-sdk-runtime-manager'

describe('AiSdkRuntimeManager', () => {
  it('reports uninstalled runtime by default', async () => {
    const root = await mkdtemp(join(tmpdir(), 'doggy-ai-runtime-'))
    const manager = new AiSdkRuntimeManager(root)

    const state = await manager.getState()

    expect(state.runtimes.codex.installed).toBe(false)
    expect(state.runtimes['claude-code'].installed).toBe(false)
    expect(state.runtimes.codex.installPath).toContain('ai-runtimes')
  })

  it('reads installed version from runtime package directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'doggy-ai-runtime-'))
    const manager = new AiSdkRuntimeManager(root)
    const installPath = manager.getInstallPath('codex')
    const packageDir = join(installPath, 'node_modules', '@openai', 'codex-sdk')

    await mkdir(packageDir, { recursive: true })
    await writeFile(
      join(packageDir, 'package.json'),
      JSON.stringify({
        name: '@openai/codex-sdk',
        version: '0.122.0'
      })
    )

    const status = await manager.getStatus('codex')

    expect(status.installed).toBe(true)
    expect(status.installedVersion).toBe('0.122.0')
    expect(status.packageName).toBe('@openai/codex-sdk')
  })

  it('reports bundled installer when matching runtime installer exists', async () => {
    const root = await mkdtemp(join(tmpdir(), 'doggy-ai-runtime-'))
    const manager = new AiSdkRuntimeManager(root)

    const status = await manager.getStatus('codex')

    expect(['bundled-pnpm', 'pnpm', 'corepack-pnpm', 'npm', 'unavailable']).toContain(
      status.packageManager
    )
  })
})
