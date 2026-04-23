<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  NButton,
  NCard,
  NCheckbox,
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
import type { PromptTemplate, PromptVariable } from '@shared/ipc-contract'
import { useAiSettingsStore } from '@renderer/stores/ai-settings'
import { useAiStore } from '@renderer/stores/ai'
import { usePromptsStore } from '@renderer/stores/prompts'

/**
 * Prompt 模板页承担 renderer 侧两类职责：
 * 1. 模板库管理：分类、模板、收藏、删除与编辑。
 * 2. 模板试用：填写变量、请求主进程填充、展示最终结果。
 *
 * 真实链路：
 * UI -> promptsStore -> window.doggy(preload)
 * -> ipcMain.handle('prompts:*') -> PromptService -> JsonFileRepository
 *
 * 变量解析/填充放在主进程 service 的目的，是让 Prompt 语法规则只有一份实现，
 * 后续聊天页、导入流程和模板库都能复用同一套逻辑，避免 renderer/main 双实现漂移。
 */
type CategoryFormState = {
  id?: string
  name: string
  icon: string
}

type TemplateFormState = {
  id?: string
  title: string
  categoryId: string
  description: string
  tagsText: string
  content: string
}

const message = useMessage()
const aiStore = useAiStore()
const aiSettingsStore = useAiSettingsStore()
const promptsStore = usePromptsStore()
const categoryModalVisible = ref(false)
const templateModalVisible = ref(false)
const variablesModalVisible = ref(false)
const resultModalVisible = ref(false)
// 这三个状态构成一次“使用模板”流程的上下文，只存在于页面层，不进入持久化 store。
const currentTemplate = ref<PromptTemplate | null>(null)
const variableValues = ref<Record<string, string>>({})
const filledContent = ref('')

// 分类表单与模板表单分离，避免分类操作和模板正文编辑耦合到同一份状态里。
const categoryForm = reactive<CategoryFormState>({
  id: '',
  name: '',
  icon: ''
})
const templateForm = reactive<TemplateFormState>({
  id: '',
  title: '',
  categoryId: '',
  description: '',
  tagsText: '',
  content: ''
})

// 顶部统计完全来自 store 快照，保证分类数、模板数和收藏数都对应真实持久化状态。
const stats = computed(() => ({
  categories: promptsStore.categories.length,
  templates: promptsStore.templates.length,
  visible: promptsStore.visibleTemplates.length,
  favorites: promptsStore.templates.filter((template) => template.isFavorite).length
}))
// NSelect 需要 label/value 结构，页面在这里把分类快照映射成控件友好的选项数组。
const categoryOptions = computed(() => [
  { label: '未分类', value: '' },
  ...promptsStore.categories.map((category) => ({
    label: `${category.icon ? `${category.icon} ` : ''}${category.name}`,
    value: category.id
  }))
])
const variableSyntaxHint = '变量语法：{{name}}、{{name:默认值}}、{{name|选项1|选项2}}'
const activeCategoryLabel = computed(() => promptsStore.activeCategory?.name ?? '全部模板')
const currentVariables = computed(() => currentTemplate.value?.variables ?? [])
const isTemplateEdit = computed(() => Boolean(templateForm.id))
const isCategoryEdit = computed(() => Boolean(categoryForm.id))

function formatUpdatedAt(value: string): string {
  if (!value) return '等待首次保存'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function getCategoryName(categoryId: string): string {
  if (!categoryId) return '未分类'
  return promptsStore.categories.find((category) => category.id === categoryId)?.name ?? '未知分类'
}

// 新建分类只重置分类弹窗自身状态，不影响当前模板筛选条件。
function openCreateCategoryModal(): void {
  categoryForm.id = ''
  categoryForm.name = ''
  categoryForm.icon = ''
  categoryModalVisible.value = true
}

// 分类编辑按 id 回查 store 快照，避免页面持有长期脱节的分类对象引用。
function openEditCategoryModal(categoryId: string): void {
  const category = promptsStore.categories.find((item) => item.id === categoryId)
  if (!category) return
  categoryForm.id = category.id
  categoryForm.name = category.name
  categoryForm.icon = category.icon
  categoryModalVisible.value = true
}

// 新建模板默认继承当前激活分类；如果当前是“全部模板”，则退回未分类。
function openCreateTemplateModal(): void {
  templateForm.id = ''
  templateForm.title = ''
  templateForm.categoryId =
    promptsStore.activeCategoryId === 'all' ? '' : promptsStore.activeCategoryId
  templateForm.description = ''
  templateForm.tagsText = ''
  templateForm.content = ''
  templateModalVisible.value = true
}

// 编辑模板时把 tags 数组回填为逗号文本；variables 不手工维护，后续由 service 重新解析。
function openEditTemplateModal(template: PromptTemplate): void {
  templateForm.id = template.id
  templateForm.title = template.title
  templateForm.categoryId = template.categoryId
  templateForm.description = template.description
  templateForm.tagsText = template.tags.join(', ')
  templateForm.content = template.content
  templateModalVisible.value = true
}

// 页面只提交分类表单；合法性校验、排序和删除后的模板归类规则由主进程统一负责。
async function submitCategory(): Promise<void> {
  try {
    await promptsStore.saveCategory({
      id: categoryForm.id || undefined,
      name: categoryForm.name,
      icon: categoryForm.icon
    })
    categoryModalVisible.value = false
    message.success(isCategoryEdit.value ? '分类已更新' : '分类已新增')
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

// 模板提交时，页面只做 tags 的文本拆分。
// variables 始终由 PromptService 基于 content 解析得出，避免页面自造结构。
async function submitTemplate(): Promise<void> {
  try {
    await promptsStore.saveTemplate({
      id: templateForm.id || undefined,
      title: templateForm.title,
      content: templateForm.content,
      categoryId: templateForm.categoryId,
      description: templateForm.description,
      tags: templateForm.tagsText
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    })
    templateModalVisible.value = false
    message.success(isTemplateEdit.value ? '模板已更新' : '模板已新增')
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

// 删除分类时，真正的“模板转为未分类”逻辑在 service；页面只消费最终结果消息。
async function deleteCategory(categoryId: string): Promise<void> {
  try {
    const ok = await promptsStore.removeCategory(categoryId)
    message[ok ? 'success' : 'warning'](ok ? '分类已删除，模板已转为未分类' : '未找到分类')
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

// 删除模板与收藏切换都走主进程，这样模板元数据只有一份可信来源。
async function deleteTemplate(templateId: string): Promise<void> {
  try {
    const ok = await promptsStore.removeTemplate(templateId)
    message[ok ? 'success' : 'warning'](ok ? '模板已删除' : '未找到模板')
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

async function toggleFavorite(template: PromptTemplate): Promise<void> {
  try {
    const isFavorite = await promptsStore.toggleFavorite(template.id)
    message.success(isFavorite ? '已收藏模板' : '已取消收藏')
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

// “使用模板”先建立一次页面级临时上下文：
// - currentTemplate 指向当前模板
// - variableValues 以 service 已解析好的变量定义为准
// 没有变量时直接应用，避免无意义弹窗。
async function openUseTemplate(template: PromptTemplate): Promise<void> {
  currentTemplate.value = template
  variableValues.value = Object.fromEntries(
    template.variables.map((variable) => [variable.name, variable.defaultValue])
  )

  if (template.variables.length === 0) {
    await applyTemplate()
    return
  }

  variablesModalVisible.value = true
}

// 最终填充动作由 PromptService.useTemplate 完成，而不是页面本地 replace。
// 这样默认值回退、变量选项和使用次数统计都能复用主进程规则。
async function applyTemplate(): Promise<void> {
  if (!currentTemplate.value) return

  try {
    const result = await promptsStore.useTemplate({
      templateId: currentTemplate.value.id,
      values: variableValues.value
    })
    filledContent.value = result.content
    variablesModalVisible.value = false
    resultModalVisible.value = true
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

// 复制的是主进程返回的最终文本，不再次触发 store 或 service。
async function copyFilledContent(): Promise<void> {
  try {
    await navigator.clipboard.writeText(filledContent.value)
    message.success('已复制填充后的 Prompt')
  } catch {
    message.error('当前环境无法直接写入剪贴板')
  }
}

/**
 * Prompt 页 AI 入口聚焦“模板质量复查”而不是直接代替模板执行。
 * 这里把当前可见模板和变量信息打包给 AI，用于润色、分组建议和风险提示。
 */
async function reviewPromptsWithAi(): Promise<void> {
  if (!promptsStore.hasLoaded) {
    await promptsStore.load()
  }

  const visibleTemplates = promptsStore.visibleTemplates.slice(0, 8)
  if (visibleTemplates.length === 0) {
    message.warning('当前没有可分析的 Prompt 模板')
    return
  }

  const prompt = [
    '请审查当前 Prompt 模板库，并给出中文整理建议。',
    '要求：',
    '1. 先总结当前模板主要覆盖哪些场景。',
    '2. 指出描述不清、变量设计不合理或内容重复的模板。',
    '3. 对当前分类方式给出优化建议。',
    '',
    `当前分类：${activeCategoryLabel.value}`,
    `仅收藏视图：${promptsStore.favoritesOnly ? '是' : '否'}`,
    `当前搜索词：${promptsStore.search || '无'}`,
    '',
    '模板清单：',
    visibleTemplates
      .map(
        (template, index) =>
          `${index + 1}. ${template.title}\n分类：${getCategoryName(template.categoryId)}\n描述：${
            template.description || '无'
          }\n标签：${template.tags.join(', ') || '无'}\n变量：${
            template.variables.map((variable) => variable.name).join(', ') || '无'
          }\n内容：\n${template.content}`
      )
      .join('\n\n')
  ].join('\n')

  try {
    await aiStore.startChat({
      moduleId: 'prompts',
      title: 'Prompt 模板 AI 审查',
      prompt
    })
    message.success('Prompt 模板已发送到 AI Bridge，请到 AI 页面查看会话结果。')
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

// 变量选项已经由 service 解析完成；这里仅做 Naive UI 所需的数据映射。
function variableOptions(variable: PromptVariable): Array<{ label: string; value: string }> {
  return variable.options.map((option) => ({ label: option, value: option }))
}

onMounted(() => {
  // 只在首次进入时拉取模板库快照，后续页面回切沿用当前筛选和收藏视图状态。
  if (!promptsStore.hasLoaded) {
    void promptsStore.load()
  }
  if (!aiSettingsStore.hasLoaded) {
    void aiSettingsStore.load()
  }
})
</script>

<template>
  <section class="page-heading">
    <p class="eyebrow">prompt templates</p>
    <h2>Prompt 模板库</h2>
    <p>
      迁移旧项目的 Prompt 模板能力：分类、模板、收藏、变量解析与填充。后续会接入 AI
      聊天页和统一备份协议。
    </p>
  </section>

  <section class="commands-summary-grid">
    <article class="progress-card">
      <div class="progress-head">
        <strong>分类</strong>
        <span>{{ stats.categories }}</span>
      </div>
      <p>默认分类来自旧项目，支持继续新增和维护。</p>
    </article>
    <article class="progress-card">
      <div class="progress-head">
        <strong>模板</strong>
        <span>{{ stats.templates }}</span>
      </div>
      <p>内置代码解释、代码优化、翻译润色、会议纪要等系统模板。</p>
    </article>
    <article class="progress-card">
      <div class="progress-head">
        <strong>当前视图</strong>
        <span>{{ stats.visible }}</span>
      </div>
      <p>当前分类：{{ activeCategoryLabel }}；收藏数：{{ stats.favorites }}。</p>
    </article>
  </section>

  <div class="prompts-shell">
    <NCard class="soft-card prompts-sidebar" :bordered="false">
      <template #header>
        <div class="card-title-row">
          <span>分类</span>
          <NButton size="small" secondary @click="openCreateCategoryModal">新增</NButton>
        </div>
      </template>

      <div class="commands-tab-list">
        <!-- 左侧分类导航只改变 activeCategoryId，不会直接触发主进程写操作。 -->
        <button
          class="tool-nav-item commands-tab-item"
          :class="{ active: promptsStore.activeCategoryId === 'all' }"
          type="button"
          @click="promptsStore.setActiveCategory('all')"
        >
          <div>
            <strong>全部模板</strong>
            <p>{{ promptsStore.templates.length }} 个模板</p>
          </div>
          <NTag size="small" :bordered="false">{{ promptsStore.templates.length }}</NTag>
        </button>

        <button
          v-for="category in promptsStore.categories"
          :key="category.id"
          class="tool-nav-item commands-tab-item"
          :class="{ active: category.id === promptsStore.activeCategoryId }"
          type="button"
          @click="promptsStore.setActiveCategory(category.id)"
        >
          <div>
            <strong>{{ category.icon }} {{ category.name }}</strong>
            <p>{{ promptsStore.countByCategory(category.id) }} 个模板</p>
          </div>
          <NButton size="tiny" secondary @click.stop="openEditCategoryModal(category.id)"
            >编辑</NButton
          >
        </button>
      </div>

      <div class="commands-meta">
        <strong>Repository</strong>
        <NText depth="3">{{ promptsStore.storageFile || '等待初始化' }}</NText>
        <strong>最近更新</strong>
        <NText depth="3">{{ formatUpdatedAt(promptsStore.updatedAt) }}</NText>
      </div>
    </NCard>

    <div class="prompts-main">
      <NCard class="soft-card commands-toolbar" :bordered="false">
        <div class="prompts-toolbar-row">
          <NInput
            :value="promptsStore.search"
            clearable
            placeholder="搜索标题、描述、标签或 Prompt 内容"
            @update:value="promptsStore.setSearch"
          />
          <NCheckbox
            :checked="promptsStore.favoritesOnly"
            @update:checked="promptsStore.setFavoritesOnly"
          >
            仅收藏
          </NCheckbox>
          <NSpace>
            <!-- 刷新会重新同步分类、模板、收藏状态以及 storageFile / updatedAt。 -->
            <NButton secondary :loading="promptsStore.loading" @click="promptsStore.load"
              >刷新</NButton
            >
            <NButton
              secondary
              :disabled="!aiSettingsStore.isFeatureEnabled('prompts')"
              @click="reviewPromptsWithAi"
            >
              AI 审查
            </NButton>
            <NButton type="primary" @click="openCreateTemplateModal">新增模板</NButton>
          </NSpace>
        </div>
      </NCard>

      <div v-if="promptsStore.visibleTemplates.length > 0" class="prompts-grid">
        <!-- 当前模板列表是分类过滤、收藏过滤和搜索过滤叠加后的前端派生结果。 -->
        <NCard
          v-for="template in promptsStore.visibleTemplates"
          :key="template.id"
          class="soft-card prompt-card"
          :bordered="false"
        >
          <template #header>
            <div class="card-title-row">
              <div>
                <strong>{{ template.title }}</strong>
                <p class="muted">{{ template.description || '未填写描述' }}</p>
              </div>
              <NTag size="small" :bordered="false">{{ getCategoryName(template.categoryId) }}</NTag>
            </div>
          </template>

          <div class="chip-list">
            <span v-for="tag in template.tags" :key="tag" class="chip">{{ tag }}</span>
            <span v-if="template.variables.length > 0" class="chip">
              {{ template.variables.length }} 个变量
            </span>
            <span v-if="template.isSystem" class="chip">系统模板</span>
          </div>

          <pre class="prompt-preview">{{ template.content }}</pre>

          <div class="action-row">
            <NButton size="small" type="primary" @click="openUseTemplate(template)">使用</NButton>
            <NButton size="small" secondary @click="toggleFavorite(template)">
              {{ template.isFavorite ? '取消收藏' : '收藏' }}
            </NButton>
            <NButton size="small" secondary @click="openEditTemplateModal(template)">编辑</NButton>
            <NPopconfirm @positive-click="deleteTemplate(template.id)">
              <template #trigger>
                <NButton size="small" tertiary type="error">删除</NButton>
              </template>
              删除模板后不会自动进入备份，确定继续？
            </NPopconfirm>
          </div>
        </NCard>
      </div>

      <NCard v-else class="soft-card command-empty-card" :bordered="false">
        <NEmpty description="当前筛选条件下还没有 Prompt 模板">
          <template #extra>
            <NButton type="primary" @click="openCreateTemplateModal">先创建第一条模板</NButton>
          </template>
        </NEmpty>
      </NCard>
    </div>
  </div>

  <NModal
    v-model:show="categoryModalVisible"
    preset="card"
    :title="isCategoryEdit ? '编辑分类' : '新增分类'"
    class="form-modal"
  >
    <NForm>
      <!-- 分类弹窗只处理分类本身，不在这里触碰模板内容，保持 UI 关注点分离。 -->
      <NFormItem label="分类名称">
        <NInput v-model:value="categoryForm.name" placeholder="例如：排障、代码、周报" />
      </NFormItem>
      <NFormItem label="图标">
        <NInput v-model:value="categoryForm.icon" maxlength="8" placeholder="可留空，例如 </>" />
      </NFormItem>
      <div class="action-row modal-actions">
        <NPopconfirm v-if="isCategoryEdit" @positive-click="deleteCategory(categoryForm.id || '')">
          <template #trigger>
            <NButton tertiary type="error">删除分类</NButton>
          </template>
          删除分类后，分类下模板会转为未分类，确定继续？
        </NPopconfirm>
        <NButton secondary @click="categoryModalVisible = false">取消</NButton>
        <NButton type="primary" :loading="promptsStore.saving" @click="submitCategory">
          {{ isCategoryEdit ? '保存修改' : '创建分类' }}
        </NButton>
      </div>
    </NForm>
  </NModal>

  <NModal
    v-model:show="templateModalVisible"
    preset="card"
    :title="isTemplateEdit ? '编辑模板' : '新增模板'"
    class="form-modal prompt-editor-modal"
  >
    <NForm>
      <!-- 模板正文是唯一源文本；变量定义不单独编辑，而是提交后由 service 重新解析。 -->
      <div class="prompt-editor-grid">
        <div>
          <NFormItem label="标题">
            <NInput v-model:value="templateForm.title" placeholder="模板标题" />
          </NFormItem>
          <NFormItem label="分类">
            <NSelect v-model:value="templateForm.categoryId" :options="categoryOptions" />
          </NFormItem>
          <NFormItem label="描述">
            <NInput
              v-model:value="templateForm.description"
              type="textarea"
              :autosize="{ minRows: 3, maxRows: 5 }"
              placeholder="简短描述模板用途"
            />
          </NFormItem>
          <NFormItem label="标签">
            <NInput
              v-model:value="templateForm.tagsText"
              placeholder="逗号分隔，例如：代码, 优化"
            />
          </NFormItem>
          <p class="muted prompt-hint">{{ variableSyntaxHint }}</p>
        </div>
        <NFormItem label="Prompt 内容">
          <NInput
            v-model:value="templateForm.content"
            type="textarea"
            :autosize="{ minRows: 18, maxRows: 24 }"
            placeholder="在这里编写 Prompt 模板正文"
          />
        </NFormItem>
      </div>
      <div class="action-row modal-actions">
        <NButton secondary @click="templateModalVisible = false">取消</NButton>
        <NButton type="primary" :loading="promptsStore.saving" @click="submitTemplate">
          {{ isTemplateEdit ? '保存修改' : '创建模板' }}
        </NButton>
      </div>
    </NForm>
  </NModal>

  <NModal v-model:show="variablesModalVisible" preset="card" title="填写变量" class="form-modal">
    <NForm>
      <!-- 变量填写阶段严格消费 currentTemplate.variables，不允许页面自造额外变量。 -->
      <NFormItem v-for="variable in currentVariables" :key="variable.name" :label="variable.name">
        <NSelect
          v-if="variable.type === 'select'"
          v-model:value="variableValues[variable.name]"
          :options="variableOptions(variable)"
        />
        <NInput
          v-else
          v-model:value="variableValues[variable.name]"
          :placeholder="variable.defaultValue"
        />
      </NFormItem>
      <div class="action-row modal-actions">
        <NButton secondary @click="variablesModalVisible = false">取消</NButton>
        <NButton type="primary" @click="applyTemplate">应用模板</NButton>
      </div>
    </NForm>
  </NModal>

  <NModal
    v-model:show="resultModalVisible"
    preset="card"
    title="填充结果"
    class="form-modal prompt-result-modal"
  >
    <!-- 最终结果来自 PromptService.useTemplate 返回值，便于后续复用到聊天页或外部复制。 -->
    <pre class="stream-output">{{ filledContent }}</pre>
    <div class="action-row modal-actions">
      <NButton secondary @click="resultModalVisible = false">关闭</NButton>
      <NButton type="primary" @click="copyFilledContent">复制结果</NButton>
    </div>
  </NModal>
</template>
