import { randomUUID } from 'node:crypto'
import type {
  CredentialImportInput,
  CredentialImportResult,
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

/**
 * 凭证落盘时不直接保存明文密码，而是保存带编码方式的 secret。
 * 这样主进程可以按当前机器能力切换 plain 或 safeStorage 编码。
 */
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

function splitBlocks(text: string): string[][] {
  const blocks: string[][] = []
  let buffer: string[] = []

  for (const rawLine of String(text ?? '').split('\n')) {
    const line = rawLine.replace(/\r/g, '').trimEnd()
    if (!line.trim()) {
      if (buffer.length > 0) {
        blocks.push(buffer)
        buffer = []
      }
      continue
    }
    buffer.push(line)
  }

  if (buffer.length > 0) {
    blocks.push(buffer)
  }

  return blocks
}

function parseCredentialBlock(
  lines: string[]
): Omit<CredentialRecord, 'id' | 'order' | 'createdAt' | 'updatedAt'> | null {
  if (lines.length === 0) {
    return null
  }

  const merged = lines.join(' ')
  if (merged.includes('||')) {
    const parts = merged.split('||').map((part) => part.trim())
    const serviceUrl = parts[0] ?? ''
    const urlMatch = serviceUrl.match(/https?:\/\/\S+/)
    const url = urlMatch?.[0] ?? ''
    const service = sanitizeText(serviceUrl.replace(url, '')) || sanitizeText(serviceUrl)

    if (!service) {
      return null
    }

    return {
      service: service.replace(/[.\s]+$/g, ''),
      url,
      account: sanitizeText(parts[1]),
      password: sanitizeText(parts[2]),
      extra: parts
        .slice(3)
        .map((part) => sanitizeText(part))
        .filter(Boolean)
    }
  }

  let service = sanitizeText(lines[0].replace(/[：:]\s*$/, ''))
  let url = ''
  let account = ''
  let password = ''
  const extra: string[] = []

  const firstUrlMatch = service.match(/https?:\/\/\S+/)
  if (firstUrlMatch?.[0]) {
    url = firstUrlMatch[0]
    service = sanitizeText(service.replace(url, ''))
  }

  for (const rawLine of lines.slice(1)) {
    const line = sanitizeText(rawLine)
    if (!line) continue

    const accountMatch = line.match(/^(账号|loginname|username|用户名?)[:：]\s*(.+)$/i)
    if (accountMatch) {
      account = sanitizeText(accountMatch[2])
      continue
    }

    const passwordMatch = line.match(/^(密码|password|pwd)[:：]\s*(.+)$/i)
    if (passwordMatch) {
      password = sanitizeText(passwordMatch[2])
      continue
    }

    const urlMatch = line.match(/https?:\/\/\S+/)
    if (urlMatch?.[0] && !url) {
      url = urlMatch[0]
      continue
    }

    if (!account) {
      account = line
      continue
    }
    if (!password) {
      password = line
      continue
    }
    extra.push(line)
  }

  if (!service) {
    return null
  }

  return { service, url, account, password, extra }
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

/**
 * 凭证服务是主进程中的安全边界。
 * renderer 只能拿到解码后的展示结果；真正的编码、解码和落盘都在这里完成。
 */
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
      // 先转成明文记录操作，再统一编码回存储结构，减少更新分支的心智负担。
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

  async importCredentials(input: CredentialImportInput): Promise<CredentialImportResult> {
    const parsedCredentials = splitBlocks(input.text)
      .map((block) => parseCredentialBlock(block))
      .filter(
        (
          credential
        ): credential is Omit<CredentialRecord, 'id' | 'order' | 'createdAt' | 'updatedAt'> =>
          Boolean(credential)
      )

    if (parsedCredentials.length === 0) {
      return { imported: 0, credentials: [] }
    }

    const timestamp = nowIso()
    let importedCredentials: CredentialImportResult['credentials'] = []

    await this.updateState((state) => {
      const credentials = this.toPlainRecords(state)
      importedCredentials = parsedCredentials.map((credential) => {
        const record: CredentialRecord = {
          id: randomUUID(),
          service: credential.service,
          url: credential.url,
          account: credential.account,
          password: credential.password,
          extra: credential.extra,
          order: credentials.reduce((maxOrder, item) => Math.max(maxOrder, item.order), -1) + 1,
          createdAt: timestamp,
          updatedAt: timestamp
        }
        credentials.push(record)
        return {
          service: record.service,
          url: record.url,
          account: record.account,
          password: record.password,
          extra: record.extra
        }
      })

      return this.fromPlainRecords({
        version: 1,
        updatedAt: timestamp,
        secretEncoding: this.secretCodec.encoding,
        credentials: sortCredentials(credentials)
      })
    })

    return {
      imported: importedCredentials.length,
      credentials: importedCredentials
    }
  }

  async reorderCredentials(credentialIds: string[]): Promise<{ ok: boolean }> {
    const normalizedIds = Array.from(
      new Set((credentialIds ?? []).map((id) => sanitizeText(id)).filter(Boolean))
    )

    await this.updateState((state) => {
      const credentials = this.toPlainRecords(state)
      const credentialMap = new Map(credentials.map((credential) => [credential.id, credential]))
      let nextOrder = 0

      for (const credentialId of normalizedIds) {
        const credential = credentialMap.get(credentialId)
        if (!credential) continue
        credentialMap.set(credentialId, {
          ...credential,
          order: nextOrder++,
          updatedAt: nowIso()
        })
      }

      for (const credential of sortCredentials(credentials)) {
        if (normalizedIds.includes(credential.id)) continue
        credentialMap.set(credential.id, {
          ...credential,
          order: nextOrder++,
          updatedAt: nowIso()
        })
      }

      return this.fromPlainRecords({
        version: 1,
        updatedAt: nowIso(),
        secretEncoding: this.secretCodec.encoding,
        credentials: sortCredentials([...credentialMap.values()])
      })
    })

    return { ok: true }
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

  async exportBackupSection(): Promise<Pick<CredentialModuleState, 'credentials'>> {
    const state = await this.readState()
    return {
      credentials: this.toPlainRecords(state)
    }
  }

  async restoreBackupSection(
    section: Pick<CredentialModuleState, 'credentials'>
  ): Promise<CredentialModuleState> {
    const restored = this.fromPlainRecords({
      version: 1,
      updatedAt: nowIso(),
      secretEncoding: this.secretCodec.encoding,
      credentials: section.credentials ?? []
    })
    await ensureAppDataLayout(this.paths)
    await this.repository.write(this.normalizeState(restored))
    return this.getState()
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
      // 统一走“解码 -> 归一化 -> 重新编码”，收敛历史遗留的不同格式。
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
          // 只有编码方式匹配当前 codec 时才 decode，否则保留原值兼容历史数据。
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
      // 单条凭证损坏不能拖垮整个模块读取。
      return ''
    }
  }
}
