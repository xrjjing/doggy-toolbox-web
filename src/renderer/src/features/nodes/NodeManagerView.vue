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
import { useAiSettingsStore } from '@renderer/stores/ai-settings'
import { useAiStore } from '@renderer/stores/ai'
import { useNodesStore } from '@renderer/stores/nodes'
import { parseNodeShareLinks } from './node-converters'

/**
 * 节点管理页是本地节点资料库的 renderer 交互层：
 * - 展示节点卡片、标签筛选和搜索结果。
 * - 维护手工录入/编辑节点的表单。
 * - 把多行分享链接解析成 NodeSaveInput 后逐条交给 store 保存。
 *
 * 真实链路：
 * UI -> nodesStore -> window.doggy(preload)
 * -> ipcMain.handle('nodes:*') -> NodeService -> JsonFileRepository
 *
 * 这样分层的目的，是让页面专注于输入组织和反馈展示；
 * 真正的端口校验、标签清洗、结构规范化与落盘都在主进程统一执行。
 */
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
const aiStore = useAiStore()
const aiSettingsStore = useAiSettingsStore()
const nodesStore = useNodesStore()
const modalVisible = ref(false)
const importModalVisible = ref(false)
// 导入弹窗中的原始文本仅用于一次性解析，解析成功后会被清空。
const importText = ref('')
// 表单保留字符串态，尤其端口先按文本编辑，提交时再规整成数值。
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

// 统计卡片和标签侧栏都依赖 store snapshot，页面不再维护第二份节点列表。
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

// endpoint 只是卡片展示字段，用于把 server/port 合并成更易扫读的文本。
function formatEndpoint(node: NodeRecord): string {
  if (!node.server && !node.port) return '未填写地址'
  if (!node.server) return `:${node.port}`
  if (!node.port) return node.server
  return `${node.server}:${node.port}`
}

// 复制链接/配置文本属于本地 renderer 能力，不需要经过 store 或 IPC。
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

// 新建节点时清空所有字段，避免编辑态或导入态数据串入新记录。
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

// 编辑时把持久化记录回填为表单态；端口转回字符串，保持输入体验一致。
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

// 页面只做宽松的文本 -> 数字转换；最终范围校验仍由 NodeService 负责。
function normalizePort(value: string): number {
  const parsed = Number(value.trim())
  if (!Number.isFinite(parsed)) {
    return 0
  }
  return Math.trunc(parsed)
}

// 页面层提交时仅做最小结构整理：
// - portText -> port:number
// - tagsText -> tags:string[]
// 真正的 trim、去重、端口范围校验在主进程执行。
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

// 删除只传节点 id；删除后的最新节点列表和标签集合由 store 重新加载。
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

// 分享链接解析刻意放在 renderer：
// - 输入是用户粘贴的原始多行文本。
// - 输出是多个 NodeSaveInput。
// 但入库仍逐条走 nodesStore.saveNode，避免绕过主进程校验和落盘规则。
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

/**
 * 节点页 AI 入口只解释当前节点资料，不参与任何远程探测或订阅操作。
 * 重点是帮助用户理解标签分组、链接类型和配置文本里可能的风险点。
 */
async function explainNodesWithAi(): Promise<void> {
  if (!nodesStore.hasLoaded) {
    await nodesStore.load()
  }

  const visibleNodes = nodesStore.visibleNodes.slice(0, 10)
  if (visibleNodes.length === 0) {
    message.warning('当前没有可分析的节点资料')
    return
  }

  const prompt = [
    '请对当前节点资料做一次中文说明和风险复查。',
    '要求：',
    '1. 总结当前节点类型、地区或标签的分布情况。',
    '2. 指出命名不清、标签不一致或配置字段可疑的节点。',
    '3. 如果原始链接或配置文本缺失明显关键信息，请直接指出。',
    '',
    `当前标签筛选：${activeTagLabel.value}`,
    `当前搜索词：${nodesStore.search || '无'}`,
    '',
    '节点清单：',
    visibleNodes
      .map(
        (node, index) =>
          `${index + 1}. ${node.name}\n类型：${node.type || '无'}\n地址：${formatEndpoint(
            node
          )}\n标签：${node.tags.join(', ') || '无'}\n原始链接：${
            node.rawLink || '无'
          }\n配置文本：\n${node.configText || '无'}`
      )
      .join('\n\n')
  ].join('\n')

  try {
    await aiStore.startChat({
      moduleId: 'nodes',
      title: '节点资料 AI 说明',
      prompt
    })
    message.success('节点资料已发送到 AI Bridge，请到 AI 页面查看会话结果。')
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

onMounted(() => {
  // 首次进入页面就同步主进程快照，让标签筛选、编辑和导入都基于真实存量数据。
  void nodesStore.load()
  if (!aiSettingsStore.hasLoaded) {
    void aiSettingsStore.load()
  }
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
        <!-- 标签切换只是前端过滤条件，不会直接改动存储中的 tags 数据。 -->
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
            <!-- 刷新会重走完整保存链路的读路径，重新同步当前节点快照。 -->
            <NButton secondary :loading="nodesStore.loading" @click="nodesStore.load">刷新</NButton>
            <NButton
              secondary
              :disabled="!aiSettingsStore.isFeatureEnabled('nodes')"
              @click="explainNodesWithAi"
            >
              AI 说明
            </NButton>
            <NButton secondary @click="importModalVisible = true">导入分享链接</NButton>
            <NButton type="primary" @click="openCreateModal">新增节点</NButton>
          </NSpace>
        </div>
      </NCard>

      <div v-if="nodesStore.visibleNodes.length > 0" class="nodes-grid">
        <!-- 当前列表是 search + activeTag 双重过滤后的节点子集，不是额外持久化集合。 -->
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
      <!-- 导入弹窗只负责接收原始分享链接文本；真正入库仍逐条走 store/saveNode。 -->
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
      <!-- 手工录入与分享链接导入最终都会收敛成同一种 NodeSaveInput，再走同一条保存链路。 -->
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
