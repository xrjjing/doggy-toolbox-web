import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  fillPromptTemplate,
  parsePromptVariables,
  PromptService
} from '../src/main/services/prompt-service'
import { resolveAppDataPaths } from '../src/main/services/app-data'

async function createService(): Promise<{ rootDir: string; service: PromptService }> {
  const rootDir = await mkdtemp(join(tmpdir(), 'doggy-toolbox-web-prompts-'))
  return {
    rootDir,
    service: new PromptService(rootDir)
  }
}

describe('PromptService', () => {
  it('bootstraps default categories and templates', async () => {
    const { rootDir, service } = await createService()

    const state = await service.getState()
    const fileContent = await readFile(resolveAppDataPaths(rootDir).files.prompts, 'utf8')

    expect(state.categories.map((category) => category.id)).toContain('cat_coding')
    expect(state.templates.map((template) => template.id)).toContain('tpl_code_explain')
    expect(JSON.parse(fileContent)).toMatchObject({
      version: 1
    })
  })

  it('parses and fills prompt variables with defaults and options', () => {
    const variables = parsePromptVariables(
      '请用 {{language:typescript}} 解释 {{topic}}，风格 {{style|简洁|详细}}。重复 {{topic}}'
    )

    expect(variables).toEqual([
      { name: 'language', type: 'text', defaultValue: 'typescript', options: [] },
      { name: 'topic', type: 'text', defaultValue: '', options: [] },
      { name: 'style', type: 'select', defaultValue: '简洁', options: ['简洁', '详细'] }
    ])
    expect(fillPromptTemplate('语言 {{language:ts}}，风格 {{style|简洁|详细}}', {})).toBe(
      '语言 ts，风格 简洁'
    )
    expect(fillPromptTemplate('语言 {{language:ts}}', { language: 'vue' })).toBe('语言 vue')
  })

  it('saves templates, toggles favorite and increments usage', async () => {
    const { service } = await createService()
    const category = await service.saveCategory({ name: '排障', icon: 'DBG' })
    const template = await service.saveTemplate({
      title: '日志分析',
      content: '请分析 {{log}}，输出 {{format|摘要|清单}}。',
      categoryId: category.id,
      tags: ['log', 'debug']
    })
    const favorite = await service.toggleFavorite(template.id)
    const used = await service.useTemplate({
      templateId: template.id,
      values: { log: 'error stack', format: '清单' }
    })
    const state = await service.getState()
    const updatedTemplate = state.templates.find((item) => item.id === template.id)

    expect(template.variables.map((variable) => variable.name)).toEqual(['log', 'format'])
    expect(favorite.isFavorite).toBe(true)
    expect(used.content).toBe('请分析 error stack，输出 清单。')
    expect(updatedTemplate?.usageCount).toBe(1)
    expect(updatedTemplate?.isFavorite).toBe(true)
  })
})
