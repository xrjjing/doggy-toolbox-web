import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  AiChatMessage,
  AiFeatureModuleId,
  AiProviderKind,
  AiSettings,
  AiSettingsSaveInput,
  AiSettingsState
} from '@shared/ipc-contract'

const FALLBACK_SETTINGS: AiSettings = {
  workingDirectory: '',
  systemPrompt: '请基于当前工具输入、输出和异常上下文，先解释结果，再指出风险和下一步建议。',
  globalEnabled: true,
  features: {
    'ai-chat': true,
    tools: true,
    http: true,
    commands: true,
    prompts: true,
    nodes: true
  }
}

/**
 * AI 设置 store 承接主进程持久化的 SDK 配置。
 * 页面层可以直接消费 `settings`，但真正的可信来源始终是 main 里的 `AiSettingsService`。
 */
export const useAiSettingsStore = defineStore('ai-settings', () => {
  const state = ref<AiSettingsState | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const hasLoaded = ref(false)
  const draft = reactive<AiSettings>(structuredClone(FALLBACK_SETTINGS))

  const settings = computed(() => state.value?.settings ?? FALLBACK_SETTINGS)
  const storageFile = computed(() => state.value?.storageFile ?? '')
  const updatedAt = computed(() => state.value?.updatedAt ?? '')

  function hydrate(nextState: AiSettingsState): void {
    state.value = nextState
    hasLoaded.value = true
    Object.assign(draft, structuredClone(nextState.settings))
  }

  async function load(): Promise<void> {
    loading.value = true
    try {
      hydrate(await window.doggy.getAiSettingsState())
    } finally {
      loading.value = false
    }
  }

  async function save(input?: AiSettingsSaveInput): Promise<AiSettingsState> {
    saving.value = true
    try {
      const nextState = await window.doggy.saveAiSettings(
        input ?? {
          workingDirectory: draft.workingDirectory,
          systemPrompt: draft.systemPrompt,
          globalEnabled: draft.globalEnabled,
          features: draft.features
        }
      )
      hydrate(nextState)
      return nextState
    } finally {
      saving.value = false
    }
  }

  function setDraft<K extends keyof AiSettings>(key: K, value: AiSettings[K]): void {
    draft[key] = value
  }

  function setFeature(moduleId: AiFeatureModuleId, enabled: boolean): void {
    draft.features[moduleId] = enabled
  }

  function applyLoadedSettings(): void {
    Object.assign(draft, structuredClone(settings.value))
  }

  function isFeatureEnabled(moduleId: AiFeatureModuleId): boolean {
    return settings.value.globalEnabled && settings.value.features[moduleId] !== false
  }

  function assertFeatureEnabled(moduleId: AiFeatureModuleId, provider: AiProviderKind): void {
    if (!settings.value.globalEnabled) {
      throw new Error(
        `AI 总开关已关闭，当前不会发送到 ${provider === 'codex' ? 'Codex SDK' : 'Claude Code SDK'}`
      )
    }
    if (settings.value.features[moduleId] === false) {
      throw new Error(`模块 ${moduleId} 的 AI 入口已在设置页关闭`)
    }
  }

  /**
   * 模块发起 AI 会话时统一从这里取默认配置，避免工作目录和系统提示在多个页面各写一份。
   */
  function buildMessages(userPrompt: string): AiChatMessage[] {
    const systemPrompt = settings.value.systemPrompt.trim()
    const messages: AiChatMessage[] = []
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt })
    }
    if (userPrompt.trim()) {
      messages.push({ role: 'user', content: userPrompt.trim() })
    }
    return messages
  }

  function resolveWorkingDirectory(override?: string): string | undefined {
    return override?.trim() || settings.value.workingDirectory.trim() || undefined
  }

  return {
    state,
    loading,
    saving,
    hasLoaded,
    draft,
    settings,
    storageFile,
    updatedAt,
    load,
    save,
    setDraft,
    setFeature,
    applyLoadedSettings,
    isFeatureEnabled,
    assertFeatureEnabled,
    buildMessages,
    resolveWorkingDirectory
  }
})
