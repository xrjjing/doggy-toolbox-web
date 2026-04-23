<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { NButton, NCheckbox, NInput, NRadioButton, NRadioGroup, NTag, useMessage } from 'naive-ui'
import type { ToolPanelSnapshot } from '../types'
import {
  createWebSocketMessage,
  isValidWebSocketUrl,
  summarizeWebSocketMessages,
  tryFormatWebSocketJson,
  type WebSocketMessageRecord
} from '../utils/core-websocket'

/**
 * WebSocket 调试面板。
 *
 * 这里除了普通输入框外，还需要：
 * 1. 维护真实的 WebSocket 连接对象。
 * 2. 维护消息历史。
 * 3. 处理自动重连、格式化显示和连接状态。
 *
 * 所以它必须独立于统一 textarea 工作台。
 */
const emit = defineEmits<{
  snapshot: [snapshot: ToolPanelSnapshot]
}>()

const message = useMessage()
const WEBSOCKET_OPEN = 1
const url = ref('')
const autoReconnect = ref(false)
const formatJson = ref(true)
const messageType = ref<'text' | 'json'>('text')
const sendText = ref('')
const statusText = ref('未连接')
const messages = ref<WebSocketMessageRecord[]>([])
// socket 只存在于当前 renderer 生命周期，不做持久化。
const socket = ref<WebSocket | null>(null)
let reconnectTimer: number | null = null

/**
 * 统一把连接状态和最近消息摘要回传给工作台 AI。
 * 这样 AI 分析时能知道当前到底是 URL 不合法、连接失败，还是收到了异常消息。
 */
function emitSnapshot(): void {
  emit('snapshot', {
    input: [url.value, sendText.value].filter(Boolean).join('\n---\n'),
    output: summarizeWebSocketMessages(messages.value),
    extra: `状态: ${statusText.value}\n自动重连: ${autoReconnect.value ? '开启' : '关闭'}`
  })
}

/**
 * 所有消息，无论发送、接收还是系统提示，都统一进一条消息流。
 * 这样渲染列表和摘要拼接都只需要处理一个数组。
 */
function appendMessage(type: WebSocketMessageRecord['type'], content: string): void {
  messages.value = [...messages.value, createWebSocketMessage(type, content)]
  emitSnapshot()
}

function clearMessages(): void {
  messages.value = []
  emitSnapshot()
}

/**
 * closeSocket 负责彻底收口当前连接生命周期：
 * - 清掉重连计时器。
 * - 主动关闭 socket。
 * - 还原状态为未连接。
 */
function closeSocket(): void {
  if (reconnectTimer) {
    window.clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  socket.value?.close()
  socket.value = null
  statusText.value = '未连接'
  emitSnapshot()
}

/**
 * 事件绑定单独抽出来，是为了保证每次重连和首次连接共享同一套行为。
 */
function bindSocket(ws: WebSocket): void {
  ws.onopen = () => {
    statusText.value = '已连接'
    appendMessage('system', `已连接到 ${url.value}`)
  }

  ws.onmessage = (event) => {
    const payload = String(event.data)
    appendMessage('received', formatJson.value ? tryFormatWebSocketJson(payload) : payload)
  }

  ws.onerror = () => {
    statusText.value = '连接错误'
    appendMessage('system', '连接错误')
  }

  ws.onclose = (event) => {
    statusText.value = '已断开'
    appendMessage('system', `连接已关闭 (code: ${event.code})`)
    socket.value = null

    if (autoReconnect.value && !reconnectTimer) {
      appendMessage('system', '5 秒后自动重连...')
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null
        void connectSocket()
      }, 5000)
    }
  }
}

/**
 * connectSocket 只做建立新连接，不做 UI 按钮判断。
 * 这样 toggleConnection 和自动重连都能复用它。
 */
async function connectSocket(): Promise<void> {
  if (!url.value.trim()) {
    throw new Error('请输入 WebSocket URL')
  }
  if (!isValidWebSocketUrl(url.value.trim())) {
    throw new Error('无效的 WebSocket URL（必须以 ws:// 或 wss:// 开头）')
  }

  closeSocket()
  statusText.value = '连接中...'
  const ws = new WebSocket(url.value.trim())
  socket.value = ws
  bindSocket(ws)
  emitSnapshot()
}

/**
 * 顶部按钮的语义是“已连接就断开，未连接就连接”。
 */
async function toggleConnection(): Promise<void> {
  if (socket.value?.readyState === WebSocket.OPEN) {
    autoReconnect.value = false
    closeSocket()
    return
  }

  try {
    await connectSocket()
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error)
    message.error(text)
    appendMessage('system', text)
  }
}

/**
 * 发送消息前，如果用户选择 JSON 模式，会先做一次本地 JSON 校验。
 * 这样可以把明显的格式错误挡在客户端，而不是等服务端返回异常。
 */
async function sendMessage(): Promise<void> {
  try {
    if (!socket.value || socket.value.readyState !== WebSocket.OPEN) {
      throw new Error('未连接到 WebSocket 服务器')
    }
    if (!sendText.value.trim()) return

    const payload = sendText.value.trim()
    if (messageType.value === 'json') {
      JSON.parse(payload)
    }

    socket.value.send(payload)
    appendMessage('sent', payload)
    sendText.value = ''
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

/**
 * ping 这里故意做成普通文本消息，因为浏览器原生 WebSocket API 不暴露底层协议帧 ping。
 */
function sendPing(): void {
  try {
    if (!socket.value || socket.value.readyState !== WebSocket.OPEN) {
      throw new Error('未连接到 WebSocket 服务器')
    }
    socket.value.send('ping')
    appendMessage('sent', 'ping')
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

onBeforeUnmount(() => {
  // 页面卸载时必须主动断开，否则旧连接会继续在后台接收消息。
  closeSocket()
})
</script>

<template>
  <section class="tool-panel-shell">
    <div class="tool-panel-header">
      <div>
        <p class="eyebrow">advanced panel</p>
        <h3>WebSocket 调试</h3>
      </div>
      <NTag size="small" :bordered="false">{{ statusText }}</NTag>
    </div>

    <p class="muted">
      这块沿用旧项目的浏览器端 WebSocket 调试模式，支持连接状态、消息历史、自动重连和 JSON
      美化预览。
    </p>

    <div class="tool-panel-actions tool-panel-actions--wrap">
      <NInput v-model:value="url" placeholder="ws://127.0.0.1:8080/ws" />
      <NButton type="primary" @click="toggleConnection">
        {{ socket?.readyState === WEBSOCKET_OPEN ? '断开' : '连接' }}
      </NButton>
      <NButton tertiary @click="clearMessages">清空历史</NButton>
    </div>

    <div class="tool-panel-actions tool-panel-actions--wrap">
      <NCheckbox v-model:checked="autoReconnect">自动重连</NCheckbox>
      <NCheckbox v-model:checked="formatJson">接收消息自动格式化 JSON</NCheckbox>
      <NRadioGroup v-model:value="messageType">
        <NRadioButton value="text">文本</NRadioButton>
        <NRadioButton value="json">JSON</NRadioButton>
      </NRadioGroup>
    </div>

    <NInput
      v-model:value="sendText"
      type="textarea"
      :autosize="{ minRows: 4, maxRows: 8 }"
      placeholder="输入要发送的消息"
    />

    <div class="tool-panel-actions">
      <NButton
        type="primary"
        :disabled="socket?.readyState !== WEBSOCKET_OPEN"
        @click="sendMessage"
      >
        发送
      </NButton>
      <NButton secondary :disabled="socket?.readyState !== WEBSOCKET_OPEN" @click="sendPing">
        Ping
      </NButton>
    </div>

    <div class="tool-message-list">
      <article
        v-for="item in messages"
        :key="item.id"
        class="tool-message-card"
        :data-type="item.type"
      >
        <header>
          <strong>{{ item.type }}</strong>
          <span>{{ item.timestamp }}</span>
        </header>
        <pre>{{ item.content }}</pre>
      </article>
      <div v-if="messages.length === 0" class="tool-preview-placeholder">
        连接 WebSocket 后，这里显示消息收发历史
      </div>
    </div>
  </section>
</template>
