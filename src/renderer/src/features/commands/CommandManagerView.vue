<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
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
import type { AiProviderKind, AiSessionPhase, CommandRecord } from '@shared/ipc-contract'
import { useAiSettingsStore } from '@renderer/stores/ai-settings'
import { useOneShotAiReview } from '@renderer/composables/useOneShotAiReview'
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
const aiSettingsStore = useAiSettingsStore()
const aiReview = useOneShotAiReview()
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
const activeCommandId = ref('')
const aiProvider = ref<AiProviderKind>('codex')
const activeCommand = computed(
  () =>
    commandsStore.visibleCommands.find((command) => command.id === activeCommandId.value) ??
    commandsStore.visibleCommands[0] ??
    null
)
const aiPhaseLabel = computed(() => {
  const labels: Record<AiSessionPhase, string> = {
    idle: '空闲',
    starting: '启动中',
    streaming: '输出中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消'
  }
  return labels[aiReview.phase.value]
})

watch(
  () => commandsStore.visibleCommands.map((command) => command.id).join('|'),
  () => {
    if (!commandsStore.visibleCommands.some((command) => command.id === activeCommandId.value)) {
      activeCommandId.value = commandsStore.visibleCommands[0]?.id ?? ''
    }
  },
  { immediate: true }
)

function formatUpdatedAt(value: string): string {
  if (!value) return '等待首次保存'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function getTabName(tabId: string): string {
  return tabOptions.value.find((tab) => tab.id === tabId)?.name ?? '未分类'
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
    await aiReview.startReview({
      provider: aiProvider.value,
      moduleId: 'commands',
      title: '命令资料 AI 说明',
      prompt
    })
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
          <div class="commands-toolbar-copy">
            <p class="eyebrow">command library</p>
            <strong>{{ tabSummary }}</strong>
            <span>{{ stats.visible }} / {{ stats.total }} 条命令 · {{ stats.tabs }} 个分组</span>
          </div>
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
              :loading="aiReview.running.value"
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

      <section v-if="aiReview.hasResult.value" class="inline-ai-review-card">
        <div class="inline-ai-review-head">
          <div>
            <strong>AI 说明结果</strong>
            <p>本次结果只保留在命令管理页，不写入 AI Chat 会话。</p>
          </div>
          <span class="http-status-pill">{{ aiPhaseLabel }}</span>
        </div>
        <div class="ai-inline-runtime-grid">
          <span>提供方 {{ aiReview.provider.value }}</span>
          <span>模型 {{ aiReview.runtime.value?.model || '本机默认' }}</span>
          <span>输出 {{ aiReview.usage.value?.outputTokens ?? 0 }}</span>
        </div>
        <pre class="stream-output tool-ai-output">{{
          aiReview.output.value || aiReview.errorMessage.value || '等待 AI 说明结果...'
        }}</pre>
      </section>

      <div v-if="commandsStore.visibleCommands.length > 0" class="commands-lab">
        <section class="commands-list-panel">
          <button
            v-for="command in commandsStore.visibleCommands"
            :key="command.id"
            class="command-row-card"
            :class="{ active: activeCommand?.id === command.id }"
            type="button"
            @click="activeCommandId = command.id"
          >
            <div class="command-row-main">
              <div class="command-row-top">
                <span class="command-row-pill">{{ getTabName(command.tabId) }}</span>
                <strong>{{ command.title }}</strong>
              </div>
              <p class="muted">{{ command.description || '无描述，适合补一句用途说明。' }}</p>
            </div>
            <div class="command-row-side">
              <span>{{ command.lines.length }} 行</span>
              <span>{{ command.tags.length }} 标签</span>
            </div>
          </button>
        </section>

        <section v-if="activeCommand" class="command-console-panel">
          <div class="command-console-head">
            <div>
              <p class="eyebrow">terminal preview</p>
              <strong>{{ activeCommand.title }}</strong>
              <p class="muted">{{ activeCommand.description || '无描述，适合补一句用途说明。' }}</p>
            </div>
            <div class="command-console-meta">
              <span>{{ getTabName(activeCommand.tabId) }}</span>
              <span>{{ formatUpdatedAt(activeCommand.updatedAt) }}</span>
            </div>
          </div>

          <div v-if="activeCommand.tags.length > 0" class="chip-list">
            <span v-for="tag in activeCommand.tags" :key="tag" class="chip">{{ tag }}</span>
          </div>

          <pre class="command-preview command-preview--console">{{
            renderCommandLines(activeCommand)
          }}</pre>

          <div class="action-row">
            <NButton size="small" secondary @click="copyCommand(activeCommand)">复制</NButton>
            <NButton
              size="small"
              quaternary
              :disabled="
                commandsStore.commands.filter((item) => item.tabId === activeCommand.tabId)[0]
                  ?.id === activeCommand.id
              "
              @click="rotateCommandOrder('up', activeCommand)"
            >
              上移
            </NButton>
            <NButton
              size="small"
              quaternary
              :disabled="
                commandsStore.commands.filter((item) => item.tabId === activeCommand.tabId)[
                  commandsStore.commands.filter((item) => item.tabId === activeCommand.tabId)
                    .length - 1
                ]?.id === activeCommand.id
              "
              @click="rotateCommandOrder('down', activeCommand)"
            >
              下移
            </NButton>
            <NButton size="small" secondary @click="openEditCommandModal(activeCommand)">
              编辑
            </NButton>
            <NPopconfirm @positive-click="deleteCommand(activeCommand.id)">
              <template #trigger>
                <NButton size="small" tertiary type="error">删除</NButton>
              </template>
              删除这条命令卡片后不会自动进入备份，确定继续？
            </NPopconfirm>
          </div>

          <div class="command-move-row">
            <NSelect
              :value="moveTargetByCommandId[activeCommand.id] || activeCommand.tabId"
              size="small"
              :options="tabOptions.map((tab) => ({ label: tab.name, value: tab.id }))"
              @update:value="
                (value) => {
                  moveTargetByCommandId[activeCommand.id] = String(value)
                }
              "
            />
            <NButton size="small" secondary @click="moveCommand(activeCommand)">移动到分组</NButton>
          </div>
        </section>
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
