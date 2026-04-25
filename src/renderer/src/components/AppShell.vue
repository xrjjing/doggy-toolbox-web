<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, useAttrs } from 'vue'
import { useMessage } from 'naive-ui'
import { useRoute } from 'vue-router'
import { NButton, NIcon, NSwitch, NTag } from 'naive-ui'
import {
  ChatbubblesOutline,
  ChevronBackOutline,
  ChevronDownOutline,
  ChevronUpOutline,
  CloudUploadOutline,
  ContrastOutline,
  DownloadOutline,
  GlobeOutline,
  KeyOutline,
  LibraryOutline,
  GridOutline,
  MenuOutline,
  MoonOutline,
  OptionsOutline,
  PawOutline,
  TerminalOutline,
  SunnyOutline
} from '@vicons/ionicons5'
import {
  cloneAppearance,
  describeRuntimeHealth,
  getTitlebarModeLabel,
  mapUiScaleDisplayPercent,
  useAppStore,
  type AppAppearance
} from '@renderer/stores/app'
import { useToolSearchStore } from '@renderer/stores/tool-search'

const GlobalSearchModal = defineAsyncComponent(
  () => import('@renderer/components/GlobalSearchModal.vue')
)
import AppearanceSettingsModal from '@renderer/components/AppearanceSettingsModal.vue'
import BrandMascot from '@renderer/components/BrandMascot.vue'

const route = useRoute()
const appStore = useAppStore()
const toolSearchStore = useToolSearchStore()
const attrs = useAttrs()
const message = useMessage()
const showAppearanceModal = ref(false)
const appearanceModalOrigin = ref<AppAppearance>(cloneAppearance(appStore.appearance))
const appearanceSavedAt = ref<string | null>(null)
const isSidebarCollapsed = ref(false)
const isTopbarCollapsed = ref(true)

const navItems = [
  { path: '/tools', label: '开发工具', icon: GridOutline },
  { path: '/commands', label: '命令管理', icon: TerminalOutline },
  { path: '/credentials', label: '凭证管理', icon: KeyOutline },
  { path: '/http', label: 'HTTP 集合', icon: GlobeOutline },
  { path: '/backup', label: '备份恢复', icon: CloudUploadOutline },
  { path: '/legacy-import', label: '旧数据导入', icon: DownloadOutline },
  { path: '/ai', label: 'AI Bridge', icon: ChatbubblesOutline },
  { path: '/prompts', label: 'Prompt 模板', icon: LibraryOutline }
]

const runtimeText = computed(() => {
  const info = appStore.runtimeInfo
  if (!info) return '检测中'
  return `${info.platform} · ${info.appVersion}`
})

const runtimeBadges = computed(() => {
  const info = appStore.runtimeInfo
  if (!info) return []
  const codexHealth = describeRuntimeHealth('Codex', info.codex)
  const claudeHealth = describeRuntimeHealth('Claude', info.claude)
  return [
    {
      label: 'Codex',
      value: codexHealth.headline,
      type: codexHealth.tone
    },
    {
      label: 'Claude',
      value: claudeHealth.headline,
      type: claudeHealth.tone
    }
  ]
})

const appearanceSummary = computed(() => {
  const appearance = appStore.appearance
  return [
    `${appStore.currentThemeLabel}`,
    appearance.glassMode ? `毛玻璃 ${appearance.glassOpacity}%` : '实底模式',
    `缩放 ${mapUiScaleDisplayPercent(appearance.uiScale)}%`,
    getTitlebarModeLabel(appearance.titlebarMode)
  ].join(' · ')
})

const compactAppearanceSummary = computed(() => {
  const appearance = appStore.appearance
  return [
    appStore.currentThemeLabel,
    appearance.glassMode ? `毛玻璃 ${appearance.glassOpacity}%` : '实底模式',
    `缩放 ${mapUiScaleDisplayPercent(appearance.uiScale)}%`
  ].join(' · ')
})

const currentNavLabel = computed(
  () => navItems.find((item) => route.path.startsWith(item.path))?.label ?? '当前页'
)

function resolveTagType(type: string): 'success' | 'warning' | 'default' {
  if (type === 'success' || type === 'warning') {
    return type
  }
  return 'default'
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    toolSearchStore.open()
  }
  if (event.key === 'Escape' && toolSearchStore.isOpen) {
    toolSearchStore.close()
  }
}

onMounted(() => {
  void appStore.loadRuntimeInfo()
  window.addEventListener('keydown', handleGlobalKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})

/**
 * 顶部现在只保留外观摘要和设置入口。
 * 真正的细项控制统一放回弹窗，避免首页快捷控件和设置页重复、互相打架。
 */
function openAppearanceModal(): void {
  appearanceModalOrigin.value = cloneAppearance(appStore.appearance)
  showAppearanceModal.value = true
}

function previewAppearance(appearance: AppAppearance): void {
  appStore.previewAppearance(appearance)
}

function cancelAppearanceModal(): void {
  appStore.previewAppearance(cloneAppearance(appearanceModalOrigin.value))
}

function saveAppearanceModal(appearance: AppAppearance): void {
  appStore.commitAppearance(appearance)
  appearanceModalOrigin.value = cloneAppearance(appearance)
  appearanceSavedAt.value = new Date().toISOString()
  message.success('外观设置已保存')
}

function closeAppearanceModal(): void {
  cancelAppearanceModal()
  appearanceModalOrigin.value = cloneAppearance(appStore.appearance)
  showAppearanceModal.value = false
}

function confirmAppearanceModal(appearance: AppAppearance): void {
  saveAppearanceModal(appearance)
  appearanceModalOrigin.value = cloneAppearance(appStore.appearance)
  showAppearanceModal.value = false
}

function toggleSidebar(): void {
  isSidebarCollapsed.value = !isSidebarCollapsed.value
}

function toggleTopbarCollapsed(): void {
  isTopbarCollapsed.value = !isTopbarCollapsed.value
}
</script>

<template>
  <div
    class="app-frame"
    v-bind="attrs"
    :class="{ 'is-dark': appStore.isDark }"
    :data-theme="appStore.appearance.theme"
    :data-glass="appStore.appearance.glassMode ? 'true' : 'false'"
    :data-titlebar-mode="appStore.appearance.titlebarMode"
    :data-appearance-saved="appearanceSavedAt ? 'true' : 'false'"
  >
    <div class="window-drag-strip" />

    <aside class="sidebar" :class="{ collapsed: isSidebarCollapsed }">
      <div class="sidebar-header">
        <section class="brand-card" :class="{ collapsed: isSidebarCollapsed }">
          <div class="brand-mark" aria-hidden="true">
            <BrandMascot />
          </div>
          <div v-show="!isSidebarCollapsed">
            <p class="eyebrow">Doggy Toolbox</p>
            <h1>百宝箱 Web</h1>
          </div>
        </section>
        <button
          class="sidebar-toggle"
          type="button"
          :aria-label="isSidebarCollapsed ? '展开导航栏' : '收起导航栏'"
          @click="toggleSidebar"
        >
          <NIcon :component="isSidebarCollapsed ? MenuOutline : ChevronBackOutline" />
        </button>
      </div>

      <nav class="nav-list">
        <RouterLink
          v-for="item in navItems"
          :key="item.path"
          class="nav-item"
          :class="{ active: route.path === item.path }"
          :title="item.label"
          :to="item.path"
        >
          <NIcon :component="item.icon" />
          <span v-show="!isSidebarCollapsed">{{ item.label }}</span>
        </RouterLink>
      </nav>

      <section v-show="!isSidebarCollapsed" class="side-note">
        <NTag size="small" :bordered="false" type="warning">Electron 基线</NTag>
        <p>当前阶段先保证可运行、可打包、可持续迁移。</p>
      </section>
    </aside>

    <main class="main-panel">
      <header class="topbar" :class="{ collapsed: isTopbarCollapsed }">
        <template v-if="isTopbarCollapsed">
          <div class="topbar-collapsed-strip">
            <div class="topbar-collapsed-copy">
              <p class="eyebrow">{{ currentNavLabel }} · workspace</p>
              <strong>{{ runtimeText }}</strong>
              <span>{{ compactAppearanceSummary }}</span>
            </div>

            <div class="topbar-collapsed-actions">
              <NButton secondary round size="small" class="window-action" @click="openAppearanceModal">
                <template #icon>
                  <NIcon :component="OptionsOutline" />
                </template>
                外观设置
              </NButton>
              <button
                class="topbar-collapse-handle is-collapsed"
                type="button"
                aria-label="展开工作区概览"
                @click="toggleTopbarCollapsed"
              >
                <NIcon :component="ChevronDownOutline" />
              </button>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="topbar-content">
            <div class="topbar-left">
              <div class="topbar-meta">
                <p class="eyebrow">runtime</p>
                <strong>{{ runtimeText }}</strong>
                <div class="topbar-badges">
                  <NTag
                    v-for="badge in runtimeBadges"
                    :key="badge.label"
                    size="small"
                    :type="resolveTagType(badge.type)"
                    :bordered="false"
                  >
                    {{ badge.label }} {{ badge.value }}
                  </NTag>
                </div>
              </div>

              <button class="appearance-summary-card" type="button" @click="openAppearanceModal">
                <div class="appearance-summary-copy">
                  <p class="eyebrow">appearance</p>
                  <strong>{{ appearanceSummary }}</strong>
                  <span class="appearance-meta-line">
                    外观细项统一收口到设置弹窗，避免首页和设置页重复控制。
                  </span>
                </div>
                <span class="appearance-summary-icon">
                  <NIcon :component="ContrastOutline" />
                </span>
              </button>
            </div>

            <div class="topbar-actions">
              <div class="topbar-theme-switch">
                <NIcon :component="SunnyOutline" />
                <NSwitch :value="appStore.isDark" @update:value="appStore.toggleTheme" />
                <NIcon :component="MoonOutline" />
              </div>
              <div class="window-title-pill">
                <NIcon :component="PawOutline" />
                <span>{{
                  appStore.appearance.titlebarMode === 'minimal' ? '简约窗口' : '正常窗口'
                }}</span>
              </div>
              <NButton secondary round class="window-action" @click="toolSearchStore.open">
                全局搜索 ⌘K
              </NButton>
              <NButton secondary round class="window-action" @click="openAppearanceModal">
                <template #icon>
                  <NIcon :component="OptionsOutline" />
                </template>
                外观设置
              </NButton>
              <NButton secondary round class="window-action" @click="appStore.loadRuntimeInfo()">
                刷新本机配置
              </NButton>
            </div>
          </div>

          <div class="topbar-toggle-row">
            <button
              class="topbar-collapse-handle"
              type="button"
              aria-label="收起工作区概览"
              @click="toggleTopbarCollapsed"
            >
              <NIcon :component="ChevronUpOutline" />
            </button>
          </div>
        </template>
      </header>

      <RouterView />
    </main>
  </div>

  <AppearanceSettingsModal
    v-if="showAppearanceModal"
    :appearance="appearanceModalOrigin"
    @preview="previewAppearance"
    @cancel="closeAppearanceModal"
    @save="confirmAppearanceModal"
  />
  <GlobalSearchModal v-if="toolSearchStore.isOpen" />
</template>
