<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NIcon, NSwitch, NTag } from 'naive-ui'
import {
  AlbumsOutline,
  ChatbubblesOutline,
  CloudUploadOutline,
  ContrastOutline,
  DownloadOutline,
  GlobeOutline,
  KeyOutline,
  LibraryOutline,
  GridOutline,
  HomeOutline,
  ListCircleOutline,
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
  useAppStore,
  type AppAppearance
} from '@renderer/stores/app'
import { useToolSearchStore } from '@renderer/stores/tool-search'

const AppearanceSettingsModal = defineAsyncComponent(
  () => import('@renderer/components/AppearanceSettingsModal.vue')
)
const GlobalSearchModal = defineAsyncComponent(
  () => import('@renderer/components/GlobalSearchModal.vue')
)

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const toolSearchStore = useToolSearchStore()
const showAppearanceModal = ref(false)
const appearanceModalOrigin = ref<AppAppearance>(cloneAppearance(appStore.appearance))

const navItems = [
  { path: '/', label: '总览', icon: HomeOutline },
  { path: '/tools', label: '工具迁移', icon: GridOutline },
  { path: '/commands', label: '命令管理', icon: TerminalOutline },
  { path: '/credentials', label: '凭证管理', icon: KeyOutline },
  { path: '/prompts', label: 'Prompt 模板', icon: LibraryOutline },
  { path: '/nodes', label: '节点列表', icon: AlbumsOutline },
  { path: '/http', label: 'HTTP 集合', icon: GlobeOutline },
  { path: '/backup', label: '备份恢复', icon: CloudUploadOutline },
  { path: '/legacy-import', label: '旧数据导入', icon: DownloadOutline },
  { path: '/ai', label: 'AI Bridge', icon: ChatbubblesOutline },
  { path: '/plan', label: '排期', icon: ListCircleOutline }
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
    `缩放 ${appearance.uiScale}%`,
    getTitlebarModeLabel(appearance.titlebarMode)
  ].join(' · ')
})

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
}
</script>

<template>
  <div
    class="app-frame"
    :class="{ 'is-dark': appStore.isDark }"
    :data-theme="appStore.appearance.theme"
    :data-glass="appStore.appearance.glassMode ? 'true' : 'false'"
    :data-titlebar-mode="appStore.appearance.titlebarMode"
  >
    <div class="window-drag-strip" />
    <div class="window-float-controls">
      <div class="window-float-pill">
        <span class="window-float-dot close" />
        <span class="window-float-dot minimize" />
        <span class="window-float-dot maximize" />
      </div>
    </div>

    <aside class="sidebar">
      <section class="brand-card">
        <div class="brand-mark" aria-hidden="true">
          <span class="dog-mark-ears">
            <i />
            <i />
          </span>
          <span class="dog-mark-face">
            <i class="dog-mark-eye left" />
            <i class="dog-mark-eye right" />
            <i class="dog-mark-nose" />
            <i class="dog-mark-mouth" />
          </span>
        </div>
        <div>
          <p class="eyebrow">Doggy Toolbox</p>
          <h1>百宝箱 Web</h1>
        </div>
      </section>

      <nav class="nav-list">
        <button
          v-for="item in navItems"
          :key="item.path"
          class="nav-item"
          :class="{ active: route.path === item.path }"
          type="button"
          @click="router.push(item.path)"
        >
          <NIcon :component="item.icon" />
          <span>{{ item.label }}</span>
        </button>
      </nav>

      <section class="side-note">
        <NTag size="small" :bordered="false" type="warning">Electron 基线</NTag>
        <p>当前阶段先保证可运行、可打包、可持续迁移。</p>
      </section>
    </aside>

    <main class="main-panel">
      <header class="topbar">
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
      </header>

      <RouterView />
    </main>
  </div>

  <AppearanceSettingsModal
    v-if="showAppearanceModal"
    v-model:show="showAppearanceModal"
    :appearance="appStore.appearance"
    @preview="previewAppearance"
    @cancel="cancelAppearanceModal"
    @save="saveAppearanceModal"
  />
  <GlobalSearchModal v-if="toolSearchStore.isOpen" />
</template>
