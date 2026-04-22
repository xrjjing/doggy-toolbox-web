import { randomUUID } from 'node:crypto'
import type {
  CredentialModuleState,
  CredentialRecord,
  CredentialSaveInput
} from '../../shared/ipc-contract'
import { ensureAppDataLayout, resolveAppDataPaths } from './app-data'
import { JsonFileRepository } from './json-repository'

type PasswordEncoding = CredentialModuleState['secretEncoding']

export type CredentialSecretCodec = {
  encoding: PasswordEncoding
  encode: (value: string) => string
  decode: (value: string) => string
}

type StoredCredentialRecord = Omit<CredentialRecord, 'password'> & {
  passwordSecret: string
  passwordEncoding: PasswordEncoding
}

type StoredCredentialState = {
  version: number
  updatedAt: string
  secretEncoding: PasswordEncoding
  credentials: StoredCredentialRecord[]
}

export const plainCredentialSecretCodec: CredentialSecretCodec = {
  encoding: 'plain',
  encode: (value) => value,
  decode: (value) => value
}

function nowIso(): string {
  return new Date().toISOString()
}

function createDefaultState(secretEncoding: PasswordEncoding): StoredCredentialState {
  return {
    version: 1,
    updatedAt: nowIso(),
    secretEncoding,
    credentials: []
  }
}

function sanitizeText(value: string | undefined): string {
  return (value ?? '').replace(/\r/g, '').trim()
}

function sanitizeLines(lines: string[] | undefined): string[] {
  return (lines ?? []).map((line) => line.replace(/\r/g, '').trim()).filter(Boolean)
}

function sortCredentials(credentials: CredentialRecord[]): CredentialRecord[] {
  return [...credentials].sort((left, right) => {
    if (left.order !== right.order) return left.order - right.order
    return left.createdAt.localeCompare(right.createdAt)
  })
}

function isStoredCredentialRecord(value: unknown): value is StoredCredentialRecord {
  return typeof value === 'object' && value !== null && 'id' in value
}

export class CredentialService {
  private readonly paths
  private readonly repository

  constructor(
    rootDir: string,
    private readonly secretCodec: CredentialSecretCodec = plainCredentialSecretCodec
  ) {
    this.paths = resolveAppDataPaths(rootDir)
    this.repository = new JsonFileRepository<StoredCredentialState>(
      this.paths.files.credentials,
      () => createDefaultState(this.secretCodec.encoding)
    )
  }

  async getState(): Promise<CredentialModuleState> {
    const state = await this.readState()
    return this.toModuleState(state)
  }

  async saveCredential(input: CredentialSaveInput): Promise<CredentialRecord> {
    const service = sanitizeText(input.service)
    const url = sanitizeText(input.url)
    const account = sanitizeText(input.account)
    const password = sanitizeText(input.password)
    const extra = sanitizeLines(input.extra)

    if (!service) {
      throw new Error('服务名称不能为空')
    }

    const timestamp = nowIso()
    let savedCredential: CredentialRecord | null = null

    await this.updateState((state) => {
      const credentials = this.toPlainRecords(state)
      const existingIndex = credentials.findIndex((credential) => credential.id === input.id)

      if (existingIndex >= 0) {
        const current = credentials[existingIndex]
        savedCredential = {
          ...current,
          service,
          url,
          account,
          password,
          extra,
          updatedAt: timestamp
        }
        credentials[existingIndex] = savedCredential
      } else {
        savedCredential = {
          id: randomUUID(),
          service,
          url,
          account,
          password,
          extra,
          order:
            credentials.reduce((maxOrder, credential) => Math.max(maxOrder, credential.order), -1) +
            1,
          createdAt: timestamp,
          updatedAt: timestamp
        }
        credentials.push(savedCredential)
      }

      return this.fromPlainRecords({
        version: 1,
        updatedAt: timestamp,
        secretEncoding: this.secretCodec.encoding,
        credentials: sortCredentials(credentials)
      })
    })

    if (!savedCredential) {
      throw new Error('凭证保存失败')
    }

    return savedCredential
  }

  async deleteCredential(credentialId: string): Promise<{ ok: boolean }> {
    const normalizedId = sanitizeText(credentialId)
    if (!normalizedId) {
      return { ok: false }
    }

    let removed = false

    await this.updateState((state) => {
      const credentials = this.toPlainRecords(state).filter((credential) => {
        const keep = credential.id !== normalizedId
        if (!keep) removed = true
        return keep
      })

      if (!removed) {
        return state
      }

      return this.fromPlainRecords({
        version: 1,
        updatedAt: nowIso(),
        secretEncoding: this.secretCodec.encoding,
        credentials: sortCredentials(credentials)
      })
    })

    return { ok: removed }
  }

  private async readState(): Promise<StoredCredentialState> {
    await ensureAppDataLayout(this.paths)
    const raw = await this.repository.read()
    const normalized = this.normalizeState(raw)

    if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
      await this.repository.write(normalized)
    }

    return normalized
  }

  private async updateState(
    mutator: (
      state: StoredCredentialState
    ) => StoredCredentialState | Promise<StoredCredentialState>
  ): Promise<StoredCredentialState> {
    await ensureAppDataLayout(this.paths)

    return this.repository.update(async (raw) => {
      const normalized = this.normalizeState(raw)
      return this.normalizeState(await mutator(normalized))
    })
  }

  private normalizeState(raw: StoredCredentialState | null | undefined): StoredCredentialState {
    const fallback = createDefaultState(this.secretCodec.encoding)
    const source = raw ?? fallback
    const credentials = (source.credentials ?? [])
      .filter(isStoredCredentialRecord)
      .map((credential, index) => {
        const sourcePassword =
          'passwordSecret' in credential
            ? credential.passwordSecret
            : (credential as StoredCredentialRecord & { password?: string }).password || ''

        return {
          id: credential.id || randomUUID(),
          service: sanitizeText(credential.service) || '未命名服务',
          url: sanitizeText(credential.url),
          account: sanitizeText(credential.account),
          passwordSecret: sourcePassword,
          passwordEncoding: credential.passwordEncoding || source.secretEncoding || 'plain',
          extra: sanitizeLines(credential.extra),
          order: Number.isFinite(credential.order) ? credential.order : index,
          createdAt: credential.createdAt || source.updatedAt || fallback.updatedAt,
          updatedAt: credential.updatedAt || source.updatedAt || fallback.updatedAt
        }
      })

    return {
      version: 1,
      updatedAt: source.updatedAt || fallback.updatedAt,
      secretEncoding: source.secretEncoding || this.secretCodec.encoding,
      credentials: this.fromPlainRecords({
        version: 1,
        updatedAt: source.updatedAt || fallback.updatedAt,
        secretEncoding: this.secretCodec.encoding,
        credentials: sortCredentials(this.toPlainRecords({ ...source, credentials }))
      }).credentials
    }
  }

  private toPlainRecords(state: StoredCredentialState): CredentialRecord[] {
    return sortCredentials(
      (state.credentials ?? []).map((credential) => ({
        id: credential.id,
        service: credential.service,
        url: credential.url,
        account: credential.account,
        password:
          credential.passwordEncoding === this.secretCodec.encoding
            ? this.safeDecode(credential.passwordSecret)
            : credential.passwordSecret,
        extra: credential.extra,
        order: credential.order,
        createdAt: credential.createdAt,
        updatedAt: credential.updatedAt
      }))
    )
  }

  private fromPlainRecords(state: {
    version: number
    updatedAt: string
    secretEncoding: PasswordEncoding
    credentials: CredentialRecord[]
  }): StoredCredentialState {
    return {
      version: state.version,
      updatedAt: state.updatedAt,
      secretEncoding: this.secretCodec.encoding,
      credentials: sortCredentials(state.credentials).map((credential) => ({
        id: credential.id,
        service: credential.service,
        url: credential.url,
        account: credential.account,
        passwordSecret: this.secretCodec.encode(credential.password),
        passwordEncoding: this.secretCodec.encoding,
        extra: credential.extra,
        order: credential.order,
        createdAt: credential.createdAt,
        updatedAt: credential.updatedAt
      }))
    }
  }

  private toModuleState(state: StoredCredentialState): CredentialModuleState {
    return {
      storageFile: this.paths.files.credentials,
      updatedAt: state.updatedAt,
      secretEncoding: this.secretCodec.encoding,
      credentials: this.toPlainRecords(state)
    }
  }

  private safeDecode(secret: string): string {
    try {
      return this.secretCodec.decode(secret)
    } catch {
      return ''
    }
  }
}
