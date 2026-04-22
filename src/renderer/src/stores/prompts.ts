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

  async function load(): Promise<void> {
    loading.value = true
    try {
      hydrateState(await window.doggy.getPromptState())
    } finally {
      loading.value = false
    }
  }

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

  async function toggleFavorite(templateId: string): Promise<boolean> {
    const result = await window.doggy.togglePromptFavorite(templateId)
    await load()
    return result.isFavorite
  }

  async function useTemplate(input: PromptTemplateUseInput): Promise<PromptTemplateUseResult> {
    const result = await window.doggy.usePromptTemplate(input)
    await load()
    return result
  }

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
