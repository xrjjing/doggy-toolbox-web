<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import {
  NButton,
  NCard,
  NEmpty,
  NInput,
  NRadioButton,
  NRadioGroup,
  NSpace,
  NStatistic,
  NTag,
  useMessage
} from 'naive-ui'
import { useAiStore } from '@renderer/stores/ai'

const message = useMessage()
const aiStore = useAiStore()

const providerLabel = computed(() =>
  aiStore.provider === 'codex' ? 'Codex SDK' : 'Claude Code SDK'
)

const phaseLabel = computed(() => {
  const labels = {
    idle: '空闲',
    starting: '启动中',
    streaming: '流式输出',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消'
  } as const
  return labels[aiStore.phase]
})

function formatUpdatedAt(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

async function startChat(): Promise<void> {
  try {
    await aiStore.startChat()
  } catch (error) {
    aiStore.running = false
    message.error(error instanceof Error ? error.message : String(error))
  }
}

async function openSession(sessionId: string): Promise<void> {
  try {
    await aiStore.loadSession(sessionId)
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

async function cancelChat(): Promise<void> {
  await aiStore.cancelChat()
}

onMounted(async () => {
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
  <section class="page-heading">
    <p class="eyebrow">local ai bridge</p>
    <h2>AI SDK Bridge 验证台</h2>
    <p>
      新项目不再把 AI 当普通 HTTPS Provider。这里走 Electron Main Process，由本地 SDK 读取 Codex /
      Claude Code 配置，并把对话历史落到本地资料库。
    </p>
  </section>

  <div class="http-shell is-two-pane">
    <NCard class="soft-card http-collections-panel" :bordered="false">
      <template #header>
        <div class="card-title-row">
          <span>会话历史</span>
          <NTag size="small" :bordered="false">{{ aiStore.sessions.length }}</NTag>
        </div>
      </template>

      <div v-if="aiStore.sessions.length > 0" class="http-history-list">
        <button
          v-for="session in aiStore.sessions"
          :key="session.id"
          class="tool-nav-item http-history-item"
          :class="{ active: session.id === aiStore.activeSessionId }"
          type="button"
          @click="openSession(session.id)"
        >
          <div>
            <strong>{{ session.title }}</strong>
            <p>{{ session.preview || '暂无摘要' }}</p>
          </div>
          <span class="http-status-pill" :class="{ 'is-error': session.status === 'error' }">
            {{ session.phase }}
          </span>
        </button>
      </div>
      <NEmpty v-else description="还没有 AI 会话记录" />
    </NCard>

    <NCard class="soft-card ai-panel" :bordered="false">
      <NSpace vertical size="large">
        <NRadioGroup :value="aiStore.provider" @update:value="aiStore.setProvider">
          <NRadioButton value="codex">Codex SDK</NRadioButton>
          <NRadioButton value="claude-code">Claude Code SDK</NRadioButton>
        </NRadioGroup>

        <NInput
          :value="aiStore.prompt"
          type="textarea"
          :autosize="{ minRows: 4, maxRows: 8 }"
          placeholder="输入要发送给本机 AI SDK 的内容"
          @update:value="aiStore.setPrompt"
        />

        <div class="action-row">
          <NButton type="primary" :loading="aiStore.running" @click="startChat">
            发送到 {{ providerLabel }}
          </NButton>
          <NButton secondary :disabled="!aiStore.running" @click="cancelChat">取消</NButton>
        </div>

        <div v-if="aiStore.activeSession" class="http-response-stats">
          <div>
            <span>提供方</span>
            <strong>{{ aiStore.activeSession.provider }}</strong>
          </div>
          <div>
            <span>阶段</span>
            <strong>{{ phaseLabel }}</strong>
          </div>
          <div>
            <span>最近更新</span>
            <strong>{{ formatUpdatedAt(aiStore.activeSession.updatedAt) }}</strong>
          </div>
        </div>

        <div v-if="aiStore.runtime" class="ai-runtime-grid">
          <NStatistic label="运行时" :value="aiStore.runtime.transport" />
          <NStatistic label="模型" :value="aiStore.runtime.model || '跟随本机配置'" />
          <NStatistic label="权限" :value="aiStore.runtime.approvalPolicy || 'SDK 默认'" />
          <NStatistic label="沙箱" :value="aiStore.runtime.sandboxMode || 'SDK 默认'" />
        </div>

        <div v-if="aiStore.runtime?.providerSessionId" class="ai-meta-line">
          <span>Provider Session</span>
          <code>{{ aiStore.runtime.providerSessionId }}</code>
        </div>

        <div v-if="aiStore.usage" class="ai-runtime-grid">
          <NStatistic label="输入 Tokens" :value="aiStore.usage.inputTokens ?? 0" />
          <NStatistic label="输出 Tokens" :value="aiStore.usage.outputTokens ?? 0" />
          <NStatistic label="成本 USD" :value="aiStore.usage.totalCostUsd ?? 0" />
        </div>

        <section v-if="aiStore.thinking" class="ai-subpanel">
          <div class="card-title-row">
            <span>思考 / Reasoning</span>
            <NTag size="small" :bordered="false">thinking</NTag>
          </div>
          <pre class="stream-output is-thinking">{{ aiStore.thinking }}</pre>
        </section>

        <section v-if="aiStore.tools.length > 0" class="ai-subpanel">
          <div class="card-title-row">
            <span>工具 / 运行事件</span>
            <NTag size="small" :bordered="false">{{ aiStore.tools.length }}</NTag>
          </div>
          <div class="ai-tool-list">
            <article v-for="tool in aiStore.tools" :key="tool.id" class="ai-tool-item">
              <div>
                <strong>{{ tool.name }}</strong>
                <p>{{ tool.text || '无详细输出' }}</p>
              </div>
              <NTag size="small" :type="tool.status === 'error' ? 'error' : 'info'">
                {{ tool.status }}
              </NTag>
            </article>
          </div>
        </section>

        <pre class="stream-output">{{ aiStore.output || '等待输出...' }}</pre>
      </NSpace>
    </NCard>
  </div>
</template>
