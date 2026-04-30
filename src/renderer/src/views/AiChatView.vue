<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  NButton,
  NCollapseTransition,
  NEmpty,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NModal,
  NPopconfirm,
  NSelect,
  NSlider,
  NRadioButton,
  NRadioGroup,
  NTag,
  useMessage
} from 'naive-ui'
import {
  AddOutline,
  ChatboxOutline,
  ChevronDownOutline,
  ChevronUpOutline,
  TrashOutline,
  ImageOutline,
  LibraryOutline,
  SettingsOutline,
  SparklesOutline,
  StopCircleOutline
} from '@vicons/ionicons5'
import AiSettingsView from '@renderer/features/ai/AiSettingsView.vue'
import { useAiSettingsStore } from '@renderer/stores/ai-settings'
import { useAiStore } from '@renderer/stores/ai'
import { usePromptsStore } from '@renderer/stores/prompts'
import { markdownToHtml } from '@renderer/features/tools/utils/core-legacy'
import { fillPromptTemplate } from '@shared/prompt-template-core'
import type { PromptTemplate, PromptVariable } from '@shared/ipc-contract'

const message = useMessage()
const aiStore = useAiStore()
const aiSettingsStore = useAiSettingsStore()
const promptsStore = usePromptsStore()
const showSettingsModal = ref(false)
const templateModalVisible = ref(false)
const reasoningDepth = ref(70)
const expandedThinkingIds = ref<Set<string>>(new Set())
const chatAreaRef = ref<HTMLElement | null>(null)
const selectedTemplateId = ref('')
const templateVariableValues = ref<Record<string, string>>({})

const templateOptions = computed(() =>
  promptsStore.templates.map((template) => ({
    label: template.title,
    value: template.id
  }))
)

const selectedTemplate = computed(
  () => promptsStore.templates.find((template) => template.id === selectedTemplateId.value) ?? null
)

const selectedTemplateVariables = computed(() => selectedTemplate.value?.variables ?? [])

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
  const bubbles = sessionMessages
    .filter((item) => item.role !== 'system')
    .map((item, index) => ({
      id: `session-${index}-${item.role}`,
      role: item.role,
      content: item.content,
      html: markdownToHtml(item.content),
      thinking: ''
    }))

  if (aiStore.output.trim()) {
    bubbles.push({
      id: 'assistant-output',
      role: 'assistant',
      content: aiStore.output,
      html: markdownToHtml(aiStore.output),
      thinking: aiStore.thinking
    })
  }

  return bubbles
})

function formatUpdatedAt(value?: string): string {
  if (!value) return '等待开始'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function newConversation(): void {
  aiStore.setPrompt('')
  aiStore.clearActiveSession()
  expandedThinkingIds.value = new Set()
}

async function selectSession(sessionId: string): Promise<void> {
  await aiStore.loadSession(sessionId)
  expandedThinkingIds.value = new Set()
  await scrollChatToBottom()
}

async function deleteSession(sessionId: string): Promise<void> {
  try {
    const ok = await aiStore.deleteSession(sessionId)
    message[ok ? 'success' : 'warning'](ok ? '会话记录已删除' : '未找到会话记录')
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

async function startChat(): Promise<void> {
  try {
    await aiStore.startChat({ moduleId: 'ai-chat' })
    expandedThinkingIds.value = new Set()
  } catch (error) {
    aiStore.running = false
    message.error(error instanceof Error ? error.message : String(error))
  }
}

async function cancelChat(): Promise<void> {
  await aiStore.cancelChat()
}

function toggleThinking(messageId: string): void {
  const next = new Set(expandedThinkingIds.value)
  if (next.has(messageId)) {
    next.delete(messageId)
  } else {
    next.add(messageId)
  }
  expandedThinkingIds.value = next
}

function isThinkingOpen(messageId: string): boolean {
  return expandedThinkingIds.value.has(messageId)
}

function openSettingsModal(): void {
  showSettingsModal.value = true
}

async function openTemplateModal(): Promise<void> {
  if (!promptsStore.hasLoaded) {
    await promptsStore.load()
  }
  selectedTemplateId.value = promptsStore.templates[0]?.id ?? ''
  hydrateTemplateVariables(selectedTemplate.value)
  templateModalVisible.value = true
}

function hydrateTemplateVariables(template: PromptTemplate | null): void {
  templateVariableValues.value = Object.fromEntries(
    (template?.variables ?? []).map((variable) => [variable.name, variable.defaultValue])
  )
}

function variableOptions(variable: PromptVariable): Array<{ label: string; value: string }> {
  return variable.options.map((option) => ({ label: option, value: option }))
}

function normalizeTemplateValues(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(templateVariableValues.value).map(([key, value]) => [key, String(value ?? '')])
  )
}

function applyTemplateToPrompt(): void {
  const template = selectedTemplate.value
  if (!template) {
    message.warning('请先选择一个 Prompt 模板')
    return
  }

  const values = normalizeTemplateValues()
  aiStore.setPrompt(fillPromptTemplate(template.content, values))
  templateModalVisible.value = false
  message.success('模板已填入 AI 输入框')

  void promptsStore
    .useTemplate({
      templateId: template.id,
      values
    })
    .then((result) => {
      aiStore.setPrompt(result.content)
    })
    .catch((error) => {
      message.warning(
        `模板已填入，但使用次数记录失败：${error instanceof Error ? error.message : String(error)}`
      )
    })
}

function attachImagePlaceholder(): void {
  message.info('图片入口已预留；当前本机 SDK 桥接仍按纯文本 messages 发送，暂不真实上传图片。')
}

async function scrollChatToBottom(): Promise<void> {
  await nextTick()
  const chatArea = chatAreaRef.value
  if (!chatArea) return
  chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: 'auto' })
}

onMounted(async () => {
  if (!aiSettingsStore.hasLoaded) {
    await aiSettingsStore.load()
  }
  await aiStore.loadHistory()
  if (aiStore.sessions[0]) {
    await aiStore.loadSession(aiStore.sessions[0].id)
  }
  if (!promptsStore.hasLoaded) {
    await promptsStore.load()
  }
  await scrollChatToBottom()
})

onBeforeUnmount(() => {
  aiStore.disposeStream()
})

watch(
  () => [visibleMessages.value.length, aiStore.output, aiStore.thinking],
  () => {
    void scrollChatToBottom()
  }
)

watch(selectedTemplate, (template) => {
  hydrateTemplateVariables(template)
})
</script>

<template>
  <div class="ai-workspace ai-workspace--zen">
    <section class="ai-toolbar-shell">
      <div class="ai-toolbar">
        <div class="ai-toolbar-left">
          <div class="ai-model-selector">
            <span class="ai-model-glyph">{{ aiStore.provider === 'codex' ? 'C' : 'CC' }}</span>
            <div>
              <strong>{{ providerLabel }}</strong>
              <p>Local SDK · Neural Core</p>
            </div>
          </div>

          <NRadioGroup :value="aiStore.provider" @update:value="aiStore.setProvider">
            <NRadioButton value="codex">Codex</NRadioButton>
            <NRadioButton value="claude-code">Claude</NRadioButton>
          </NRadioGroup>
        </div>

        <div class="ai-toolbar-actions">
          <div class="ai-inline-meta">
            <span>{{
              aiStore.runtime?.workingDirectory ||
              aiSettingsStore.settings.workingDirectory ||
              '跟随当前项目'
            }}</span>
            <span>{{ aiStore.runtime?.model || '本机配置' }}</span>
            <span>{{ aiStore.activeSession?.status || '尚未开始' }}</span>
          </div>
          <div class="ai-depth-control">
            <span class="eyebrow">logic depth</span>
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

      <div class="ai-meta-ribbon" aria-hidden="true" />
    </section>

    <div class="ai-chat-shell">
      <aside class="ai-session-sidebar">
        <div class="ai-session-head">
          <div>
            <p class="eyebrow">history</p>
            <strong>会话记录</strong>
          </div>
          <NButton size="small" circle secondary title="新建会话" @click="newConversation">
            <template #icon>
              <NIcon :component="AddOutline" />
            </template>
          </NButton>
        </div>

        <div v-if="aiStore.sessions.length > 0" class="ai-session-list">
          <div
            v-for="session in aiStore.sessions"
            :key="session.id"
            class="ai-session-item"
            :class="{ active: session.id === aiStore.activeSessionId }"
            @click="selectSession(session.id)"
          >
            <NIcon :component="ChatboxOutline" />
            <div>
              <strong>{{ session.title || '未命名会话' }}</strong>
              <p>{{ session.preview || session.phase }}</p>
              <span>{{ formatUpdatedAt(session.updatedAt) }}</span>
            </div>
            <NPopconfirm
              negative-text="取消"
              positive-text="确认删除"
              @positive-click="deleteSession(session.id)"
            >
              <template #trigger>
                <NButton
                  class="ai-session-delete-button"
                  size="tiny"
                  circle
                  tertiary
                  type="error"
                  title="删除会话"
                  :disabled="aiStore.running && session.id === aiStore.activeSessionId"
                  @click.stop
                >
                  <template #icon>
                    <NIcon :component="TrashOutline" />
                  </template>
                </NButton>
              </template>
              删除后会从本地 AI 会话历史中移除，确定继续？
            </NPopconfirm>
          </div>
        </div>
        <div v-else class="ai-session-empty">
          <NEmpty description="暂无会话记录" />
        </div>
      </aside>

      <section class="ai-chat-canvas ai-chat-canvas--wide">
        <div class="ai-runtime-strip">
          <div>
            <span>提供方</span>
            <strong>{{ aiStore.activeSession?.provider || aiStore.provider }}</strong>
          </div>
          <div>
            <span>阶段</span>
            <strong>{{ phaseLabel }}</strong>
          </div>
          <div>
            <span>输入 Tokens</span>
            <strong>{{ aiStore.usage?.inputTokens ?? 0 }}</strong>
          </div>
          <div>
            <span>输出 Tokens</span>
            <strong>{{ aiStore.usage?.outputTokens ?? 0 }}</strong>
          </div>
          <div>
            <span>最近更新</span>
            <strong>{{ formatUpdatedAt(aiStore.activeSession?.updatedAt) }}</strong>
          </div>
          <div>
            <span>成本 USD</span>
            <strong>{{ aiStore.usage?.totalCostUsd ?? 0 }}</strong>
          </div>
        </div>

        <div class="ai-chat-headline">
          <div>
            <p class="eyebrow">conversation</p>
            <strong>AI 灵感空间</strong>
          </div>
          <NTag size="small" :bordered="false">{{ visibleMessages.length }} 条</NTag>
        </div>
        <div v-if="visibleMessages.length > 0" ref="chatAreaRef" class="chat-area">
          <article
            v-for="item in visibleMessages"
            :key="item.id"
            class="bubble-shell"
            :class="item.role === 'assistant' ? 'bubble-ai' : 'bubble-user'"
          >
            <div class="bubble markdown-body" v-html="item.html" />
            <button
              v-if="item.role === 'assistant' && item.thinking"
              class="message-thinking-toggle"
              type="button"
              @click="toggleThinking(item.id)"
            >
              <NIcon :component="isThinkingOpen(item.id) ? ChevronUpOutline : ChevronDownOutline" />
              <span>{{ isThinkingOpen(item.id) ? '收起思考过程' : '展开思考过程' }}</span>
              <small>{{ thinkingPreview }}</small>
            </button>
            <NCollapseTransition :show="isThinkingOpen(item.id)">
              <pre
                v-if="item.role === 'assistant' && item.thinking"
                class="stream-output is-thinking ai-thinking-output ai-thinking-output--message"
                >{{ item.thinking }}</pre
              >
            </NCollapseTransition>
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
              placeholder=""
              @update:value="aiStore.setPrompt"
            />
            <div class="floating-input-actions">
              <NButton circle secondary title="选择 Prompt 模板" @click="openTemplateModal">
                <template #icon>
                  <NIcon :component="LibraryOutline" />
                </template>
              </NButton>
              <NButton circle secondary title="添加图片" @click="attachImagePlaceholder">
                <template #icon>
                  <NIcon :component="ImageOutline" />
                </template>
              </NButton>
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
    </div>
  </div>

  <NModal v-model:show="showSettingsModal" preset="card" title="AI 设置" class="ai-settings-modal">
    <AiSettingsView />
  </NModal>

  <NModal
    v-model:show="templateModalVisible"
    preset="card"
    title="选择 Prompt 模板"
    class="form-modal ai-template-modal"
  >
    <NForm>
      <NFormItem label="模板">
        <NSelect
          v-model:value="selectedTemplateId"
          filterable
          :options="templateOptions"
          placeholder="选择要填入 AI 输入框的模板"
        />
      </NFormItem>
      <NFormItem
        v-for="variable in selectedTemplateVariables"
        :key="variable.name"
        :label="variable.name"
      >
        <NSelect
          v-if="variable.type === 'select'"
          v-model:value="templateVariableValues[variable.name]"
          :options="variableOptions(variable)"
        />
        <NInput
          v-else
          v-model:value="templateVariableValues[variable.name]"
          :placeholder="variable.defaultValue"
        />
      </NFormItem>
      <div class="action-row modal-actions ai-template-actions">
        <NButton secondary @click="templateModalVisible = false">取消</NButton>
        <NButton
          type="primary"
          :disabled="!selectedTemplate"
          @click.prevent.stop="applyTemplateToPrompt"
        >
          填入输入框
        </NButton>
      </div>
    </NForm>
  </NModal>
</template>
