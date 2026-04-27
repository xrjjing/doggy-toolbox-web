<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  NButton,
  NCard,
  NCollapseTransition,
  NEmpty,
  NIcon,
  NInput,
  NModal,
  NSlider,
  NRadioButton,
  NRadioGroup,
  NStatistic,
  NTag,
  useMessage
} from 'naive-ui'
import {
  ChevronDownOutline,
  ChevronUpOutline,
  SettingsOutline,
  SparklesOutline,
  StopCircleOutline
} from '@vicons/ionicons5'
import AiSettingsView from '@renderer/features/ai/AiSettingsView.vue'
import { useAiSettingsStore } from '@renderer/stores/ai-settings'
import { useAiStore } from '@renderer/stores/ai'

const message = useMessage()
const aiStore = useAiStore()
const aiSettingsStore = useAiSettingsStore()
const showSettingsModal = ref(false)
const showThinking = ref(false)
const reasoningDepth = ref(70)

const providerLabel = computed(() =>
  aiStore.provider === 'codex' ? 'Codex SDK' : 'Claude Code SDK'
)

const phaseLabel = computed(() => {
  const labels = {
    idle: '空闲',
    starting: '启动中',
    streaming: '思考 / 输出中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消'
  } as const
  return labels[aiStore.phase]
})

const thinkingPreview = computed(() => {
  if (!aiStore.thinking.trim()) return '暂无思考内容'
  return aiStore.thinking.split('\n').slice(0, 3).join(' ').slice(0, 96)
})

const visibleMessages = computed(() => {
  const sessionMessages = aiStore.activeSession?.messages ?? []
  const draft = aiStore.prompt.trim()
  const bubbles = sessionMessages
    .filter((item) => item.role !== 'system')
    .map((item, index) => ({
      id: `session-${index}-${item.role}`,
      role: item.role,
      content: item.content
    }))

  if (draft && !aiStore.activeSession) {
    bubbles.push({
      id: 'draft-user',
      role: 'user',
      content: draft
    })
  }

  if (aiStore.output.trim()) {
    bubbles.push({
      id: 'assistant-output',
      role: 'assistant',
      content: aiStore.output
    })
  }

  return bubbles
})

function formatUpdatedAt(value?: string): string {
  if (!value) return '等待开始'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

async function startChat(): Promise<void> {
  try {
    await aiStore.startChat({ moduleId: 'ai-chat' })
    showThinking.value = true
  } catch (error) {
    aiStore.running = false
    message.error(error instanceof Error ? error.message : String(error))
  }
}

async function cancelChat(): Promise<void> {
  await aiStore.cancelChat()
}

function toggleThinking(): void {
  showThinking.value = !showThinking.value
}

function openSettingsModal(): void {
  showSettingsModal.value = true
}

onMounted(async () => {
  if (!aiSettingsStore.hasLoaded) {
    await aiSettingsStore.load()
  }
  await aiStore.loadHistory()
  if (aiStore.sessions[0]) {
    await aiStore.loadSession(aiStore.sessions[0].id)
  }
})

onBeforeUnmount(() => {
  aiStore.disposeStream()
})
</script>

<template>
  <div class="ai-workspace">
    <section class="ai-toolbar-shell">
      <div class="ai-toolbar">
        <div class="ai-toolbar-left">
          <div class="ai-model-selector">
            <span class="ai-model-glyph">AI</span>
            <div>
              <strong>{{ providerLabel }}</strong>
              <p>本机 SDK 工作台</p>
            </div>
          </div>

          <NRadioGroup :value="aiStore.provider" @update:value="aiStore.setProvider">
            <NRadioButton value="codex">Codex</NRadioButton>
            <NRadioButton value="claude-code">Claude</NRadioButton>
          </NRadioGroup>
        </div>

        <div class="ai-toolbar-actions">
          <div class="ai-depth-control">
            <span class="eyebrow">depth</span>
            <NSlider v-model:value="reasoningDepth" :step="5" :min="0" :max="100" />
          </div>
          <div class="ai-toolbar-status">
            <span class="eyebrow">status</span>
            <strong>{{ phaseLabel }}</strong>
          </div>
          <NButton secondary round @click="openSettingsModal">
            <template #icon>
              <NIcon :component="SettingsOutline" />
            </template>
            AI 设置
          </NButton>
        </div>
      </div>

      <div class="ai-meta-ribbon">
        <div class="ai-meta-chip">
          <span>工作目录</span>
          <strong>{{
            aiStore.runtime?.workingDirectory || aiSettingsStore.settings.workingDirectory || '跟随当前项目'
          }}</strong>
        </div>
        <div class="ai-meta-chip">
          <span>模型</span>
          <strong>{{ aiStore.runtime?.model || '跟随本机配置' }}</strong>
        </div>
        <div class="ai-meta-chip">
          <span>会话状态</span>
          <strong>{{ aiStore.activeSession?.status || '尚未开始' }}</strong>
        </div>
      </div>
    </section>

    <div class="ai-chat-shell">
      <section class="ai-chat-canvas">
        <div class="ai-chat-headline">
          <strong>消息流</strong>
          <NTag size="small" :bordered="false">{{ visibleMessages.length }} 条</NTag>
        </div>
        <div v-if="visibleMessages.length > 0" class="chat-area">
          <article
            v-for="item in visibleMessages"
            :key="item.id"
            class="bubble"
            :class="item.role === 'assistant' ? 'bubble-ai' : 'bubble-user'"
          >
            {{ item.content }}
          </article>
        </div>
        <div v-else class="chat-area chat-area--empty">
          <NEmpty description="输入一个问题，让本机 SDK 开始工作" />
        </div>

        <div class="floating-input-shell">
          <div class="floating-input">
            <NInput
              :value="aiStore.prompt"
              type="textarea"
              class="ai-chat-input"
              :autosize="{ minRows: 1, maxRows: 4 }"
              placeholder="描述你的开发难题，或让它解释当前项目状态..."
              @update:value="aiStore.setPrompt"
            />
            <div class="floating-input-actions">
              <NButton
                class="floating-send-btn"
                type="primary"
                circle
                :loading="aiStore.running"
                :disabled="!aiSettingsStore.isFeatureEnabled('ai-chat')"
                @click="startChat"
              >
                <template #icon>
                  <NIcon :component="SparklesOutline" />
                </template>
              </NButton>
              <NButton circle secondary :disabled="!aiStore.running" @click="cancelChat">
                <template #icon>
                  <NIcon :component="StopCircleOutline" />
                </template>
              </NButton>
            </div>
          </div>
        </div>
      </section>

      <div class="ai-chat-side">
        <NCard class="soft-card ai-thinking-card" :bordered="false">
          <template #header>
            <button class="ai-collapse-head" type="button" @click="toggleThinking">
              <div>
                <strong>思考过程</strong>
                <p>{{ thinkingPreview }}</p>
              </div>
              <NIcon :component="showThinking ? ChevronUpOutline : ChevronDownOutline" />
            </button>
          </template>

          <NCollapseTransition :show="showThinking">
            <pre class="stream-output is-thinking ai-thinking-output">{{
              aiStore.thinking || '等待模型输出思考过程...'
            }}</pre>
          </NCollapseTransition>
        </NCard>

        <NCard class="soft-card ai-runtime-snapshot-card" :bordered="false">
          <template #header>
            <div class="card-title-row">
              <strong>运行摘要</strong>
              <NTag size="small" :bordered="false">runtime</NTag>
            </div>
          </template>

          <div class="ai-runtime-grid ai-runtime-grid--compact">
            <NStatistic label="提供方" :value="aiStore.activeSession?.provider || aiStore.provider" />
            <NStatistic label="阶段" :value="phaseLabel" />
            <NStatistic label="输入 Tokens" :value="aiStore.usage?.inputTokens ?? 0" />
            <NStatistic label="输出 Tokens" :value="aiStore.usage?.outputTokens ?? 0" />
          </div>

          <div class="ai-runtime-summary-list">
            <div class="ai-runtime-summary-item">
              <span>默认系统提示</span>
              <strong>{{ aiSettingsStore.settings.systemPrompt || '未设置' }}</strong>
            </div>
            <div class="ai-runtime-summary-item">
              <span>最近更新</span>
              <strong>{{ formatUpdatedAt(aiStore.activeSession?.updatedAt) }}</strong>
            </div>
            <div class="ai-runtime-summary-item">
              <span>成本 USD</span>
              <strong>{{ aiStore.usage?.totalCostUsd ?? 0 }}</strong>
            </div>
            <div v-if="aiStore.activeSession?.errorMessage" class="ai-runtime-summary-item is-error">
              <span>错误</span>
              <strong>{{ aiStore.activeSession.errorMessage }}</strong>
            </div>
          </div>
        </NCard>
      </div>
    </div>
  </div>

  <NModal
    v-model:show="showSettingsModal"
    preset="card"
    title="AI 设置"
    class="ai-settings-modal"
    :style="{ width: 'min(920px, calc(100vw - 64px))' }"
  >
    <AiSettingsView />
  </NModal>
</template>
