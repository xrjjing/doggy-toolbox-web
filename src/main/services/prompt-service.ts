import { randomUUID } from 'node:crypto'
import type {
  PromptCategory,
  PromptCategorySaveInput,
  PromptExportDocument,
  PromptExportInput,
  PromptExportTemplate,
  PromptImportInput,
  PromptImportResult,
  PromptModuleState,
  PromptSaveAsTemplateInput,
  PromptTemplate,
  PromptTemplateReorderInput,
  PromptTemplateSaveInput,
  PromptTemplateUseInput,
  PromptTemplateUseResult,
  PromptVariable
} from '../../shared/ipc-contract'
import { fillPromptTemplate, parsePromptVariables } from '../../shared/prompt-template-core'
import { ensureAppDataLayout, resolveAppDataPaths } from './app-data'
import { JsonFileRepository } from './json-repository'

type StoredPromptState = {
  version: number
  updatedAt: string
  categories: PromptCategory[]
  templates: PromptTemplate[]
}

const DEFAULT_CATEGORIES: Array<Omit<PromptCategory, 'createdAt' | 'updatedAt'>> = [
  { id: 'cat_coding', name: '编程开发', icon: '</>', order: 0 },
  { id: 'cat_writing', name: '写作创作', icon: '✍️', order: 1 },
  { id: 'cat_translate', name: '翻译润色', icon: '🌐', order: 2 },
  { id: 'cat_analysis', name: '分析总结', icon: '📊', order: 3 },
  { id: 'cat_other', name: '其他', icon: '📌', order: 4 }
]

const DEFAULT_TEMPLATES: Array<
  Omit<
    PromptTemplate,
    'variables' | 'isFavorite' | 'usageCount' | 'order' | 'createdAt' | 'updatedAt'
  >
> = [
  {
    id: 'tpl_code_explain',
    title: '代码解释',
    content:
      '请解释以下代码的功能和原理：\n\n```{{language:python}}\n{{code}}\n```\n\n要求：\n1. 说明代码的整体功能\n2. 逐行或逐块解释关键逻辑\n3. 指出可能的优化点',
    categoryId: 'cat_coding',
    description: '让 AI 解释代码的功能和实现原理',
    tags: ['代码', '解释', '学习'],
    isSystem: true
  },
  {
    id: 'tpl_code_optimize',
    title: '代码优化',
    content:
      '请优化以下代码，重点关注{{focus|性能|可读性|安全性|全面优化}}：\n\n```{{language:python}}\n{{code}}\n```\n\n请提供优化后的代码并说明改进点。',
    categoryId: 'cat_coding',
    description: '优化代码的性能、可读性或安全性',
    tags: ['代码', '优化', '重构'],
    isSystem: true
  },
  {
    id: 'tpl_bug_fix',
    title: 'Bug 修复',
    content:
      '以下代码存在问题：\n\n```{{language:python}}\n{{code}}\n```\n\n错误信息：{{error}}\n\n请分析问题原因并提供修复方案。',
    categoryId: 'cat_coding',
    description: '分析代码错误并提供修复方案',
    tags: ['代码', 'Bug', '调试'],
    isSystem: true
  },
  {
    id: 'tpl_translate',
    title: '中英互译',
    content:
      '请将以下内容翻译成{{target_lang|中文|英文|日文}}：\n\n{{text}}\n\n要求：\n- 保持原文的语气和风格\n- 专业术语翻译准确\n- 语句通顺自然',
    categoryId: 'cat_translate',
    description: '中英文互译，保持原文风格',
    tags: ['翻译', '中英文'],
    isSystem: true
  },
  {
    id: 'tpl_polish',
    title: '文本润色',
    content:
      '请润色以下文本，使其更加{{style|专业正式|简洁明了|生动有趣}}：\n\n{{text}}\n\n要求保持原意，改善表达。',
    categoryId: 'cat_translate',
    description: '改善文本表达，提升可读性',
    tags: ['润色', '写作'],
    isSystem: true
  },
  {
    id: 'tpl_summary',
    title: '文章摘要',
    content:
      '请为以下内容生成摘要：\n\n{{content}}\n\n要求：\n- 摘要长度约 {{length:200}} 字\n- 提取核心观点\n- 保持客观准确',
    categoryId: 'cat_analysis',
    description: '生成文章或内容的摘要',
    tags: ['摘要', '总结'],
    isSystem: true
  },
  {
    id: 'tpl_meeting_notes',
    title: '会议纪要',
    content:
      '请根据以下会议记录整理会议纪要：\n\n{{notes}}\n\n格式要求：\n1. 会议主题\n2. 参会人员\n3. 讨论要点\n4. 决议事项\n5. 待办任务',
    categoryId: 'cat_analysis',
    description: '整理会议记录为结构化纪要',
    tags: ['会议', '纪要', '工作'],
    isSystem: true
  },
  {
    id: 'tpl_weekly_report',
    title: '周报生成',
    content:
      '请根据以下工作内容生成周报：\n\n本周完成：\n{{completed}}\n\n进行中：\n{{in_progress}}\n\n下周计划：\n{{next_week:待规划}}\n\n请按照标准周报格式整理。',
    categoryId: 'cat_writing',
    description: '根据工作内容生成周报',
    tags: ['周报', '工作', '汇报'],
    isSystem: true
  },
  {
    id: 'tpl_sql_generate',
    title: 'SQL 生成',
    content:
      '请根据以下需求生成 SQL 语句：\n\n数据库类型：{{db_type|MySQL|PostgreSQL|SQLite}}\n表结构：{{schema}}\n需求：{{requirement}}\n\n请提供完整的 SQL 语句并解释。',
    categoryId: 'cat_coding',
    description: '根据需求生成 SQL 语句',
    tags: ['SQL', '数据库'],
    isSystem: true
  },
  {
    id: 'tpl_regex',
    title: '正则表达式',
    content:
      '请生成一个正则表达式，用于：{{requirement}}\n\n测试用例：\n{{test_cases:请提供测试用例}}\n\n请提供正则表达式并解释各部分含义。',
    categoryId: 'cat_coding',
    description: '根据需求生成正则表达式',
    tags: ['正则', '匹配'],
    isSystem: true
  }
]

function nowIso(): string {
  return new Date().toISOString()
}

function sanitizeText(value: string | undefined): string {
  return (value ?? '').replace(/\r/g, '').trim()
}

function sanitizeMultiline(value: string | undefined): string {
  return (value ?? '').replace(/\r/g, '').trim()
}

function sanitizeTags(tags: string[] | undefined): string[] {
  return Array.from(new Set((tags ?? []).map((tag) => sanitizeText(tag)).filter(Boolean)))
}

function inferTemplateTitle(content: string): string {
  return sanitizeText(String(content ?? '').split('\n')[0]).slice(0, 30) || '未命名模板'
}

function createDefaultState(): StoredPromptState {
  const timestamp = nowIso()
  return {
    version: 1,
    updatedAt: timestamp,
    categories: DEFAULT_CATEGORIES.map((category) => ({
      ...category,
      createdAt: timestamp,
      updatedAt: timestamp
    })),
    templates: DEFAULT_TEMPLATES.map((template, index) => ({
      ...template,
      variables: parsePromptVariables(template.content),
      isFavorite: false,
      usageCount: 0,
      order: index,
      createdAt: timestamp,
      updatedAt: timestamp
    }))
  }
}

function sortCategories(categories: PromptCategory[]): PromptCategory[] {
  return [...categories].sort((left, right) => {
    if (left.order !== right.order) return left.order - right.order
    return left.createdAt.localeCompare(right.createdAt)
  })
}

function sortTemplates(templates: PromptTemplate[]): PromptTemplate[] {
  return [...templates].sort((left, right) => {
    if (left.order !== right.order) return left.order - right.order
    return left.createdAt.localeCompare(right.createdAt)
  })
}

function normalizeState(raw: StoredPromptState | null | undefined): StoredPromptState {
  const fallback = createDefaultState()
  const source = raw ?? fallback
  const timestamp = source.updatedAt || fallback.updatedAt
  const categories = (source.categories ?? fallback.categories).map((category, index) => ({
    id: category.id || randomUUID(),
    name: sanitizeText(category.name) || '未命名分类',
    icon: sanitizeText(category.icon),
    order: Number.isFinite(category.order) ? category.order : index,
    createdAt: category.createdAt || timestamp,
    updatedAt: category.updatedAt || timestamp
  }))
  const categoryIds = new Set(categories.map((category) => category.id))
  const templates = (source.templates ?? fallback.templates).map((template, index) => ({
    id: template.id || randomUUID(),
    title: sanitizeText(template.title) || '未命名模板',
    content: sanitizeMultiline(template.content),
    categoryId:
      template.categoryId && categoryIds.has(template.categoryId) ? template.categoryId : '',
    description: sanitizeText(template.description),
    tags: sanitizeTags(template.tags),
    variables: parsePromptVariables(template.content),
    isFavorite: Boolean(template.isFavorite),
    isSystem: Boolean(template.isSystem),
    usageCount: Number.isFinite(template.usageCount) ? template.usageCount : 0,
    order: Number.isFinite(template.order) ? template.order : index,
    createdAt: template.createdAt || timestamp,
    updatedAt: template.updatedAt || timestamp
  }))

  return {
    version: 1,
    updatedAt: timestamp,
    categories: sortCategories(categories),
    templates: sortTemplates(templates)
  }
}

export class PromptService {
  private readonly paths
  private readonly repository

  constructor(rootDir: string) {
    this.paths = resolveAppDataPaths(rootDir)
    this.repository = new JsonFileRepository<StoredPromptState>(
      this.paths.files.prompts,
      createDefaultState
    )
  }

  async getState(): Promise<PromptModuleState> {
    const state = await this.readState()
    return this.toModuleState(state)
  }

  async saveCategory(input: PromptCategorySaveInput): Promise<PromptCategory> {
    const name = sanitizeText(input.name)
    const icon = sanitizeText(input.icon)
    if (!name) {
      throw new Error('分类名称不能为空')
    }

    const timestamp = nowIso()
    let savedCategory: PromptCategory | null = null

    await this.updateState((state) => {
      const categories = [...state.categories]
      const existingIndex = categories.findIndex((category) => category.id === input.id)

      if (existingIndex >= 0) {
        savedCategory = {
          ...categories[existingIndex],
          name,
          icon,
          updatedAt: timestamp
        }
        categories[existingIndex] = savedCategory
      } else {
        savedCategory = {
          id: randomUUID(),
          name,
          icon,
          order:
            categories.reduce((maxOrder, category) => Math.max(maxOrder, category.order), -1) + 1,
          createdAt: timestamp,
          updatedAt: timestamp
        }
        categories.push(savedCategory)
      }

      return {
        ...state,
        updatedAt: timestamp,
        categories: sortCategories(categories)
      }
    })

    if (!savedCategory) {
      throw new Error('分类保存失败')
    }

    return savedCategory
  }

  async reorderCategories(categoryIds: string[]): Promise<{ ok: boolean }> {
    const normalizedIds = Array.from(
      new Set((categoryIds ?? []).map((id) => sanitizeText(id)).filter(Boolean))
    )

    await this.updateState((state) => {
      const categoryMap = new Map(state.categories.map((category) => [category.id, category]))
      let nextOrder = 0

      for (const categoryId of normalizedIds) {
        const category = categoryMap.get(categoryId)
        if (!category) continue
        categoryMap.set(categoryId, { ...category, order: nextOrder++, updatedAt: nowIso() })
      }

      for (const category of sortCategories(state.categories)) {
        if (normalizedIds.includes(category.id)) continue
        categoryMap.set(category.id, { ...category, order: nextOrder++, updatedAt: nowIso() })
      }

      return {
        ...state,
        updatedAt: nowIso(),
        categories: sortCategories([...categoryMap.values()])
      }
    })

    return { ok: true }
  }

  async deleteCategory(categoryId: string): Promise<{ ok: boolean }> {
    const normalizedId = sanitizeText(categoryId)
    if (!normalizedId) {
      return { ok: false }
    }

    let removed = false

    await this.updateState((state) => {
      const categories = state.categories.filter((category) => {
        const keep = category.id !== normalizedId
        if (!keep) removed = true
        return keep
      })

      if (!removed) {
        return state
      }

      return {
        ...state,
        updatedAt: nowIso(),
        categories: sortCategories(categories),
        templates: state.templates.map((template) =>
          template.categoryId === normalizedId ? { ...template, categoryId: '' } : template
        )
      }
    })

    return { ok: removed }
  }

  async saveTemplate(input: PromptTemplateSaveInput): Promise<PromptTemplate> {
    const title = sanitizeText(input.title)
    const content = sanitizeMultiline(input.content)
    const description = sanitizeText(input.description)
    const tags = sanitizeTags(input.tags)

    if (!title) {
      throw new Error('模板标题不能为空')
    }

    if (!content) {
      throw new Error('Prompt 内容不能为空')
    }

    const timestamp = nowIso()
    let savedTemplate: PromptTemplate | null = null

    await this.updateState((state) => {
      const templates = [...state.templates]
      const categoryIds = new Set(state.categories.map((category) => category.id))
      const categoryId =
        input.categoryId && categoryIds.has(input.categoryId) ? input.categoryId : ''
      const existingIndex = templates.findIndex((template) => template.id === input.id)

      if (existingIndex >= 0) {
        const current = templates[existingIndex]
        savedTemplate = {
          ...current,
          title,
          content,
          categoryId,
          description,
          tags,
          variables: parsePromptVariables(content),
          updatedAt: timestamp
        }
        templates[existingIndex] = savedTemplate
      } else {
        savedTemplate = {
          id: randomUUID(),
          title,
          content,
          categoryId,
          description,
          tags,
          variables: parsePromptVariables(content),
          isFavorite: false,
          isSystem: false,
          usageCount: 0,
          order:
            templates.reduce((maxOrder, template) => Math.max(maxOrder, template.order), -1) + 1,
          createdAt: timestamp,
          updatedAt: timestamp
        }
        templates.push(savedTemplate)
      }

      return {
        ...state,
        updatedAt: timestamp,
        templates: sortTemplates(templates)
      }
    })

    if (!savedTemplate) {
      throw new Error('模板保存失败')
    }

    return savedTemplate
  }

  async saveAsTemplate(input: PromptSaveAsTemplateInput): Promise<PromptTemplate> {
    return this.saveTemplate({
      title: sanitizeText(input.title) || inferTemplateTitle(input.content),
      content: input.content,
      categoryId: input.categoryId,
      description: input.description,
      tags: input.tags
    })
  }

  async reorderTemplates(input: PromptTemplateReorderInput): Promise<{ ok: boolean }> {
    const categoryId = sanitizeText(input.categoryId)
    const templateIds = Array.from(
      new Set((input.templateIds ?? []).map((id) => sanitizeText(id)).filter(Boolean))
    )

    await this.updateState((state) => {
      const visibleTemplates = state.templates.filter((template) =>
        categoryId ? template.categoryId === categoryId : !template.categoryId
      )
      const visibleIds = new Set(visibleTemplates.map((template) => template.id))
      const templateMap = new Map(
        visibleTemplates.map((template) => [template.id, { ...template }] as const)
      )
      let nextOrder = 0

      for (const templateId of templateIds) {
        const template = templateMap.get(templateId)
        if (!template) continue
        templateMap.set(templateId, { ...template, order: nextOrder++, updatedAt: nowIso() })
      }

      for (const template of sortTemplates(visibleTemplates)) {
        if (templateIds.includes(template.id)) continue
        templateMap.set(template.id, { ...template, order: nextOrder++, updatedAt: nowIso() })
      }

      return {
        ...state,
        updatedAt: nowIso(),
        templates: sortTemplates(
          state.templates.map((template) =>
            visibleIds.has(template.id) ? (templateMap.get(template.id) ?? template) : template
          )
        )
      }
    })

    return { ok: true }
  }

  async deleteTemplate(templateId: string): Promise<{ ok: boolean }> {
    const normalizedId = sanitizeText(templateId)
    if (!normalizedId) {
      return { ok: false }
    }

    let removed = false

    await this.updateState((state) => {
      const templates = state.templates.filter((template) => {
        const keep = template.id !== normalizedId
        if (!keep) removed = true
        return keep
      })

      if (!removed) {
        return state
      }

      return {
        ...state,
        updatedAt: nowIso(),
        templates: sortTemplates(templates)
      }
    })

    return { ok: removed }
  }

  async toggleFavorite(templateId: string): Promise<{ isFavorite: boolean }> {
    const normalizedId = sanitizeText(templateId)
    let nextFavorite: boolean | null = null

    await this.updateState((state) => {
      const templates = state.templates.map((template) => {
        if (template.id !== normalizedId) return template
        nextFavorite = !template.isFavorite
        return {
          ...template,
          isFavorite: nextFavorite,
          updatedAt: nowIso()
        }
      })

      if (nextFavorite === null) {
        throw new Error('模板不存在')
      }

      return {
        ...state,
        updatedAt: nowIso(),
        templates: sortTemplates(templates)
      }
    })

    return { isFavorite: Boolean(nextFavorite) }
  }

  async useTemplate(input: PromptTemplateUseInput): Promise<PromptTemplateUseResult> {
    const templateId = sanitizeText(input.templateId)
    let result: PromptTemplateUseResult | null = null

    await this.updateState((state) => {
      const templates = state.templates.map((template) => {
        if (template.id !== templateId) return template

        const updatedTemplate = {
          ...template,
          usageCount: template.usageCount + 1,
          updatedAt: nowIso()
        }
        result = {
          content: fillPromptTemplate(template.content, input.values ?? {}),
          template: updatedTemplate
        }
        return updatedTemplate
      })

      if (!result) {
        throw new Error('模板不存在')
      }

      return {
        ...state,
        updatedAt: nowIso(),
        templates: sortTemplates(templates)
      }
    })

    if (!result) {
      throw new Error('模板使用失败')
    }

    return result
  }

  parseVariables(content: string): PromptVariable[] {
    return parsePromptVariables(content)
  }

  async exportTemplates(input: PromptExportInput = {}): Promise<PromptExportDocument> {
    const state = await this.readState()
    const selectedIds = new Set(
      (input.templateIds ?? []).map((id) => sanitizeText(id)).filter(Boolean)
    )
    const templates = selectedIds.size
      ? state.templates.filter((template) => selectedIds.has(template.id))
      : state.templates
    const categoryIds = new Set(templates.map((template) => template.categoryId).filter(Boolean))

    const document: PromptExportDocument = {
      version: '1.0',
      export_time: nowIso(),
      templates: templates.map(
        (template): PromptExportTemplate => ({
          title: template.title,
          content: template.content,
          description: template.description,
          tags: template.tags,
          category_id: template.categoryId || undefined
        })
      )
    }

    if (input.includeCategories !== false && categoryIds.size > 0) {
      document.categories = state.categories
        .filter((category) => categoryIds.has(category.id))
        .map((category) => ({
          id: category.id,
          name: category.name,
          icon: category.icon
        }))
    }

    return document
  }

  async importTemplates(input: PromptImportInput): Promise<PromptImportResult> {
    let parsed: {
      categories?: Array<{ id?: string; name?: string; icon?: string }>
      templates?: Array<{
        title?: string
        content?: string
        description?: string
        tags?: string[]
        category_id?: string
      }>
    }

    try {
      parsed = JSON.parse(input.json)
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Prompt 导入 JSON 解析失败')
    }

    const result: PromptImportResult = {
      imported: 0,
      skipped: 0,
      errors: []
    }

    await this.updateState((state) => {
      const timestamp = nowIso()
      const categories = [...state.categories]
      const templates = [...state.templates]
      const categoryMap = new Map<string, string>()

      for (const category of parsed.categories ?? []) {
        const name = sanitizeText(category.name)
        if (!name) continue
        const existing = categories.find((item) => item.name === name)
        if (existing) {
          if (category.id) {
            categoryMap.set(category.id, existing.id)
          }
          continue
        }
        const created: PromptCategory = {
          id: randomUUID(),
          name,
          icon: sanitizeText(category.icon),
          order: categories.reduce((maxOrder, item) => Math.max(maxOrder, item.order), -1) + 1,
          createdAt: timestamp,
          updatedAt: timestamp
        }
        categories.push(created)
        if (category.id) {
          categoryMap.set(category.id, created.id)
        }
      }

      for (const importedTemplate of parsed.templates ?? []) {
        const title = sanitizeText(importedTemplate.title)
        const content = sanitizeMultiline(importedTemplate.content)
        if (!title || !content) {
          result.errors.push('模板缺少标题或内容')
          continue
        }

        const description = sanitizeText(importedTemplate.description)
        const tags = sanitizeTags(importedTemplate.tags)
        const categoryId = importedTemplate.category_id
          ? (categoryMap.get(importedTemplate.category_id) ?? '')
          : ''
        const existing = templates.find((template) => template.title === title)

        if (existing) {
          if (input.overwrite) {
            const existingIndex = templates.findIndex((template) => template.id === existing.id)
            templates[existingIndex] = {
              ...existing,
              title,
              content,
              description,
              tags,
              categoryId,
              variables: parsePromptVariables(content),
              updatedAt: timestamp
            }
            result.imported += 1
          } else {
            result.skipped += 1
          }
          continue
        }

        templates.push({
          id: randomUUID(),
          title,
          content,
          categoryId,
          description,
          tags,
          variables: parsePromptVariables(content),
          isFavorite: false,
          isSystem: false,
          usageCount: 0,
          order:
            templates.reduce((maxOrder, template) => Math.max(maxOrder, template.order), -1) + 1,
          createdAt: timestamp,
          updatedAt: timestamp
        })
        result.imported += 1
      }

      return {
        ...state,
        updatedAt: timestamp,
        categories: sortCategories(categories),
        templates: sortTemplates(templates)
      }
    })

    return result
  }

  async exportBackupSection(): Promise<Pick<PromptModuleState, 'categories' | 'templates'>> {
    const state = await this.readState()
    return {
      categories: [...state.categories],
      templates: [...state.templates]
    }
  }

  async restoreBackupSection(
    section: Pick<PromptModuleState, 'categories' | 'templates'>
  ): Promise<PromptModuleState> {
    const restored = normalizeState({
      version: 1,
      updatedAt: nowIso(),
      categories: section.categories ?? [],
      templates: section.templates ?? []
    })
    await ensureAppDataLayout(this.paths)
    await this.repository.write(restored)
    return this.toModuleState(restored)
  }

  private async readState(): Promise<StoredPromptState> {
    await ensureAppDataLayout(this.paths)
    const raw = await this.repository.read()
    const normalized = normalizeState(raw)

    if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
      await this.repository.write(normalized)
    }

    return normalized
  }

  private async updateState(
    mutator: (state: StoredPromptState) => StoredPromptState | Promise<StoredPromptState>
  ): Promise<StoredPromptState> {
    await ensureAppDataLayout(this.paths)

    return this.repository.update(async (raw) => {
      const normalized = normalizeState(raw)
      return normalizeState(await mutator(normalized))
    })
  }

  private toModuleState(state: StoredPromptState): PromptModuleState {
    return {
      storageFile: this.paths.files.prompts,
      updatedAt: state.updatedAt,
      categories: sortCategories(state.categories),
      templates: sortTemplates(state.templates)
    }
  }
}
