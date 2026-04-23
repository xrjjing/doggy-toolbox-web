<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  NButton,
  NCard,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NPopconfirm,
  NSpace,
  NTag,
  NText,
  useMessage
} from 'naive-ui'
import type { NodeRecord } from '@shared/ipc-contract'
import { useNodesStore } from '@renderer/stores/nodes'
import { parseNodeShareLinks } from './node-converters'

type NodeFormState = {
  id?: string
  name: string
  type: string
  server: string
  portText: string
  rawLink: string
  tagsText: string
  configText: string
}

const message = useMessage()
const nodesStore = useNodesStore()
const modalVisible = ref(false)
const importModalVisible = ref(false)
const importText = ref('')
const form = reactive<NodeFormState>({
  id: '',
  name: '',
  type: '',
  server: '',
  portText: '',
  rawLink: '',
  tagsText: '',
  configText: ''
})

const stats = computed(() => ({
  total: nodesStore.nodes.length,
  visible: nodesStore.visibleNodes.length,
  tags: nodesStore.availableTags.length
}))
const isEdit = computed(() => Boolean(form.id))
const activeTagLabel = computed(() => nodesStore.activeTag || '全部标签')

function formatUpdatedAt(value: string): string {
  if (!value) return '等待首次保存'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function formatEndpoint(node: NodeRecord): string {
  if (!node.server && !node.port) return '未填写地址'
  if (!node.server) return `:${node.port}`
  if (!node.port) return node.server
  return `${node.server}:${node.port}`
}

async function copyText(value: string, label: string): Promise<void> {
  if (!value) {
    message.warning(`${label} 为空`)
    return
  }

  try {
    await navigator.clipboard.writeText(value)
    message.success(`${label} 已复制`)
  } catch {
    message.error('当前环境无法直接写入剪贴板')
  }
}

function openCreateModal(): void {
  form.id = ''
  form.name = ''
  form.type = ''
  form.server = ''
  form.portText = ''
  form.rawLink = ''
  form.tagsText = ''
  form.configText = ''
  modalVisible.value = true
}

function openEditModal(node: NodeRecord): void {
  form.id = node.id
  form.name = node.name
  form.type = node.type
  form.server = node.server
  form.portText = node.port > 0 ? String(node.port) : ''
  form.rawLink = node.rawLink
  form.tagsText = node.tags.join(', ')
  form.configText = node.configText
  modalVisible.value = true
}

function normalizePort(value: string): number {
  const parsed = Number(value.trim())
  if (!Number.isFinite(parsed)) {
    return 0
  }
  return Math.trunc(parsed)
}

async function submitNode(): Promise<void> {
  try {
    await nodesStore.saveNode({
      id: form.id || undefined,
      name: form.name,
      type: form.type,
      server: form.server,
      port: normalizePort(form.portText),
      rawLink: form.rawLink,
      tags: form.tagsText.split(/[,，]/),
      configText: form.configText
    })
    modalVisible.value = false
    message.success(isEdit.value ? '节点已更新' : '节点已新增')
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

async function deleteNode(nodeId: string): Promise<void> {
  try {
    const ok = await nodesStore.removeNode(nodeId)
    if (ok) {
      message.success('节点已删除')
    } else {
      message.warning('未找到要删除的节点')
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

async function importShareLinks(): Promise<void> {
  try {
    const nodes = parseNodeShareLinks(importText.value)
    for (const node of nodes) {
      await nodesStore.saveNode(node)
    }
    importText.value = ''
    importModalVisible.value = false
    message.success(`已导入 ${nodes.length} 条分享链接`)
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

onMounted(() => {
  void nodesStore.load()
})
</script>

<template>
  <section class="page-heading">
    <p class="eyebrow">nodes repository</p>
    <h2>节点列表</h2>
    <p>
      这一轮先把本地节点库的最小闭环做起来：节点信息通过 Electron IPC 落到
      `appData/storage/nodes.json`，支持增删改查、搜索、标签筛选和快速复制。
      当前已补最小节点转换：可把常见分享链接解析后直接导入节点库；订阅拉取和更复杂协议解析后续再补。
    </p>
  </section>

  <section class="commands-summary-grid">
    <article class="progress-card">
      <div class="progress-head">
        <strong>节点总数</strong>
        <span>{{ stats.total }}</span>
      </div>
      <p>当前仅管理本地节点资料，不触发远程订阅、抓取或转换流程。</p>
    </article>
    <article class="progress-card">
      <div class="progress-head">
        <strong>当前视图</strong>
        <span>{{ stats.visible }}</span>
      </div>
      <p>支持按名称、类型、地址、端口、原始链接、标签和配置内容搜索。</p>
    </article>
    <article class="progress-card">
      <div class="progress-head">
        <strong>标签视图</strong>
        <span>{{ stats.tags }}</span>
      </div>
      <p>当前筛选：{{ activeTagLabel }}。适合先按环境或用途做轻量标记。</p>
    </article>
  </section>

  <div class="nodes-shell">
    <NCard class="soft-card nodes-sidebar" :bordered="false">
      <template #header>
        <div class="card-title-row">
          <span>标签筛选</span>
          <NButton size="small" secondary @click="nodesStore.clearTagFilter">清空</NButton>
        </div>
      </template>

      <div class="commands-tab-list">
        <button
          class="tool-nav-item commands-tab-item"
          :class="{ active: !nodesStore.activeTag }"
          type="button"
          @click="nodesStore.clearTagFilter"
        >
          <div>
            <strong>全部节点</strong>
            <p>显示当前 `nodes.json` 里的全部节点记录</p>
          </div>
          <NTag size="small" :bordered="false">{{ nodesStore.nodes.length }}</NTag>
        </button>

        <button
          v-for="tag in nodesStore.availableTags"
          :key="tag"
          class="tool-nav-item commands-tab-item"
          :class="{ active: tag === nodesStore.activeTag }"
          type="button"
          @click="nodesStore.setTagFilter(tag)"
        >
          <div>
            <strong>{{ tag }}</strong>
            <p>按标签筛选节点卡片</p>
          </div>
          <NTag size="small" :bordered="false">{{ nodesStore.countByTag(tag) }}</NTag>
        </button>
      </div>

      <div class="commands-meta">
        <strong>Repository</strong>
        <NText depth="3">{{ nodesStore.storageFile || '等待初始化' }}</NText>
        <strong>最近更新</strong>
        <NText depth="3">{{ formatUpdatedAt(nodesStore.updatedAt) }}</NText>
      </div>
    </NCard>

    <div class="commands-main">
      <NCard class="soft-card commands-toolbar" :bordered="false">
        <div class="commands-toolbar-row">
          <NInput
            :value="nodesStore.search"
            clearable
            placeholder="搜索名称、类型、地址、端口、标签、原始链接或配置"
            @update:value="nodesStore.setSearch"
          />
          <NSpace>
            <NButton secondary :loading="nodesStore.loading" @click="nodesStore.load">刷新</NButton>
            <NButton secondary @click="importModalVisible = true">导入分享链接</NButton>
            <NButton type="primary" @click="openCreateModal">新增节点</NButton>
          </NSpace>
        </div>
      </NCard>

      <div v-if="nodesStore.visibleNodes.length > 0" class="nodes-grid">
        <NCard
          v-for="node in nodesStore.visibleNodes"
          :key="node.id"
          class="soft-card node-card"
          :bordered="false"
        >
          <template #header>
            <div class="card-title-row">
              <div>
                <strong>{{ node.name }}</strong>
                <p class="muted">{{ node.type || '未填写协议类型' }}</p>
              </div>
              <NTag size="small" :bordered="false">{{ formatEndpoint(node) }}</NTag>
            </div>
          </template>

          <div class="node-meta-grid">
            <div>
              <NText depth="3">服务地址</NText>
              <strong>{{ node.server || '未填写' }}</strong>
            </div>
            <div>
              <NText depth="3">端口</NText>
              <strong>{{ node.port || '未填写' }}</strong>
            </div>
          </div>

          <div v-if="node.tags.length > 0" class="chip-list node-chip-list">
            <span v-for="tag in node.tags" :key="tag" class="chip">{{ tag }}</span>
          </div>

          <div class="node-block">
            <NText depth="3">原始链接</NText>
            <pre class="command-preview node-preview">{{ node.rawLink || '未填写原始链接' }}</pre>
          </div>

          <div class="node-block">
            <NText depth="3">节点配置</NText>
            <pre class="command-preview node-preview">{{
              node.configText || '未填写配置文本'
            }}</pre>
          </div>

          <div class="action-row">
            <NButton size="small" secondary @click="copyText(node.rawLink, '原始链接')">
              复制链接
            </NButton>
            <NButton size="small" secondary @click="copyText(node.configText, '配置文本')">
              复制配置
            </NButton>
            <NButton size="small" secondary @click="openEditModal(node)">编辑</NButton>
            <NPopconfirm @positive-click="deleteNode(node.id)">
              <template #trigger>
                <NButton size="small" tertiary type="error">删除</NButton>
              </template>
              删除后会立即写回本地节点库。如有需要，请先执行统一备份。确定继续？
            </NPopconfirm>
          </div>
        </NCard>
      </div>

      <NCard v-else class="soft-card command-empty-card" :bordered="false">
        <NEmpty description="当前筛选条件下还没有节点">
          <template #extra>
            <NButton type="primary" @click="openCreateModal">先创建第一条节点</NButton>
          </template>
        </NEmpty>
      </NCard>
    </div>
  </div>

  <NModal
    v-model:show="importModalVisible"
    preset="card"
    title="导入节点分享链接"
    class="form-modal"
  >
    <NForm>
      <NFormItem label="分享链接">
        <NInput
          v-model:value="importText"
          type="textarea"
          :autosize="{ minRows: 8, maxRows: 16 }"
          placeholder="支持多行粘贴 vmess:// / vless:// / trojan:// / ss://"
        />
      </NFormItem>
      <div class="action-row modal-actions">
        <NButton secondary @click="importModalVisible = false">取消</NButton>
        <NButton type="primary" :loading="nodesStore.saving" @click="importShareLinks">
          解析并导入
        </NButton>
      </div>
    </NForm>
  </NModal>

  <NModal
    v-model:show="modalVisible"
    preset="card"
    :title="isEdit ? '编辑节点' : '新增节点'"
    class="form-modal command-form-modal"
  >
    <NForm>
      <NFormItem label="节点名称">
        <NInput v-model:value="form.name" placeholder="例如：新加坡实验线 / 家宽备用节点" />
      </NFormItem>
      <NFormItem label="协议类型">
        <NInput v-model:value="form.type" placeholder="例如：vmess / vless / trojan / ss" />
      </NFormItem>
      <NFormItem label="服务地址">
        <NInput v-model:value="form.server" placeholder="例如：node.example.com" />
      </NFormItem>
      <NFormItem label="端口">
        <NInput v-model:value="form.portText" placeholder="例如：443" />
      </NFormItem>
      <NFormItem label="原始链接">
        <NInput
          v-model:value="form.rawLink"
          type="textarea"
          :autosize="{ minRows: 3, maxRows: 6 }"
          placeholder="粘贴订阅中单条节点链接，或者其他便于回查的原始数据"
        />
      </NFormItem>
      <NFormItem label="标签">
        <NInput
          v-model:value="form.tagsText"
          placeholder="用英文逗号分隔，例如：生产, 新加坡, 家宽"
        />
      </NFormItem>
      <NFormItem label="配置文本">
        <NInput
          v-model:value="form.configText"
          type="textarea"
          :autosize="{ minRows: 6, maxRows: 12 }"
          placeholder="保存完整配置、调试记录或导出后的节点文本"
        />
      </NFormItem>
      <div class="action-row modal-actions">
        <NButton secondary @click="modalVisible = false">取消</NButton>
        <NButton type="primary" :loading="nodesStore.saving" @click="submitNode">
          {{ isEdit ? '保存修改' : '创建节点' }}
        </NButton>
      </div>
    </NForm>
  </NModal>
</template>
