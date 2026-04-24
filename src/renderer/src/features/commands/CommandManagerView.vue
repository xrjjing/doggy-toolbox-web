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
  NSelect,
  NSpace,
  NTag,
  NText,
  useMessage
} from 'naive-ui'
import type { CommandRecord } from '@shared/ipc-contract'
import { useAiSettingsStore } from '@renderer/stores/ai-settings'
import { useAiStore } from '@renderer/stores/ai'
import { useCommandsStore } from '@renderer/stores/commands'

/**
 * 命令管理页只负责 renderer 侧交互编排：
 * - 组织分组侧栏、命令卡片和编辑弹窗。
 * - 把表单字符串转换为 store 可接受的输入结构。
 * - 展示 store 返回的命令模块快照。
 *
 * 真实调用链固定为：
 * UI -> commandsStore -> window.doggy(preload)
 * -> ipcMain.handle('commands:*') -> CommandService -> JsonFileRepository
 *
 * 这样分层后，页面层不直接接触文件系统或 Electron IPC 细节；
 * 输入清洗、默认分组兜底、排序和持久化规则都收口在主进程 service。
 */
type CommandFormState = {
  id?: string
  title: string
  description: string
  linesText: string
  tagsText: string
  tabId: string
}

const message = useMessage()
const aiStore = useAiStore()
const aiSettingsStore = useAiSettingsStore()
const commandsStore = useCommandsStore()
const tabModalVisible = ref(false)
const commandModalVisible = ref(false)
const importModalVisible = ref(false)
const importText = ref('')
// 分组弹窗只维护最小状态：当前编辑对象 id 和名称。
const tabForm = reactive({
  id: '',
  name: ''
})
// 命令弹窗保留“适合输入框编辑”的字符串态，提交时再转换成数组型 IPC 输入。
const commandForm = reactive<CommandFormState>({
  id: '',
  title: '',
  description: '',
  linesText: '',
  tagsText: '',
  tabId: ''
})

// 顶部统计卡片完全基于 store 快照，避免页面层再维护第二份命令列表事实。
const stats = computed(() => ({
  tabs: commandsStore.tabs.length,
  total: commandsStore.commands.length,
  visible: commandsStore.visibleCommands.length
}))

const tabSummary = computed(() => commandsStore.currentTab?.name ?? '未选择分组')
// 模板层既要显示名称也要显示数量，因此先把 tabs 投影成更适合渲染的对象。
const tabOptions = computed(() =>
  commandsStore.tabs.map((tab) => ({
    id: tab.id,
    name: tab.name,
    count: commandsStore.countByTab(tab.id)
  }))
)
const isCommandEdit = computed(() => Boolean(commandForm.id))
const moveTargetByCommandId = ref<Record<string, string>>({})

function formatUpdatedAt(value: string): string {
  if (!value) return '等待首次保存'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

// 统一处理命令数组到展示文本的转换，供卡片展示和复制复用。
function renderCommandLines(command: CommandRecord): string {
  return command.lines.join('\n')
}

// 复制命令只属于 renderer 本地能力，不会触发 store / IPC，也不会改动持久化状态。
async function copyCommand(command: CommandRecord): Promise<void> {
  const text = renderCommandLines(command)

  try {
    await navigator.clipboard.writeText(text)
    message.success('命令已复制到剪贴板')
  } catch {
    message.error('当前环境无法直接写入剪贴板')
  }
}

/**
 * 命令页 AI 入口只把“当前可见命令快照”交给统一 AI 会话链路，
 * 不会直接执行命令，也不会越过命令资料库状态单独拼装持久化数据。
 */
async function explainCommandsWithAi(): Promise<void> {
  if (!commandsStore.hasLoaded) {
    await commandsStore.load()
  }

  const focusedCommands = commandsStore.visibleCommands.slice(0, 12)
  if (focusedCommands.length === 0) {
    message.warning('当前没有可分析的命令内容')
    return
  }

  const prompt = [
    '请基于当前命令资料做一次中文整理。',
    '要求：',
    '1. 先总结当前分组下命令主要用途。',
    '2. 指出高风险命令、执行前检查点和适用场景。',
    '3. 如果命令内容重复或描述不足，请给出整理建议。',
    '',
    `当前分组：${commandsStore.currentTab?.name ?? '全部分组'}`,
    `当前搜索词：${commandsStore.search || '无'}`,
    '',
    '命令清单：',
    focusedCommands
      .map(
        (command, index) =>
          `${index + 1}. ${command.title}\n描述：${command.description || '无'}\n标签：${
            command.tags.join(', ') || '无'
          }\n内容：\n${renderCommandLines(command)}`
      )
      .join('\n\n')
  ].join('\n')

  try {
    await aiStore.startChat({
      moduleId: 'commands',
      title: '命令资料 AI 说明',
      prompt
    })
    message.success('命令资料已发送到 AI Bridge，请到 AI 页面查看会话结果。')
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

function rotateTabOrder(direction: 'left' | 'right', currentTabId: string): void {
  const tabs = [...commandsStore.tabs]
  const currentIndex = tabs.findIndex((tab) => tab.id === currentTabId)
  if (currentIndex < 0) return
  const targetIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1
  if (targetIndex < 0 || targetIndex >= tabs.length) return
  const [current] = tabs.splice(currentIndex, 1)
  tabs.splice(targetIndex, 0, current)
  void commandsStore.reorderTabs(tabs.map((tab) => tab.id))
}

function rotateCommandOrder(direction: 'up' | 'down', command: CommandRecord): void {
  const commands = commandsStore.commands.filter((item) => item.tabId === command.tabId)
  const currentIndex = commands.findIndex((item) => item.id === command.id)
  if (currentIndex < 0) return
  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
  if (targetIndex < 0 || targetIndex >= commands.length) return
  const [current] = commands.splice(currentIndex, 1)
  commands.splice(targetIndex, 0, current)
  void commandsStore.reorderCommands({
    tabId: command.tabId,
    commandIds: commands.map((item) => item.id)
  })
}

// 新建分组前显式清空旧表单，避免编辑态残留串入新增流程。
function openCreateTabModal(): void {
  tabForm.id = ''
  tabForm.name = ''
  tabModalVisible.value = true
}

// 新建命令默认落到当前激活分组；如果当前没有激活值，则退回 store 维护的默认分组。
function openCreateCommandModal(): void {
  commandForm.id = ''
  commandForm.title = ''
  commandForm.description = ''
  commandForm.linesText = ''
  commandForm.tagsText = ''
  commandForm.tabId = commandsStore.activeTabId || commandsStore.defaultTabId
  commandModalVisible.value = true
}

// 编辑时把数组/标签重新转换回输入框更好编辑的字符串态。
function openEditCommandModal(command: CommandRecord): void {
  commandForm.id = command.id
  commandForm.title = command.title
  commandForm.description = command.description
  commandForm.linesText = command.lines.join('\n')
  commandForm.tagsText = command.tags.join(', ')
  commandForm.tabId = command.tabId
  commandModalVisible.value = true
}

// 页面只把表单提交给 store；真正的合法性校验、ID 生成和排序由 CommandService 负责。
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

// 页面层做最小格式整理：
// - 多行文本 -> lines:string[]
// - 标签文本 -> tags:string[]
// 真正的 trim、空行剔除和分组兜底仍在主进程统一处理。
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

async function submitImportCommands(): Promise<void> {
  try {
    const result = await commandsStore.importCommands({
      text: importText.value,
      tabId: commandsStore.activeTabId || commandsStore.defaultTabId
    })
    importModalVisible.value = false
    importText.value = ''
    message.success(`已导入 ${result.imported} 条命令`)
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

async function moveCommand(command: CommandRecord): Promise<void> {
  const targetTabId = moveTargetByCommandId.value[command.id] || command.tabId
  if (targetTabId === command.tabId) {
    message.warning('请选择其他分组')
    return
  }
  try {
    await commandsStore.moveCommand({
      commandId: command.id,
      targetTabId
    })
    message.success('命令已移动到目标分组')
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

// 删除入口只负责传递命令 id；删除是否成功和刷新后的最新状态由 store/service 返回。
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
  // 只在首次进入页面时拉取快照，避免回切页面时重复请求打断用户当前筛选。
  if (!commandsStore.hasLoaded) {
    void commandsStore.load()
  }
  if (!aiSettingsStore.hasLoaded) {
    void aiSettingsStore.load()
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
    <article class="progress-card">
      <div class="progress-head">
        <strong>迁移补齐</strong>
        <span>旧体验</span>
      </div>
      <p>已补回批量文本导入、分组顺序调整、命令顺序调整和跨分组移动入口。</p>
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
        <!-- 分组切换只改变 store 的 activeTabId，命令数据仍来自同一份 snapshot。 -->
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
          <div class="list-order-actions">
            <NButton
              size="tiny"
              quaternary
              circle
              :disabled="commandsStore.tabs[0]?.id === tab.id"
              @click.stop="rotateTabOrder('left', tab.id)"
            >
              ↑
            </NButton>
            <NButton
              size="tiny"
              quaternary
              circle
              :disabled="commandsStore.tabs[commandsStore.tabs.length - 1]?.id === tab.id"
              @click.stop="rotateTabOrder('right', tab.id)"
            >
              ↓
            </NButton>
            <NTag size="small" :bordered="false">{{ tab.count }}</NTag>
          </div>
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
            <!-- 刷新会完整重走 UI -> store -> preload -> IPC -> service 链路，同步最新快照。 -->
            <NButton secondary :loading="commandsStore.loading" @click="commandsStore.load"
              >刷新</NButton
            >
            <NButton secondary @click="importModalVisible = true">批量导入</NButton>
            <NButton
              secondary
              :disabled="!aiSettingsStore.isFeatureEnabled('commands')"
              @click="explainCommandsWithAi"
            >
              AI 说明
            </NButton>
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
        <!-- 卡片列表是 store 基于当前搜索词和分组筛选计算出的前端派生结果。 -->
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
            <NButton
              size="small"
              quaternary
              :disabled="
                commandsStore.commands.filter((item) => item.tabId === command.tabId)[0]?.id ===
                command.id
              "
              @click="rotateCommandOrder('up', command)"
            >
              上移
            </NButton>
            <NButton
              size="small"
              quaternary
              :disabled="
                commandsStore.commands.filter((item) => item.tabId === command.tabId)[
                  commandsStore.commands.filter((item) => item.tabId === command.tabId).length - 1
                ]?.id === command.id
              "
              @click="rotateCommandOrder('down', command)"
            >
              下移
            </NButton>
            <NButton size="small" secondary @click="openEditCommandModal(command)">编辑</NButton>
            <NPopconfirm @positive-click="deleteCommand(command.id)">
              <template #trigger>
                <NButton size="small" tertiary type="error">删除</NButton>
              </template>
              删除这条命令卡片后不会自动进入备份，确定继续？
            </NPopconfirm>
          </div>

          <div class="command-move-row">
            <NSelect
              :value="moveTargetByCommandId[command.id] || command.tabId"
              size="small"
              :options="tabOptions.map((tab) => ({ label: tab.name, value: tab.id }))"
              @update:value="
                (value) => {
                  moveTargetByCommandId[command.id] = String(value)
                }
              "
            />
            <NButton size="small" secondary @click="moveCommand(command)">移动到分组</NButton>
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
      <!-- 分组弹窗只处理名称输入，默认分组约束和排序规则都在主进程 service。 -->
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
      <!-- 这里保留字符串态表单，提交时再统一映射为 CommandSaveInput。 -->
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

  <NModal
    v-model:show="importModalVisible"
    preset="card"
    title="批量导入命令"
    class="form-modal command-form-modal"
  >
    <p class="muted">
      兼容旧项目纯文本格式：标题行以 `:` 或 `：` 结尾；`#` 注释会作为说明；命令正文按行保存。
    </p>
    <NInput
      v-model:value="importText"
      type="textarea"
      :autosize="{ minRows: 10, maxRows: 18 }"
      placeholder="Git 常用:\n# 查看当前分支状态\ngit status\n\nDocker:\ndocker ps"
    />
    <div class="action-row modal-actions">
      <NButton secondary @click="importModalVisible = false">取消</NButton>
      <NButton type="primary" :loading="commandsStore.saving" @click="submitImportCommands">
        导入到当前分组
      </NButton>
    </div>
  </NModal>
</template>
