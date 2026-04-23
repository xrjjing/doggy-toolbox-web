import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  PromptCategory,
  PromptCategorySaveInput,
  PromptModuleState,
  PromptTemplate,
  PromptTemplateSaveInput,
  PromptTemplateUseInput,
  PromptTemplateUseResult,
  PromptVariable
} from '@shared/ipc-contract'

/**
 * Prompt 模板 store。
 * 分类、模板和收藏态都以主进程持久化状态为准；activeCategoryId / search / favoritesOnly
 * 则是 renderer 视图态，用于驱动筛选和工作台交互。
 */

function matchesSearch(template: PromptTemplate, normalizedSearch: string): boolean {
  if (!normalizedSearch) return true

  return [template.title, template.description, template.content, ...template.tags]
    .join('\n')
    .toLowerCase()
    .includes(normalizedSearch)
}

export const usePromptsStore = defineStore('prompts', () => {
  const snapshot = ref<PromptModuleState | null>(null)
  const activeCategoryId = ref('all')
  const search = ref('')
  const favoritesOnly = ref(false)
  const loading = ref(false)
  const saving = ref(false)
  const hasLoaded = ref(false)
  const normalizedSearch = computed(() => search.value.trim().toLowerCase())

  const categories = computed(() => snapshot.value?.categories ?? [])
  const templates = computed(() => snapshot.value?.templates ?? [])
  const storageFile = computed(() => snapshot.value?.storageFile ?? '')
  const updatedAt = computed(() => snapshot.value?.updatedAt ?? '')
  const visibleTemplates = computed(() =>
    templates.value.filter(
      (template) =>
        (activeCategoryId.value === 'all' || template.categoryId === activeCategoryId.value) &&
        (!favoritesOnly.value || template.isFavorite) &&
        matchesSearch(template, normalizedSearch.value)
    )
  )

  const activeCategory = computed(
    () => categories.value.find((category) => category.id === activeCategoryId.value) ?? null
  )

  /**
   * 分类被删除、旧备份被导入时，当前 activeCategoryId 可能失效。
   * 这里统一回退到 `all`，避免模板列表直接变成空白且用户看不出原因。
   */
  function hydrateState(nextState: PromptModuleState): void {
    snapshot.value = nextState
    hasLoaded.value = true

    if (
      activeCategoryId.value !== 'all' &&
      !nextState.categories.some((category) => category.id === activeCategoryId.value)
    ) {
      activeCategoryId.value = 'all'
    }
  }

  /**
   * Prompt 模块所有写操作后都 reload，
   * 这样分类排序、模板收藏态和更新时间都由主进程统一生成。
   */
  async function load(): Promise<void> {
    loading.value = true
    try {
      hydrateState(await window.doggy.getPromptState())
    } finally {
      loading.value = false
    }
  }

  /**
   * 分类保存后把当前焦点切到该分类，方便继续在其下新增模板。
   */
  async function saveCategory(input: PromptCategorySaveInput): Promise<PromptCategory> {
    saving.value = true
    try {
      const category = await window.doggy.savePromptCategory(input)
      await load()
      activeCategoryId.value = category.id
      return category
    } finally {
      saving.value = false
    }
  }

  /**
   * 删除分类后不在 renderer 侧猜测模板迁移结果，直接以 reload 后的快照为准。
   */
  async function removeCategory(categoryId: string): Promise<boolean> {
    saving.value = true
    try {
      const result = await window.doggy.deletePromptCategory(categoryId)
      await load()
      return result.ok
    } finally {
      saving.value = false
    }
  }

  /**
   * 保存模板后同步把分类焦点切到模板所属分类，
   * 这样跨分类保存后列表能立即定位到用户刚编辑的模板。
   */
  async function saveTemplate(input: PromptTemplateSaveInput): Promise<PromptTemplate> {
    saving.value = true
    try {
      const template = await window.doggy.savePromptTemplate(input)
      await load()
      activeCategoryId.value = template.categoryId || 'all'
      return template
    } finally {
      saving.value = false
    }
  }

  /**
   * 删除模板后仅返回 ok，真正列表更新由 reload 负责。
   */
  async function removeTemplate(templateId: string): Promise<boolean> {
    saving.value = true
    try {
      const result = await window.doggy.deletePromptTemplate(templateId)
      await load()
      return result.ok
    } finally {
      saving.value = false
    }
  }

  /**
   * 收藏切换是一个轻量动作，但仍回源刷新，保持模板列表、收藏筛选和计数一致。
   */
  async function toggleFavorite(templateId: string): Promise<boolean> {
    const result = await window.doggy.togglePromptFavorite(templateId)
    await load()
    return result.isFavorite
  }

  /**
   * 使用模板会触发主进程侧的变量解析与使用记录更新，因此完成后也要 reload。
   */
  async function useTemplate(input: PromptTemplateUseInput): Promise<PromptTemplateUseResult> {
    const result = await window.doggy.usePromptTemplate(input)
    await load()
    return result
  }

  /**
   * 变量解析是纯服务能力，renderer 只负责把内容透传给主进程。
   */
  async function parseVariables(content: string): Promise<PromptVariable[]> {
    return window.doggy.parsePromptVariables(content)
  }

  function setActiveCategory(categoryId: string): void {
    activeCategoryId.value = categoryId
  }

  function setSearch(value: string): void {
    search.value = value
  }

  function setFavoritesOnly(value: boolean): void {
    favoritesOnly.value = value
  }

  /**
   * 分类计数基于完整模板快照，不受当前搜索和 favoritesOnly 过滤影响。
   */
  function countByCategory(categoryId: string): number {
    return templates.value.filter((template) => template.categoryId === categoryId).length
  }

  return {
    snapshot,
    activeCategoryId,
    search,
    favoritesOnly,
    loading,
    saving,
    hasLoaded,
    categories,
    templates,
    visibleTemplates,
    activeCategory,
    storageFile,
    updatedAt,
    load,
    saveCategory,
    removeCategory,
    saveTemplate,
    removeTemplate,
    toggleFavorite,
    useTemplate,
    parseVariables,
    setActiveCategory,
    setSearch,
    setFavoritesOnly,
    countByCategory
  }
})
