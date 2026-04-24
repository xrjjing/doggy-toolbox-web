import { defineStore } from 'pinia'
import type {
  AppAppearance,
  AppThemeId,
  RuntimeInfo,
  TitlebarMode
} from '../../../shared/ipc-contract'

export type { AppAppearance, AppThemeId, TitlebarMode } from '../../../shared/ipc-contract'

/**
 * 应用级外观与运行时信息 store。
 * 这里承接 renderer 能立刻消费的 UI 状态，并把真正依赖主进程的信息拆到单独字段，
 * 这样主题切换可本地秒生效，而运行时探测仍然通过 IPC 按需拉取。
 */

/**
 * 新仓沿用旧项目的九套主题名称，方便迁移时对照原有视觉风格。
 */
/**
 * 旧项目毛玻璃不是线性透明度，而是做过一层幂函数映射。
 * 保留这层转换后，新仓的 45-95 输入区间更接近旧视觉手感。
 */
export function mapGlassOpacitySetting(percent: number): number {
  return Math.pow(percent / 100, 0.65)
}

/**
 * 外观快照只是一份普通对象。
 * 单独提供 clone 方法的目的，是让“设置弹窗草稿 / 原始值 / 当前预览值”三套状态共享同一份复制语义，
 * 避免后续在组件里手写展开对象时漏字段。
 */
export function cloneAppearance(input: AppAppearance): AppAppearance {
  return {
    theme: input.theme,
    glassMode: input.glassMode,
    glassOpacity: input.glassOpacity,
    uiScale: input.uiScale,
    titlebarMode: input.titlebarMode
  }
}

export const appThemeOptions: Array<{ label: string; value: AppThemeId; dark: boolean }> = [
  { label: 'Light 清爽日间', value: 'light', dark: false },
  { label: 'Cute 棉花糖', value: 'cute', dark: false },
  { label: 'Office 办公专注', value: 'office', dark: false },
  { label: 'Neon Light 日间霓虹', value: 'neon-light', dark: false },
  { label: 'Cyberpunk Light 日间赛博', value: 'cyberpunk-light', dark: false },
  { label: 'Dark 深灰', value: 'dark', dark: true },
  { label: 'Neon 极光', value: 'neon', dark: true },
  { label: 'Cyberpunk 故障艺术', value: 'cyberpunk', dark: true },
  { label: 'Void 黑金', value: 'void', dark: true }
]

export const titlebarModeOptions: Array<{ label: string; value: TitlebarMode }> = [
  { label: '固定模式', value: 'fixed' },
  { label: '极简模式', value: 'minimal' }
]

const APPEARANCE_STORAGE_KEY = 'doggy-toolbox-web:appearance'

/**
 * 默认值刻意保持温和，确保首次启动和 localStorage 损坏时都能稳定回退。
 */
export const defaultAppearance: AppAppearance = {
  theme: 'dark',
  glassMode: true,
  glassOpacity: 72,
  uiScale: 80,
  titlebarMode: 'fixed'
}

/**
 * 统一规范化外观输入。
 * 这里把本地存档、表单 patch、未来主进程回填都收口到同一逻辑，
 * 避免多个入口各自做边界裁剪后产生不一致的显示结果。
 */
function normalizeAppearance(input: Partial<AppAppearance> = {}): AppAppearance {
  const themes = new Set(appThemeOptions.map((theme) => theme.value))
  // 主题 id 只接受预定义列表，旧数据或非法值一律回退默认主题。
  const theme = themes.has(input.theme as AppThemeId)
    ? (input.theme as AppThemeId)
    : defaultAppearance.theme
  // 玻璃透明度和缩放都做硬边界裁剪，避免异常值把界面推到不可读状态。
  const glassOpacity = Number.isFinite(input.glassOpacity)
    ? Math.max(45, Math.min(95, Number(input.glassOpacity)))
    : defaultAppearance.glassOpacity
  const uiScale = Number.isFinite(input.uiScale)
    ? Math.max(50, Math.min(100, Number(input.uiScale)))
    : defaultAppearance.uiScale
  return {
    theme,
    glassMode: Boolean(input.glassMode),
    glassOpacity,
    uiScale,
    titlebarMode: input.titlebarMode === 'minimal' ? 'minimal' : defaultAppearance.titlebarMode
  }
}

/**
 * 外观设置只在 renderer 环境读取。
 * Electron renderer 刷新后会立刻恢复主题、玻璃和缩放，而无需等待主进程返回。
 */
function loadAppearance(): AppAppearance {
  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY)
    return normalizeAppearance(raw ? (JSON.parse(raw) as Partial<AppAppearance>) : {})
  } catch {
    // localStorage 读不到、JSON 损坏都直接回默认态，保证刷新后界面仍可进入。
    return normalizeAppearance()
  }
}

/**
 * renderer 侧只缓存最终生效的外观快照，不额外保存草稿态。
 */
function saveAppearance(appearance: AppAppearance): void {
  localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance))
}

export const useAppStore = defineStore('app', {
  state: () => ({
    // 首屏主题直接从本地恢复，避免页面先闪默认主题再切换。
    appearance: loadAppearance(),
    // 运行时信息来自 preload IPC，和本地 UI 外观分开管理。
    runtimeInfo: null as RuntimeInfo | null
  }),
  getters: {
    themeMeta: (state) =>
      appThemeOptions.find((theme) => theme.value === state.appearance.theme) ?? appThemeOptions[0],
    isDark: (state) =>
      appThemeOptions.find((theme) => theme.value === state.appearance.theme)?.dark ?? false,
    currentThemeLabel: (state) =>
      appThemeOptions.find((theme) => theme.value === state.appearance.theme)?.label ??
      state.appearance.theme
  },
  actions: {
    /**
     * 只把外观预览到当前 renderer，不落盘。
     * 这个入口专门给“设置弹窗草稿态”使用，允许用户先看效果，再决定保存还是恢复。
     */
    previewAppearance(nextAppearance: AppAppearance) {
      this.appearance = normalizeAppearance(nextAppearance)
      void window.doggy.applyAppearance(this.appearance).catch(() => {
        // 预览失败不阻断 renderer 本地态，避免设置弹窗变成不可操作状态。
      })
    },
    /**
     * 把完整外观快照写回 store 并持久化。
     * 和 `applyAppearance()` 的 patch 语义分开后，设置弹窗保存时可以直接提交最终草稿。
     */
    commitAppearance(nextAppearance: AppAppearance) {
      this.appearance = normalizeAppearance(nextAppearance)
      saveAppearance(this.appearance)
      void window.doggy.applyAppearance(this.appearance).catch(() => {
        // 主进程窗口应用失败时仍保留本地设置，用户可继续调整或刷新。
      })
    },
    /**
     * 统一通过这一入口变更外观。
     * 这样后续如果需要同步到主进程配置文件，只需要改这里，不必逐个控件重写。
     */
    applyAppearance(patch: Partial<AppAppearance>) {
      this.commitAppearance({ ...this.appearance, ...patch })
    },
    /**
     * 显式主题切换入口，供选择器、快捷入口等直接指定目标主题。
     */
    setTheme(theme: AppThemeId) {
      this.applyAppearance({ theme })
    },
    /**
     * 深浅模式快捷切换只在 light/dark 之间跳转，
     * 不会尝试推断 cute / neon 等主题对应的“暗色同类项”，避免语义歧义。
     */
    toggleTheme(value?: boolean) {
      const targetDark = typeof value === 'boolean' ? value : !this.isDark
      this.applyAppearance({ theme: targetDark ? 'dark' : 'light' })
    },
    /**
     * 重置时直接覆盖为默认快照，而不是逐字段回滚，避免未来新增字段漏清理。
     */
    resetAppearance() {
      this.commitAppearance(cloneAppearance(defaultAppearance))
    },
    /**
     * 运行时信息只读展示，不参与本地缓存。
     * 每次主动拉取都以主进程最新探测结果为准。
     */
    async loadRuntimeInfo() {
      this.runtimeInfo = await window.doggy.getRuntimeInfo()
    }
  }
})
