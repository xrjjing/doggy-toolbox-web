import type {
  AiChatHistoryState,
  AiChatMessage,
  AiChatSessionRecord,
  AiChatSessionSummary,
  AiProviderKind
} from '../../shared/ipc-contract'
import { ensureAppDataLayout, resolveAppDataPaths } from './app-data'
import { JsonFileRepository } from './json-repository'

type StoredAiChatHistoryState = {
  version: number
  updatedAt: string
  sessions: AiChatSessionRecord[]
}

function nowIso(): string {
  return new Date().toISOString()
}

function sanitizeText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\r/g, '').trim() : ''
}

function sanitizeMultiline(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\r/g, '') : ''
}

function sanitizeProvider(value: unknown): AiProviderKind {
  return value === 'claude-code' ? 'claude-code' : 'codex'
}

function sanitizeMessages(messages: AiChatMessage[] | undefined): AiChatMessage[] {
  return (messages ?? [])
    .map((message) => ({
      role:
        message.role === 'system' || message.role === 'assistant' || message.role === 'user'
          ? message.role
          : 'user',
      content: sanitizeMultiline(message.content)
    }))
    .filter((message) => message.content.trim())
}

function summarize(record: AiChatSessionRecord): AiChatSessionSummary {
  const preview =
    sanitizeText(record.output) || sanitizeText(record.messages.at(-1)?.content) || '暂无内容'
  return {
    id: record.id,
    provider: record.provider,
    title: record.title,
    preview: preview.slice(0, 120),
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  }
}

function createDefaultState(): StoredAiChatHistoryState {
  return {
    version: 1,
    updatedAt: nowIso(),
    sessions: []
  }
}

function normalizeState(
  raw: StoredAiChatHistoryState | null | undefined
): StoredAiChatHistoryState {
  const fallback = createDefaultState()
  const source = raw ?? fallback
  const timestamp = source.updatedAt || fallback.updatedAt

  return {
    version: 1,
    updatedAt: timestamp,
    sessions: [...(source.sessions ?? [])]
      .filter((session): session is AiChatSessionRecord => Boolean(session?.id))
      .map((session) => ({
        id: session.id,
        provider: sanitizeProvider(session.provider),
        title: sanitizeText(session.title) || '未命名会话',
        workingDirectory: sanitizeText(session.workingDirectory),
        status:
          session.status === 'running' ||
          session.status === 'done' ||
          session.status === 'error' ||
          session.status === 'cancelled'
            ? session.status
            : 'done',
        createdAt: session.createdAt || timestamp,
        updatedAt: session.updatedAt || timestamp,
        messages: sanitizeMessages(session.messages),
        output: sanitizeMultiline(session.output),
        errorMessage: sanitizeText(session.errorMessage) || undefined
      }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }
}

export class AiChatHistoryService {
  private readonly paths
  private readonly repository

  constructor(rootDir: string) {
    this.paths = resolveAppDataPaths(rootDir)
    this.repository = new JsonFileRepository<StoredAiChatHistoryState>(
      this.paths.files.aiChatSessions,
      createDefaultState
    )
  }

  async getState(): Promise<AiChatHistoryState> {
    const state = await this.readState()
    return {
      storageFile: this.paths.files.aiChatSessions,
      updatedAt: state.updatedAt,
      sessions: state.sessions.map((session) => summarize(session))
    }
  }

  async getSession(sessionId: string): Promise<AiChatSessionRecord | null> {
    const normalizedId = sanitizeText(sessionId)
    if (!normalizedId) return null
    const state = await this.readState()
    return state.sessions.find((session) => session.id === normalizedId) ?? null
  }

  async createSession(input: {
    id: string
    provider: AiProviderKind
    title: string
    workingDirectory?: string
    messages: AiChatMessage[]
  }): Promise<AiChatSessionRecord> {
    const timestamp = nowIso()
    const record: AiChatSessionRecord = {
      id: input.id,
      provider: input.provider,
      title: sanitizeText(input.title) || '未命名会话',
      workingDirectory: sanitizeText(input.workingDirectory),
      status: 'running',
      createdAt: timestamp,
      updatedAt: timestamp,
      messages: sanitizeMessages(input.messages),
      output: ''
    }

    await this.updateState((state) => ({
      ...state,
      updatedAt: timestamp,
      sessions: [record, ...state.sessions.filter((session) => session.id !== record.id)]
    }))

    return record
  }

  async appendOutput(sessionId: string, text: string): Promise<void> {
    const normalizedId = sanitizeText(sessionId)
    if (!normalizedId || !text) return
    const timestamp = nowIso()
    await this.updateState((state) => ({
      ...state,
      updatedAt: timestamp,
      sessions: state.sessions.map((session) =>
        session.id === normalizedId
          ? {
              ...session,
              output: session.output + text,
              updatedAt: timestamp
            }
          : session
      )
    }))
  }

  async finishSession(
    sessionId: string,
    status: 'done' | 'error' | 'cancelled',
    errorMessage?: string
  ): Promise<void> {
    const normalizedId = sanitizeText(sessionId)
    if (!normalizedId) return
    const timestamp = nowIso()

    await this.updateState((state) => ({
      ...state,
      updatedAt: timestamp,
      sessions: state.sessions.map((session) =>
        session.id === normalizedId
          ? {
              ...session,
              status,
              updatedAt: timestamp,
              errorMessage: sanitizeText(errorMessage) || undefined
            }
          : session
      )
    }))
  }

  private async readState(): Promise<StoredAiChatHistoryState> {
    await ensureAppDataLayout(this.paths)
    const raw = await this.repository.read()
    const normalized = normalizeState(raw)

    if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
      await this.repository.write(normalized)
    }

    return normalized
  }

  private async updateState(
    mutator: (
      state: StoredAiChatHistoryState
    ) => StoredAiChatHistoryState | Promise<StoredAiChatHistoryState>
  ): Promise<StoredAiChatHistoryState> {
    await ensureAppDataLayout(this.paths)

    return this.repository.update(async (raw) => {
      const normalized = normalizeState(raw)
      return normalizeState(await mutator(normalized))
    })
  }
}
