import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  CredentialService,
  type CredentialSecretCodec
} from '../src/main/services/credential-service'
import { resolveAppDataPaths } from '../src/main/services/app-data'

const reverseCodec: CredentialSecretCodec = {
  encoding: 'electron-safe-storage',
  encode: (value) => value.split('').reverse().join(''),
  decode: (value) => value.split('').reverse().join('')
}

async function createService(codec?: CredentialSecretCodec): Promise<{
  rootDir: string
  service: CredentialService
}> {
  const rootDir = await mkdtemp(join(tmpdir(), 'doggy-toolbox-web-credentials-'))
  return {
    rootDir,
    service: new CredentialService(rootDir, codec)
  }
}

describe('CredentialService', () => {
  it('bootstraps credential repository on first read', async () => {
    const { rootDir, service } = await createService()

    const state = await service.getState()
    const paths = resolveAppDataPaths(rootDir)

    expect(state.storageFile).toBe(paths.files.credentials)
    expect(state.credentials).toEqual([])

    const fileContent = await readFile(paths.files.credentials, 'utf8')
    expect(JSON.parse(fileContent)).toMatchObject({
      version: 1,
      secretEncoding: 'plain'
    })
  })

  it('saves credentials and stores password through the injected codec', async () => {
    const { rootDir, service } = await createService(reverseCodec)

    const saved = await service.saveCredential({
      service: 'GitHub',
      url: 'https://github.com',
      account: 'doggy',
      password: 'secret-token',
      extra: ['2FA enabled']
    })
    const state = await service.getState()
    const raw = JSON.parse(await readFile(resolveAppDataPaths(rootDir).files.credentials, 'utf8'))

    expect(saved).toMatchObject({
      service: 'GitHub',
      password: 'secret-token'
    })
    expect(state.secretEncoding).toBe('electron-safe-storage')
    expect(state.credentials[0]).toMatchObject({
      id: saved.id,
      account: 'doggy',
      password: 'secret-token',
      extra: ['2FA enabled']
    })
    expect(raw.credentials[0].passwordSecret).toBe('nekot-terces')
  })

  it('updates and deletes credentials', async () => {
    const { service } = await createService()

    const saved = await service.saveCredential({
      service: 'Jenkins',
      account: 'ci',
      password: 'old'
    })
    const updated = await service.saveCredential({
      id: saved.id,
      service: 'Jenkins Prod',
      account: 'ci-prod',
      password: 'new'
    })
    const deleteResult = await service.deleteCredential(updated.id)
    const state = await service.getState()

    expect(updated).toMatchObject({
      id: saved.id,
      service: 'Jenkins Prod',
      account: 'ci-prod',
      password: 'new'
    })
    expect(deleteResult.ok).toBe(true)
    expect(state.credentials).toEqual([])
  })
})
