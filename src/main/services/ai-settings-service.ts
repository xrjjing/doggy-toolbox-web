import type {
  AiFeatureSettings,
  AiSettings,
  AiSettingsSaveInput,
  AiSettingsState
} from '../../shared/ipc-contract'
import { ensureAppDataLayout, resolveAppDataPaths } from './app-data'
import { JsonFileRepository } from './json-repository'

type StoredAiSettingsState = {
  version: number
  updatedAt: string
  settings: AiSettings
}

function nowIso(): string {
  return new Date().toISOString()
}

function sanitizeText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\r/g, '').trim() : ''
}

function createDefaultFeatures(): AiFeatureSettings {
  return {
    'ai-chat': true,
    tools: true,
    http: true,
    commands: true,
    prompts: true,
    nodes: true
  }
}

export function createDefaultAiSettings(): AiSettings {
  return {
    workingDirectory: '',
    systemPrompt: '请基于当前工具输入、输出和异常上下文，先解释结果，再指出风险和下一步建议。',
    globalEnabled: true,
    features: createDefaultFeatures()
  }
}

function createDefaultState(): StoredAiSettingsState {
  return {
    version: 1,
    updatedAt: nowIso(),
    settings: createDefaultAiSettings()
  }
}

function normalizeFeatures(input: Partial<AiFeatureSettings> | undefined): AiFeatureSettings {
  const defaults = createDefaultFeatures()
  return {
    'ai-chat': input?.['ai-chat'] ?? defaults['ai-chat'],
    tools: input?.tools ?? defaults.tools,
    http: input?.http ?? defaults.http,
    commands: input?.commands ?? defaults.commands,
    prompts: input?.prompts ?? defaults.prompts,
    nodes: input?.nodes ?? defaults.nodes
  }
}

function normalizeSettings(input: Partial<AiSettings> | undefined): AiSettings {
  const defaults = createDefaultAiSettings()
  return {
    workingDirectory: sanitizeText(input?.workingDirectory),
    systemPrompt: sanitizeText(input?.systemPrompt) || defaults.systemPrompt,
    globalEnabled:
      typeof input?.globalEnabled === 'boolean' ? input.globalEnabled : defaults.globalEnabled,
    features: normalizeFeatures(input?.features)
  }
}

function normalizeState(raw: StoredAiSettingsState | null | undefined): StoredAiSettingsState {
  const fallback = createDefaultState()
  const source = raw ?? fallback
  return {
    version: 1,
    updatedAt: sanitizeText(source.updatedAt) || fallback.updatedAt,
    settings: normalizeSettings(source.settings)
  }
}

/**
 * AI 设置服务承接“本机 SDK 路线”的持久化配置。
 * 它只保存 SDK 入口真正会消费的默认配置，不保存 provider token 或第三方 HTTP 配置。
 */
export class AiSettingsService {
  private readonly paths
  private readonly repository

  constructor(rootDir: string) {
    this.paths = resolveAppDataPaths(rootDir)
    this.repository = new JsonFileRepository<StoredAiSettingsState>(
      this.paths.files.aiSettings,
      createDefaultState
    )
  }

  async getState(): Promise<AiSettingsState> {
    const state = await this.readState()
    return {
      storageFile: this.paths.files.aiSettings,
      updatedAt: state.updatedAt,
      settings: state.settings
    }
  }

  async saveSettings(input: AiSettingsSaveInput): Promise<AiSettingsState> {
    const nextState = await this.updateState((state) => ({
      ...state,
      updatedAt: nowIso(),
      settings: normalizeSettings({
        ...state.settings,
        ...input,
        features: {
          ...state.settings.features,
          ...(input.features ?? {})
        }
      })
    }))

    return {
      storageFile: this.paths.files.aiSettings,
      updatedAt: nextState.updatedAt,
      settings: nextState.settings
    }
  }

  async exportBackupSection(): Promise<Pick<AiSettingsState, 'settings'>> {
    const state = await this.readState()
    return {
      settings: state.settings
    }
  }

  async restoreBackupSection(section: Pick<AiSettingsState, 'settings'>): Promise<AiSettingsState> {
    const restored = normalizeState({
      version: 1,
      updatedAt: nowIso(),
      settings: section.settings
    })
    await ensureAppDataLayout(this.paths)
    await this.repository.write(restored)
    return {
      storageFile: this.paths.files.aiSettings,
      updatedAt: restored.updatedAt,
      settings: restored.settings
    }
  }

  private async readState(): Promise<StoredAiSettingsState> {
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
      state: StoredAiSettingsState
    ) => StoredAiSettingsState | Promise<StoredAiSettingsState>
  ): Promise<StoredAiSettingsState> {
    await ensureAppDataLayout(this.paths)
    return this.repository.update(async (raw) => {
      const normalized = normalizeState(raw)
      return normalizeState(await mutator(normalized))
    })
  }
}
