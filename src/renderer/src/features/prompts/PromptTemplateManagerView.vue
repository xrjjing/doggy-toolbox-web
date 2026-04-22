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
import { usePromptsStore } from '@renderer/stores/prompts'

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
const promptsStore = usePromptsStore()
const categoryModalVisible = ref(false)
const templateModalVisible = ref(false)
const variablesModalVisible = ref(false)
const resultModalVisible = ref(false)
const currentTemplate = ref<PromptTemplate | null>(null)
const variableValues = ref<Record<string, string>>({})
const filledContent = ref('')

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

const stats = computed(() => ({
  categories: promptsStore.categories.length,
  templates: promptsStore.templates.length,
  visible: promptsStore.visibleTemplates.length,
  favorites: promptsStore.templates.filter((template) => template.isFavorite).length
}))
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

function openCreateCategoryModal(): void {
  categoryForm.id = ''
  categoryForm.name = ''
  categoryForm.icon = ''
  categoryModalVisible.value = true
}

function openEditCategoryModal(categoryId: string): void {
  const category = promptsStore.categories.find((item) => item.id === categoryId)
  if (!category) return
  categoryForm.id = category.id
  categoryForm.name = category.name
  categoryForm.icon = category.icon
  categoryModalVisible.value = true
}

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

function openEditTemplateModal(template: PromptTemplate): void {
  templateForm.id = template.id
  templateForm.title = template.title
  templateForm.categoryId = template.categoryId
  templateForm.description = template.description
  templateForm.tagsText = template.tags.join(', ')
  templateForm.content = template.content
  templateModalVisible.value = true
}

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

async function deleteCategory(categoryId: string): Promise<void> {
  try {
    const ok = await promptsStore.removeCategory(categoryId)
    message[ok ? 'success' : 'warning'](ok ? '分类已删除，模板已转为未分类' : '未找到分类')
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

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

async function copyFilledContent(): Promise<void> {
  try {
    await navigator.clipboard.writeText(filledContent.value)
    message.success('已复制填充后的 Prompt')
  } catch {
    message.error('当前环境无法直接写入剪贴板')
  }
}

function variableOptions(variable: PromptVariable): Array<{ label: string; value: string }> {
  return variable.options.map((option) => ({ label: option, value: option }))
}

onMounted(() => {
  if (!promptsStore.hasLoaded) {
    void promptsStore.load()
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
            <NButton secondary :loading="promptsStore.loading" @click="promptsStore.load"
              >刷新</NButton
            >
            <NButton type="primary" @click="openCreateTemplateModal">新增模板</NButton>
          </NSpace>
        </div>
      </NCard>

      <div v-if="promptsStore.visibleTemplates.length > 0" class="prompts-grid">
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
    <pre class="stream-output">{{ filledContent }}</pre>
    <div class="action-row modal-actions">
      <NButton secondary @click="resultModalVisible = false">关闭</NButton>
      <NButton type="primary" @click="copyFilledContent">复制结果</NButton>
    </div>
  </NModal>
</template>
