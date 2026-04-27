import { computed, onBeforeUnmount, ref } from 'vue'
import type {
  AiFeatureModuleId,
  AiProviderKind,
  AiSessionPhase,
  AiStreamEvent,
  AiSessionRuntime,
  AiUsageSummary
} from '@shared/ipc-contract'
import { useAiSettingsStore } from '@renderer/stores/ai-settings'

type StartReviewInput = {
  provider: AiProviderKind
  moduleId: AiFeatureModuleId
  title: string
  prompt: string
  workingDirectory?: string
}

export function useOneShotAiReview() {
  const aiSettingsStore = useAiSettingsStore()
  const sessionId = ref('')
  const provider = ref<AiProviderKind>('codex')
  const phase = ref<AiSessionPhase>('idle')
  const running = ref(false)
  const output = ref('')
  const thinking = ref('')
  const runtime = ref<AiSessionRuntime | undefined>()
  const usage = ref<AiUsageSummary | undefined>()
  const errorMessage = ref('')
  let unsubscribe: (() => void) | null = null

  const hasResult = computed(() => Boolean(sessionId.value || output.value || errorMessage.value))

  function reset(): void {
    output.value = ''
    thinking.value = ''
    runtime.value = undefined
    usage.value = undefined
    errorMessage.value = ''
    phase.value = 'idle'
  }

  function handleEvent(event: AiStreamEvent): void {
    if (event.sessionId !== sessionId.value) return

    if (event.type === 'start') {
      runtime.value = event.runtime
      phase.value = 'starting'
      return
    }

    if (event.type === 'delta') {
      output.value += event.text
      phase.value = 'streaming'
      return
    }

    if (event.type === 'thinking') {
      thinking.value += event.text
      phase.value = 'streaming'
      return
    }

    if (event.type === 'usage') {
      usage.value = {
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        totalCostUsd: event.totalCostUsd
      }
      return
    }

    if (event.type === 'status') {
      phase.value = event.phase
      return
    }

    if (event.type === 'done') {
      phase.value = 'completed'
      running.value = false
      return
    }

    if (event.type === 'error') {
      phase.value = 'failed'
      errorMessage.value = event.message
      running.value = false
    }
  }

  async function startReview(input: StartReviewInput): Promise<void> {
    if (!aiSettingsStore.hasLoaded) {
      await aiSettingsStore.load()
    }
    aiSettingsStore.assertFeatureEnabled(input.moduleId, input.provider)

    const rawPrompt = input.prompt.trim()
    if (!rawPrompt) {
      throw new Error('请输入要发送给 AI 的内容')
    }

    reset()
    provider.value = input.provider
    running.value = true
    unsubscribe?.()
    unsubscribe = window.doggy.onAiStreamEvent(handleEvent)

    try {
      const result = await window.doggy.aiStartChat({
        provider: input.provider,
        title: input.title,
        workingDirectory: aiSettingsStore.resolveWorkingDirectory(input.workingDirectory),
        messages: aiSettingsStore.buildMessages(rawPrompt)
      })
      sessionId.value = result.sessionId
      phase.value = 'starting'
    } catch (error) {
      running.value = false
      phase.value = 'failed'
      errorMessage.value = error instanceof Error ? error.message : String(error)
      throw error
    }
  }

  async function cancelReview(): Promise<void> {
    if (!sessionId.value) return
    await window.doggy.aiCancelChat(sessionId.value)
    running.value = false
    phase.value = 'cancelled'
  }

  onBeforeUnmount(() => {
    unsubscribe?.()
    unsubscribe = null
  })

  return {
    sessionId,
    provider,
    phase,
    running,
    output,
    thinking,
    runtime,
    usage,
    errorMessage,
    hasResult,
    startReview,
    cancelReview,
    reset
  }
}
