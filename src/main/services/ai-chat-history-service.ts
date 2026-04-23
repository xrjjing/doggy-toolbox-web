import type {
  AiChatHistoryState,
  AiChatMessage,
  AiChatSessionRecord,
  AiChatSessionSummary,
  AiProviderKind,
  AiSessionPhase,
  AiSessionRuntime,
  AiStreamEvent,
  AiToolCallSummary,
  AiUsageSummary
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

function sanitizePhase(value: unknown): AiSessionPhase {
  return value === 'starting' ||
    value === 'streaming' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'cancelled'
    ? value
    : 'idle'
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

function sanitizeRuntime(value: unknown): AiSessionRuntime | undefined {
  if (!value || typeof value !== 'object') return undefined
  const runtime = value as Partial<AiSessionRuntime>
  const transport = runtime.transport === 'claude-agent-sdk' ? 'claude-agent-sdk' : 'codex-sdk'
  const workingDirectory = sanitizeText(runtime.workingDirectory)
  return {
    transport,
    workingDirectory,
    model: sanitizeText(runtime.model) || undefined,
    baseUrl: sanitizeText(runtime.baseUrl) || undefined,
    configPath: sanitizeText(runtime.configPath) || undefined,
    authPath: sanitizeText(runtime.authPath) || undefined,
    serviceTier: sanitizeText(runtime.serviceTier) || undefined,
    approvalPolicy: sanitizeText(runtime.approvalPolicy) || undefined,
    sandboxMode: sanitizeText(runtime.sandboxMode) || undefined,
    providerSessionId: sanitizeText(runtime.providerSessionId) || undefined
  }
}

function sanitizeUsage(value: unknown): AiUsageSummary | undefined {
  if (!value || typeof value !== 'object') return undefined
  const usage = value as Partial<AiUsageSummary>
  const inputTokens = Number(usage.inputTokens)
  const outputTokens = Number(usage.outputTokens)
  const totalCostUsd = Number(usage.totalCostUsd)
  return {
    inputTokens: Number.isFinite(inputTokens) ? inputTokens : undefined,
    outputTokens: Number.isFinite(outputTokens) ? outputTokens : undefined,
    totalCostUsd: Number.isFinite(totalCostUsd) ? totalCostUsd : undefined
  }
}

function sanitizeTools(value: unknown): AiToolCallSummary[] {
  if (!Array.isArray(value)) return []
  const result: AiToolCallSummary[] = []

  for (const tool of value) {
    if (!tool || typeof tool !== 'object') continue
    const record = tool as Partial<AiToolCallSummary>
    const id = sanitizeText(record.id)
    const name = sanitizeText(record.name)
    if (!id || !name) continue
    result.push({
      id,
      name,
      status:
        record.status === 'start' || record.status === 'error' || record.status === 'done'
          ? record.status
          : 'done',
      text: sanitizeMultiline(record.text) || undefined
    })
  }

  return result
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
    phase: record.phase,
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
        phase: sanitizePhase(session.phase),
        createdAt: session.createdAt || timestamp,
        updatedAt: session.updatedAt || timestamp,
        messages: sanitizeMessages(session.messages),
        output: sanitizeMultiline(session.output),
        thinking: sanitizeMultiline(session.thinking),
        tools: sanitizeTools(session.tools),
        runtime: sanitizeRuntime(session.runtime),
        usage: sanitizeUsage(session.usage),
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
      phase: 'starting',
      createdAt: timestamp,
      updatedAt: timestamp,
      messages: sanitizeMessages(input.messages),
      output: '',
      thinking: '',
      tools: []
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

  async applyEvent(event: AiStreamEvent): Promise<void> {
    const normalizedId = sanitizeText(event.sessionId)
    if (!normalizedId) return
    const timestamp = nowIso()

    await this.updateState((state) => ({
      ...state,
      updatedAt: timestamp,
      sessions: state.sessions.map((session) => {
        if (session.id !== normalizedId) {
          return session
        }

        if (event.type === 'start') {
          return {
            ...session,
            phase: 'starting',
            runtime: event.runtime,
            updatedAt: timestamp
          }
        }

        if (event.type === 'status') {
          return {
            ...session,
            phase: event.phase,
            updatedAt: timestamp
          }
        }

        if (event.type === 'delta') {
          return {
            ...session,
            phase: 'streaming',
            output: session.output + event.text,
            updatedAt: timestamp
          }
        }

        if (event.type === 'thinking') {
          return {
            ...session,
            phase: 'streaming',
            thinking: session.thinking + event.text,
            updatedAt: timestamp
          }
        }

        if (event.type === 'tool') {
          const nextTools = [
            ...session.tools.filter((tool) => tool.id !== event.toolId),
            {
              id: event.toolId,
              name: event.name,
              status: event.status,
              text: sanitizeMultiline(event.text)
            }
          ]
          return {
            ...session,
            phase: 'streaming',
            tools: nextTools,
            updatedAt: timestamp
          }
        }

        if (event.type === 'usage') {
          return {
            ...session,
            usage: {
              inputTokens: event.inputTokens,
              outputTokens: event.outputTokens,
              totalCostUsd: event.totalCostUsd
            },
            updatedAt: timestamp
          }
        }

        if (event.type === 'session-ref') {
          return {
            ...session,
            runtime: {
              ...(session.runtime ?? {
                transport: session.provider === 'claude-code' ? 'claude-agent-sdk' : 'codex-sdk',
                workingDirectory: session.workingDirectory
              }),
              providerSessionId: event.providerSessionId
            },
            updatedAt: timestamp
          }
        }

        if (event.type === 'error') {
          return {
            ...session,
            phase: 'failed',
            errorMessage: sanitizeText(event.message) || undefined,
            updatedAt: timestamp
          }
        }

        if (event.type === 'done') {
          return {
            ...session,
            phase: session.status === 'cancelled' ? 'cancelled' : 'completed',
            updatedAt: timestamp
          }
        }

        return session
      })
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
              phase: status === 'done' ? 'completed' : status === 'error' ? 'failed' : 'cancelled',
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
