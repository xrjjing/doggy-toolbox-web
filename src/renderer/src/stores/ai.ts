import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  AiFeatureModuleId,
  AiChatHistoryState,
  AiChatSessionRecord,
  AiProviderKind,
  AiSessionPhase,
  AiStreamEvent
} from '@shared/ipc-contract'
import { useAiSettingsStore } from './ai-settings'

/**
 * AI 会话 store。
 * 这里同时维护两条状态链：
 * 1. historyState / activeSession：来自主进程落盘后的稳定快照。
 * 2. running / stream 事件：来自当前会话的即时流式增量。
 * 这样页面既能实时显示输出，又能在 done/error 后回到主进程保存的最终结果。
 */

type StartChatOptions = {
  provider?: AiProviderKind
  prompt?: string
  title?: string
  workingDirectory?: string
  moduleId?: AiFeatureModuleId
}

export const useAiStore = defineStore('ai', () => {
  const aiSettingsStore = useAiSettingsStore()
  const historyState = ref<AiChatHistoryState | null>(null)
  const activeSession = ref<AiChatSessionRecord | null>(null)
  const provider = ref<AiProviderKind>('codex')
  const prompt = ref('')
  const running = ref(false)
  let unsubscribe: (() => void) | null = null

  const sessions = computed(() => historyState.value?.sessions ?? [])
  const activeSessionId = computed(() => activeSession.value?.id ?? '')
  const output = computed(() => activeSession.value?.output ?? '')
  const thinking = computed(() => activeSession.value?.thinking ?? '')
  const tools = computed(() => activeSession.value?.tools ?? [])
  const phase = computed<AiSessionPhase>(() => activeSession.value?.phase ?? 'idle')
  const runtime = computed(() => activeSession.value?.runtime)
  const usage = computed(() => activeSession.value?.usage)

  function handleStreamEvent(event: AiStreamEvent): void {
    // 只消费当前激活会话的流式事件，避免列表切换时旧会话继续污染面板。
    if (event.sessionId !== activeSessionId.value) return

    if (event.type === 'delta') {
      if (activeSession.value) {
        activeSession.value = {
          ...activeSession.value,
          output: activeSession.value.output + event.text,
          phase: 'streaming'
        }
      }
      return
    }

    if (event.type === 'thinking') {
      // thinking 和 output 分开积累，方便 UI 分区展示和历史回看。
      if (activeSession.value) {
        activeSession.value = {
          ...activeSession.value,
          thinking: activeSession.value.thinking + event.text,
          phase: 'streaming'
        }
      }
      return
    }

    if (event.type === 'tool' && activeSession.value) {
      // 同一个 toolId 可能多次上报状态，先按 id 去重再插入最新快照。
      activeSession.value = {
        ...activeSession.value,
        phase: 'streaming',
        tools: [
          ...activeSession.value.tools.filter((tool) => tool.id !== event.toolId),
          {
            id: event.toolId,
            name: event.name,
            status: event.status,
            text: event.text
          }
        ]
      }
      return
    }

    if (event.type === 'usage' && activeSession.value) {
      // usage 不是增量文本，而是覆盖式统计，始终以最后一次上报为准。
      activeSession.value = {
        ...activeSession.value,
        usage: {
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          totalCostUsd: event.totalCostUsd
        }
      }
      return
    }

    if (event.type === 'start' && activeSession.value) {
      // start 会把运行时快照挂到会话上，供历史面板展示 provider / transport 信息。
      activeSession.value = {
        ...activeSession.value,
        runtime: event.runtime,
        phase: 'starting'
      }
      return
    }

    if (event.type === 'status' && activeSession.value) {
      // status 只更新阶段，不重复改写其他字段，避免覆盖前面已累计的输出。
      activeSession.value = {
        ...activeSession.value,
        phase: event.phase
      }
      return
    }

    if (event.type === 'session-ref' && activeSession.value) {
      // providerSessionId 往往晚于 start 才拿到，因此这里做一次补写。
      // 若 runtime 尚未初始化，就按 provider 推断 transport，保证历史记录字段完整。
      activeSession.value = {
        ...activeSession.value,
        runtime: {
          ...(activeSession.value.runtime ?? {
            transport:
              activeSession.value.provider === 'claude-code' ? 'claude-agent-sdk' : 'codex-sdk',
            workingDirectory: activeSession.value.workingDirectory
          }),
          providerSessionId: event.providerSessionId
        }
      }
      return
    }

    if (event.type === 'error' || event.type === 'done') {
      // 结束态统一回源主进程，拿到最终持久化快照，避免 renderer 只停留在临时流数据。
      running.value = false
      void Promise.all([loadHistory(), loadSession(event.sessionId)])
    }
  }

  /**
   * 刷新会话列表与统计快照。
   * 这个接口只取主进程已保存的数据，不负责重建当前流式内容。
   */
  async function loadHistory(): Promise<void> {
    historyState.value = await window.doggy.getAiChatHistoryState()
  }

  /**
   * 按 sessionId 拉取完整会话。
   * running 的判断不只看 status，还会排除已收口的 phase，避免“历史中的运行中残留态”误导 UI。
   */
  async function loadSession(sessionId: string): Promise<void> {
    activeSession.value = await window.doggy.getAiChatSession(sessionId)
    running.value = Boolean(
      activeSession.value?.status === 'running' &&
      activeSession.value.phase !== 'completed' &&
      activeSession.value.phase !== 'failed' &&
      activeSession.value.phase !== 'cancelled'
    )
  }

  /**
   * 删除历史会话后立刻刷新列表。
   * 如果删的是当前激活会话，renderer 也同步清空画布，避免继续展示已不存在的快照。
   */
  async function deleteSession(sessionId: string): Promise<boolean> {
    const ok = await window.doggy.deleteAiChatSession(sessionId)
    if (ok && activeSessionId.value === sessionId) {
      clearActiveSession()
    }
    await loadHistory()
    return ok
  }

  /**
   * 发起一次新的 AI 会话。
   * 调用链是：renderer 组装 prompt -> preload IPC -> main bridge 启动 -> stream 事件实时回传 ->
   * done/error 后再次 loadSession/loadHistory 拿最终快照。
   */
  async function startChat(options: StartChatOptions = {}): Promise<string> {
    const providerToUse = options.provider ?? provider.value
    const moduleId = options.moduleId ?? 'ai-chat'
    if (!aiSettingsStore.hasLoaded) {
      await aiSettingsStore.load()
    }
    aiSettingsStore.assertFeatureEnabled(moduleId, providerToUse)

    const rawPrompt = (options.prompt ?? prompt.value).trim()
    if (!rawPrompt) {
      throw new Error('请输入要发送给 AI 的内容')
    }
    const messagesToSend = aiSettingsStore.buildMessages(rawPrompt)

    try {
      provider.value = providerToUse
      prompt.value = ''
      running.value = true
      // 每次新开会话前先解除旧订阅，避免重复监听导致同一事件被处理多次。
      unsubscribe?.()
      unsubscribe = window.doggy.onAiStreamEvent(handleStreamEvent)
      const result = await window.doggy.aiStartChat({
        provider: providerToUse,
        title: options.title ?? rawPrompt.slice(0, 48),
        workingDirectory: aiSettingsStore.resolveWorkingDirectory(options.workingDirectory),
        messages: messagesToSend
      })
      await loadSession(result.sessionId)
      await loadHistory()
      return result.sessionId
    } catch (error) {
      prompt.value = rawPrompt
      running.value = false
      throw error
    }
  }

  /**
   * 取消当前活动会话，并立即回源刷新。
   * 这样 UI 不需要猜测取消后的 phase，而是直接使用主进程确认过的最终状态。
   */
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

  function clearActiveSession(): void {
    activeSession.value = null
    running.value = false
  }

  /**
   * 页面卸载或切换场景时释放流监听，防止悬挂订阅继续接收事件。
   */
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
    thinking,
    tools,
    phase,
    runtime,
    usage,
    loadHistory,
    loadSession,
    deleteSession,
    startChat,
    cancelChat,
    setPrompt,
    setProvider,
    clearActiveSession,
    disposeStream
  }
})
