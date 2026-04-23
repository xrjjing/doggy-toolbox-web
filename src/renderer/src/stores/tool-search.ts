import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { toolCatalog } from '@renderer/features/tools/catalog'
import type { ToolKind } from '@renderer/features/tools/types'

/**
 * 旧项目全局搜索的 Vue 版实现。
 * 这里不再从 DOM 反查导航，而是直接消费 `toolCatalog` 和固定模块注册表，
 * 让“能搜索到什么”和“新仓实际有哪些路由 / 工具入口”保持同一份 TypeScript 事实。
 */
export type SearchTargetKind = 'route' | 'tool'

export type ToolSearchTarget = {
  id: string
  label: string
  description: string
  category: string
  kind: SearchTargetKind
  path: string
  tool?: ToolKind
  keywords: string[]
}

const TOOL_SEARCH_STORAGE_KEY = 'doggy-toolbox-web:tool-search'

const routeTargets: ToolSearchTarget[] = [
  {
    id: 'dashboard',
    label: '总览',
    description: '查看运行时、Codex / Claude 本机配置和迁移概览。',
    category: '工作台',
    kind: 'route',
    path: '/',
    keywords: ['dashboard', 'runtime', 'zonglan', 'yunxing']
  },
  {
    id: 'commands',
    label: '命令管理',
    description: '管理常用命令分组、命令卡片和 AI 说明。',
    category: '本地资料',
    kind: 'route',
    path: '/commands',
    keywords: ['command', 'mingling', 'shell']
  },
  {
    id: 'credentials',
    label: '凭证管理',
    description: '管理账号、密码、token 与本机 safeStorage 编码。',
    category: '本地资料',
    kind: 'route',
    path: '/credentials',
    keywords: ['credential', 'password', 'mima', 'pingzheng']
  },
  {
    id: 'prompts',
    label: 'Prompt 模板',
    description: '管理 Prompt 分类、变量、收藏和 AI 审查。',
    category: 'AI',
    kind: 'route',
    path: '/prompts',
    keywords: ['prompt', 'template', 'moban']
  },
  {
    id: 'nodes',
    label: '节点列表',
    description: '管理节点资料、标签筛选和分享链接导入。',
    category: '网络与节点',
    kind: 'route',
    path: '/nodes',
    keywords: ['node', 'proxy', 'jiedian']
  },
  {
    id: 'http',
    label: 'HTTP 集合',
    description: '管理 HTTP 请求、环境变量、历史、批量测试和 AI 分析。',
    category: '网络与节点',
    kind: 'route',
    path: '/http',
    keywords: ['http', 'api', 'curl', 'postman']
  },
  {
    id: 'backup',
    label: '备份恢复',
    description: '导出或覆盖恢复命令、凭证、Prompt、节点、HTTP、AI 设置。',
    category: '维护',
    kind: 'route',
    path: '/backup',
    keywords: ['backup', 'restore', 'beifen']
  },
  {
    id: 'legacy-import',
    label: '旧数据导入',
    description: '识别旧项目总备份和旧 Prompt 导出 JSON。',
    category: '维护',
    kind: 'route',
    path: '/legacy-import',
    keywords: ['legacy', 'import', 'daoru']
  },
  {
    id: 'ai',
    label: 'AI Bridge',
    description: '本机 Codex / Claude SDK 会话、历史和 SDK-only 设置。',
    category: 'AI',
    kind: 'route',
    path: '/ai',
    keywords: ['ai', 'codex', 'claude', 'sdk']
  }
]

const toolTargets: ToolSearchTarget[] = toolCatalog.map((tool) => ({
  id: `tool:${tool.key}`,
  label: tool.title,
  description: tool.description,
  category: '工具工作台',
  kind: 'tool',
  path: `/tools?tool=${tool.key}`,
  tool: tool.key,
  keywords: [tool.key, tool.title.toLowerCase(), tool.description.toLowerCase()]
}))

const allTargets = [...routeTargets, ...toolTargets]

type StoredSearchPreferences = {
  favorites: string[]
  recent: string[]
  usage: Array<[string, number]>
}

function loadPreferences(): StoredSearchPreferences {
  try {
    const raw = localStorage.getItem(TOOL_SEARCH_STORAGE_KEY)
    if (!raw) return { favorites: [], recent: [], usage: [] }
    const parsed = JSON.parse(raw) as Partial<StoredSearchPreferences>
    return {
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      recent: Array.isArray(parsed.recent) ? parsed.recent : [],
      usage: Array.isArray(parsed.usage) ? parsed.usage : []
    }
  } catch {
    return { favorites: [], recent: [], usage: [] }
  }
}

function savePreferences(input: StoredSearchPreferences): void {
  localStorage.setItem(TOOL_SEARCH_STORAGE_KEY, JSON.stringify(input))
}

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase()
}

function matchesTarget(target: ToolSearchTarget, query: string): boolean {
  if (!query) return true
  return [target.label, target.description, target.category, target.id, ...target.keywords]
    .join('\n')
    .toLowerCase()
    .includes(query)
}

function calculateScore(
  target: ToolSearchTarget,
  query: string,
  usageStats: Map<string, number>
): number {
  if (!query) return usageStats.get(target.id) ?? 0
  const label = target.label.toLowerCase()
  let score = 0
  if (label.startsWith(query)) score += 120
  if (label.includes(query)) score += 60
  for (const keyword of target.keywords) {
    if (keyword.startsWith(query)) score += 30
    if (keyword.includes(query)) score += 12
  }
  score += (usageStats.get(target.id) ?? 0) * 2
  return score
}

export const useToolSearchStore = defineStore('tool-search', () => {
  const stored = loadPreferences()
  const isOpen = ref(false)
  const query = ref('')
  const selectedIndex = ref(0)
  const favorites = ref(new Set(stored.favorites))
  const recent = ref(stored.recent)
  const usageStats = ref(new Map(stored.usage))

  const normalizedQuery = computed(() => normalizeQuery(query.value))
  const favoriteTargets = computed(() =>
    allTargets.filter(
      (target) => favorites.value.has(target.id) && matchesTarget(target, normalizedQuery.value)
    )
  )
  const recentTargets = computed(() =>
    recent.value
      .map((id) => allTargets.find((target) => target.id === id))
      .filter((target): target is ToolSearchTarget => Boolean(target))
      .filter((target) => !favorites.value.has(target.id))
      .filter((target) => matchesTarget(target, normalizedQuery.value))
      .slice(0, 8)
  )
  const searchResults = computed(() =>
    allTargets
      .filter((target) => !favorites.value.has(target.id))
      .filter((target) => !recent.value.includes(target.id) || normalizedQuery.value)
      .filter((target) => matchesTarget(target, normalizedQuery.value))
      .sort(
        (left, right) =>
          calculateScore(right, normalizedQuery.value, usageStats.value) -
          calculateScore(left, normalizedQuery.value, usageStats.value)
      )
      .slice(0, normalizedQuery.value ? 12 : 24)
  )
  const visibleResults = computed(() => [
    ...favoriteTargets.value,
    ...(!normalizedQuery.value ? recentTargets.value : []),
    ...searchResults.value
  ])
  const groupedResults = computed(() => [
    { title: '收藏', targets: favoriteTargets.value },
    { title: '最近使用', targets: normalizedQuery.value ? [] : recentTargets.value },
    { title: normalizedQuery.value ? '搜索结果' : '全部入口', targets: searchResults.value }
  ])

  function persist(): void {
    savePreferences({
      favorites: Array.from(favorites.value),
      recent: recent.value,
      usage: Array.from(usageStats.value.entries())
    })
  }

  function open(): void {
    isOpen.value = true
    query.value = ''
    selectedIndex.value = 0
  }

  function close(): void {
    isOpen.value = false
  }

  function setQuery(value: string): void {
    query.value = value
    selectedIndex.value = 0
  }

  function moveSelection(delta: number): void {
    if (visibleResults.value.length === 0) {
      selectedIndex.value = 0
      return
    }
    const next = selectedIndex.value + delta
    selectedIndex.value = Math.max(0, Math.min(visibleResults.value.length - 1, next))
  }

  function toggleFavorite(targetId: string): void {
    const next = new Set(favorites.value)
    if (next.has(targetId)) {
      next.delete(targetId)
    } else {
      next.add(targetId)
    }
    favorites.value = next
    persist()
  }

  function trackUsage(targetId: string): void {
    usageStats.value.set(targetId, (usageStats.value.get(targetId) ?? 0) + 1)
    recent.value = [targetId, ...recent.value.filter((id) => id !== targetId)].slice(0, 12)
    persist()
  }

  return {
    isOpen,
    query,
    selectedIndex,
    favorites,
    recent,
    usageStats,
    groupedResults,
    visibleResults,
    open,
    close,
    setQuery,
    moveSelection,
    toggleFavorite,
    trackUsage
  }
})
