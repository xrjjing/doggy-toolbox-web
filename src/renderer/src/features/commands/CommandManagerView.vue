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
import type { CommandRecord } from '@shared/ipc-contract'
import { useCommandsStore } from '@renderer/stores/commands'

type CommandFormState = {
  id?: string
  title: string
  description: string
  linesText: string
  tagsText: string
  tabId: string
}

const message = useMessage()
const commandsStore = useCommandsStore()
const tabModalVisible = ref(false)
const commandModalVisible = ref(false)
const tabForm = reactive({
  id: '',
  name: ''
})
const commandForm = reactive<CommandFormState>({
  id: '',
  title: '',
  description: '',
  linesText: '',
  tagsText: '',
  tabId: ''
})

const stats = computed(() => ({
  tabs: commandsStore.tabs.length,
  total: commandsStore.commands.length,
  visible: commandsStore.visibleCommands.length
}))

const tabSummary = computed(() => commandsStore.currentTab?.name ?? '未选择分组')
const tabOptions = computed(() =>
  commandsStore.tabs.map((tab) => ({
    id: tab.id,
    name: tab.name,
    count: commandsStore.countByTab(tab.id)
  }))
)
const isCommandEdit = computed(() => Boolean(commandForm.id))

function formatUpdatedAt(value: string): string {
  if (!value) return '等待首次保存'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function renderCommandLines(command: CommandRecord): string {
  return command.lines.join('\n')
}

async function copyCommand(command: CommandRecord): Promise<void> {
  const text = renderCommandLines(command)

  try {
    await navigator.clipboard.writeText(text)
    message.success('命令已复制到剪贴板')
  } catch {
    message.error('当前环境无法直接写入剪贴板')
  }
}

function openCreateTabModal(): void {
  tabForm.id = ''
  tabForm.name = ''
  tabModalVisible.value = true
}

function openCreateCommandModal(): void {
  commandForm.id = ''
  commandForm.title = ''
  commandForm.description = ''
  commandForm.linesText = ''
  commandForm.tagsText = ''
  commandForm.tabId = commandsStore.activeTabId || commandsStore.defaultTabId
  commandModalVisible.value = true
}

function openEditCommandModal(command: CommandRecord): void {
  commandForm.id = command.id
  commandForm.title = command.title
  commandForm.description = command.description
  commandForm.linesText = command.lines.join('\n')
  commandForm.tagsText = command.tags.join(', ')
  commandForm.tabId = command.tabId
  commandModalVisible.value = true
}

async function submitTab(): Promise<void> {
  try {
    await commandsStore.saveTab({
      id: tabForm.id || undefined,
      name: tabForm.name
    })
    tabModalVisible.value = false
    message.success('分组已保存')
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

async function submitCommand(): Promise<void> {
  try {
    await commandsStore.saveCommand({
      id: commandForm.id || undefined,
      title: commandForm.title,
      description: commandForm.description,
      lines: commandForm.linesText.split('\n'),
      tabId: commandForm.tabId,
      tags: commandForm.tagsText
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    })
    commandModalVisible.value = false
    message.success(isCommandEdit.value ? '命令已更新' : '命令已新增')
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

async function deleteCommand(commandId: string): Promise<void> {
  try {
    const ok = await commandsStore.removeCommand(commandId)
    if (ok) {
      message.success('命令已删除')
    } else {
      message.warning('未找到要删除的命令')
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

onMounted(() => {
  if (!commandsStore.hasLoaded) {
    void commandsStore.load()
  }
})
</script>

<template>
  <section class="page-heading">
    <p class="eyebrow">commands repository</p>
    <h2>命令管理</h2>
    <p>
      这一版先把 P2 的第一块闭环打通：Electron Main 统一落盘到 appData，下层使用 JSON repository，
      上层提供命令分组、命令卡片、快速复制和桌面端编辑体验。
    </p>
  </section>

  <section class="commands-summary-grid">
    <article class="progress-card">
      <div class="progress-head">
        <strong>分组数量</strong>
        <span>{{ stats.tabs }}</span>
      </div>
      <p>当前以分组作为第一层组织结构，后续可以继续承接旧项目页签语义。</p>
    </article>
    <article class="progress-card">
      <div class="progress-head">
        <strong>命令总数</strong>
        <span>{{ stats.total }}</span>
      </div>
      <p>命令内容在主进程统一持久化，Renderer 不直接接触文件系统。</p>
    </article>
    <article class="progress-card">
      <div class="progress-head">
        <strong>当前视图</strong>
        <span>{{ stats.visible }}</span>
      </div>
      <p>当前分组：{{ tabSummary }}。支持按标题、描述、标签和命令内容本地搜索。</p>
    </article>
  </section>

  <div class="commands-shell">
    <NCard class="soft-card commands-sidebar" :bordered="false">
      <template #header>
        <div class="card-title-row">
          <span>分组</span>
          <NButton size="small" secondary @click="openCreateTabModal">新增分组</NButton>
        </div>
      </template>

      <div class="commands-tab-list">
        <button
          v-for="tab in tabOptions"
          :key="tab.id"
          class="tool-nav-item commands-tab-item"
          :class="{ active: tab.id === commandsStore.activeTabId }"
          type="button"
          @click="commandsStore.setActiveTab(tab.id)"
        >
          <div>
            <strong>{{ tab.name }}</strong>
            <p>{{ tab.count }} 条命令</p>
          </div>
          <NTag size="small" :bordered="false">{{ tab.count }}</NTag>
        </button>
      </div>

      <div class="commands-meta">
        <strong>Repository</strong>
        <NText depth="3">{{ commandsStore.storageFile || '等待初始化' }}</NText>
        <strong>最近更新</strong>
        <NText depth="3">{{ formatUpdatedAt(commandsStore.updatedAt) }}</NText>
      </div>
    </NCard>

    <div class="commands-main">
      <NCard class="soft-card commands-toolbar" :bordered="false">
        <div class="commands-toolbar-row">
          <NInput
            :value="commandsStore.search"
            clearable
            placeholder="搜索标题、描述、标签或命令内容"
            @update:value="commandsStore.setSearch"
          />
          <NSpace>
            <NButton secondary :loading="commandsStore.loading" @click="commandsStore.load"
              >刷新</NButton
            >
            <NButton
              type="primary"
              :disabled="commandsStore.tabs.length === 0"
              @click="openCreateCommandModal"
            >
              新增命令
            </NButton>
          </NSpace>
        </div>
      </NCard>

      <div v-if="commandsStore.visibleCommands.length > 0" class="commands-grid">
        <NCard
          v-for="command in commandsStore.visibleCommands"
          :key="command.id"
          class="soft-card command-card"
          :bordered="false"
        >
          <template #header>
            <div class="card-title-row">
              <div>
                <strong>{{ command.title }}</strong>
                <p class="muted">{{ command.description || '无描述，适合补一句用途说明。' }}</p>
              </div>
              <NTag size="small" :bordered="false">{{
                tabOptions.find((tab) => tab.id === command.tabId)?.name
              }}</NTag>
            </div>
          </template>

          <div v-if="command.tags.length > 0" class="chip-list">
            <span v-for="tag in command.tags" :key="tag" class="chip">{{ tag }}</span>
          </div>

          <pre class="command-preview">{{ renderCommandLines(command) }}</pre>

          <div class="action-row">
            <NButton size="small" secondary @click="copyCommand(command)">复制</NButton>
            <NButton size="small" secondary @click="openEditCommandModal(command)">编辑</NButton>
            <NPopconfirm @positive-click="deleteCommand(command.id)">
              <template #trigger>
                <NButton size="small" tertiary type="error">删除</NButton>
              </template>
              删除这条命令卡片后不会自动进入备份，确定继续？
            </NPopconfirm>
          </div>
        </NCard>
      </div>

      <NCard v-else class="soft-card command-empty-card" :bordered="false">
        <NEmpty description="当前筛选条件下还没有命令">
          <template #extra>
            <NButton type="primary" @click="openCreateCommandModal">先创建第一条命令</NButton>
          </template>
        </NEmpty>
      </NCard>
    </div>
  </div>

  <NModal v-model:show="tabModalVisible" preset="card" title="新增分组" class="form-modal">
    <NForm>
      <NFormItem label="分组名称">
        <NInput v-model:value="tabForm.name" placeholder="例如：Git / Docker / 日常排障" />
      </NFormItem>
      <div class="action-row modal-actions">
        <NButton secondary @click="tabModalVisible = false">取消</NButton>
        <NButton type="primary" :loading="commandsStore.saving" @click="submitTab"
          >保存分组</NButton
        >
      </div>
    </NForm>
  </NModal>

  <NModal
    v-model:show="commandModalVisible"
    preset="card"
    :title="isCommandEdit ? '编辑命令' : '新增命令'"
    class="form-modal command-form-modal"
  >
    <NForm>
      <NFormItem label="标题">
        <NInput v-model:value="commandForm.title" placeholder="例如：查看最近 20 条提交日志" />
      </NFormItem>
      <NFormItem label="描述">
        <NInput
          v-model:value="commandForm.description"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 4 }"
          placeholder="补一句什么时候用、风险点是什么"
        />
      </NFormItem>
      <NFormItem label="所属分组">
        <div class="tab-chip-row">
          <button
            v-for="tab in tabOptions"
            :key="tab.id"
            class="nav-item tab-chip"
            :class="{ active: commandForm.tabId === tab.id }"
            type="button"
            @click="commandForm.tabId = tab.id"
          >
            {{ tab.name }}
          </button>
        </div>
      </NFormItem>
      <NFormItem label="命令内容">
        <NInput
          v-model:value="commandForm.linesText"
          type="textarea"
          :autosize="{ minRows: 6, maxRows: 12 }"
          placeholder="一行一个命令，保存时会自动剔除空白行"
        />
      </NFormItem>
      <NFormItem label="标签">
        <NInput
          v-model:value="commandForm.tagsText"
          placeholder="用英文逗号分隔，例如：git, 常用, 回滚前检查"
        />
      </NFormItem>
      <div class="action-row modal-actions">
        <NButton secondary @click="commandModalVisible = false">取消</NButton>
        <NButton type="primary" :loading="commandsStore.saving" @click="submitCommand">
          {{ isCommandEdit ? '保存修改' : '创建命令' }}
        </NButton>
      </div>
    </NForm>
  </NModal>
</template>
