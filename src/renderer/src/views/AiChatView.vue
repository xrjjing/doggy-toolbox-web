<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { NButton, NCard, NInput, NRadioButton, NRadioGroup, NSpace, useMessage } from 'naive-ui'
import type { AiProviderKind, AiStreamEvent } from '../../../shared/ipc-contract'

const message = useMessage()
const provider = ref<AiProviderKind>('codex')
const prompt = ref('请用三句话说明 doggy-toolbox-web 当前迁移状态。')
const output = ref('')
const activeSessionId = ref('')
const running = ref(false)
let unsubscribe: (() => void) | null = null

const providerLabel = computed(() => (provider.value === 'codex' ? 'Codex SDK' : 'Claude Code SDK'))

function handleStreamEvent(event: AiStreamEvent): void {
  if (event.sessionId !== activeSessionId.value) return

  if (event.type === 'delta' || event.type === 'thinking') {
    output.value += event.text
    return
  }

  if (event.type === 'error') {
    running.value = false
    message.error(event.message)
    return
  }

  if (event.type === 'done') {
    running.value = false
  }
}

async function startChat(): Promise<void> {
  if (!prompt.value.trim()) {
    message.warning('请输入要发送给 AI 的内容')
    return
  }

  output.value = ''
  running.value = true
  unsubscribe?.()
  unsubscribe = window.doggy.onAiStreamEvent(handleStreamEvent)

  try {
    const result = await window.doggy.aiStartChat({
      provider: provider.value,
      messages: [{ role: 'user', content: prompt.value }]
    })
    activeSessionId.value = result.sessionId
  } catch (error) {
    running.value = false
    message.error(error instanceof Error ? error.message : String(error))
  }
}

async function cancelChat(): Promise<void> {
  if (!activeSessionId.value) return
  await window.doggy.aiCancelChat(activeSessionId.value)
}

onBeforeUnmount(() => {
  unsubscribe?.()
})
</script>

<template>
  <section class="page-heading">
    <p class="eyebrow">local ai bridge</p>
    <h2>AI SDK Bridge 验证台</h2>
    <p>
      新项目不再把 AI 当普通 HTTPS Provider。这里走 Electron Main Process， 由本地 SDK 读取 Codex /
      Claude Code 配置。
    </p>
  </section>

  <NCard class="soft-card ai-panel" :bordered="false">
    <NSpace vertical size="large">
      <NRadioGroup v-model:value="provider">
        <NRadioButton value="codex">Codex SDK</NRadioButton>
        <NRadioButton value="claude-code">Claude Code SDK</NRadioButton>
      </NRadioGroup>

      <NInput
        v-model:value="prompt"
        type="textarea"
        :autosize="{ minRows: 4, maxRows: 8 }"
        placeholder="输入要发送给本机 AI SDK 的内容"
      />

      <div class="action-row">
        <NButton type="primary" :loading="running" @click="startChat">
          发送到 {{ providerLabel }}
        </NButton>
        <NButton secondary :disabled="!running" @click="cancelChat">取消</NButton>
      </div>

      <pre class="stream-output">{{ output || '等待输出...' }}</pre>
    </NSpace>
  </NCard>
</template>
