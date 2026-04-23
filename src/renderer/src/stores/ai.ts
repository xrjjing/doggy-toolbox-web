import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  AiChatHistoryState,
  AiChatSessionRecord,
  AiProviderKind,
  AiStreamEvent
} from '@shared/ipc-contract'

export const useAiStore = defineStore('ai', () => {
  const historyState = ref<AiChatHistoryState | null>(null)
  const activeSession = ref<AiChatSessionRecord | null>(null)
  const provider = ref<AiProviderKind>('codex')
  const prompt = ref('请用三句话说明 doggy-toolbox-web 当前迁移状态。')
  const running = ref(false)
  let unsubscribe: (() => void) | null = null

  const sessions = computed(() => historyState.value?.sessions ?? [])
  const activeSessionId = computed(() => activeSession.value?.id ?? '')
  const output = computed(() => activeSession.value?.output ?? '')

  function handleStreamEvent(event: AiStreamEvent): void {
    if (event.sessionId !== activeSessionId.value) return

    if (event.type === 'delta' || event.type === 'thinking') {
      if (activeSession.value) {
        activeSession.value = {
          ...activeSession.value,
          output: activeSession.value.output + event.text
        }
      }
      return
    }

    if (event.type === 'error' || event.type === 'done') {
      running.value = false
      void Promise.all([loadHistory(), loadSession(event.sessionId)])
    }
  }

  async function loadHistory(): Promise<void> {
    historyState.value = await window.doggy.getAiChatHistoryState()
  }

  async function loadSession(sessionId: string): Promise<void> {
    activeSession.value = await window.doggy.getAiChatSession(sessionId)
  }

  async function startChat(): Promise<string> {
    if (!prompt.value.trim()) {
      throw new Error('请输入要发送给 AI 的内容')
    }

    running.value = true
    unsubscribe?.()
    unsubscribe = window.doggy.onAiStreamEvent(handleStreamEvent)
    const result = await window.doggy.aiStartChat({
      provider: provider.value,
      title: prompt.value.trim().slice(0, 48),
      messages: [{ role: 'user', content: prompt.value }]
    })
    await loadSession(result.sessionId)
    await loadHistory()
    return result.sessionId
  }

  async function cancelChat(): Promise<void> {
    if (!activeSessionId.value) return
    await window.doggy.aiCancelChat(activeSessionId.value)
    running.value = false
    await Promise.all([loadHistory(), loadSession(activeSessionId.value)])
  }

  function setPrompt(value: string): void {
    prompt.value = value
  }

  function setProvider(value: AiProviderKind): void {
    provider.value = value
  }

  function disposeStream(): void {
    unsubscribe?.()
    unsubscribe = null
  }

  return {
    historyState,
    activeSession,
    provider,
    prompt,
    running,
    sessions,
    activeSessionId,
    output,
    loadHistory,
    loadSession,
    startChat,
    cancelChat,
    setPrompt,
    setProvider,
    disposeStream
  }
})
