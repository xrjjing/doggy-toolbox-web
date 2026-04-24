<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NIcon, NSelect, NSlider, NSwitch, NTag } from 'naive-ui'
import {
  AlbumsOutline,
  ChatbubblesOutline,
  CloudUploadOutline,
  DownloadOutline,
  GlobeOutline,
  KeyOutline,
  LibraryOutline,
  GridOutline,
  HomeOutline,
  ListCircleOutline,
  MoonOutline,
  OptionsOutline,
  TerminalOutline,
  SunnyOutline
} from '@vicons/ionicons5'
import { cloneAppearance, useAppStore, type AppAppearance } from '@renderer/stores/app'
import { appThemeOptions } from '@renderer/stores/app'
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
  return [
    {
      label: 'Codex',
      value: info.codex.available
        ? '可用'
        : info.codex.configDetected
          ? '待安装 runtime'
          : '未配置',
      type: info.codex.available ? 'success' : info.codex.configDetected ? 'warning' : 'default'
    },
    {
      label: 'Claude',
      value: info.claude.available
        ? '可用'
        : info.claude.configDetected
          ? '待安装 runtime'
          : '未配置',
      type: info.claude.available ? 'success' : info.claude.configDetected ? 'warning' : 'default'
    }
  ]
})

function resolveTagType(type: string): 'success' | 'warning' | 'default' {
  if (type === 'success' || type === 'warning') {
    return type
  }
  return 'default'
}

const titlebarModeOptions = [
  { label: '固定标题栏', value: 'fixed' },
  { label: '简约融合', value: 'minimal' }
]

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
 * 顶部外观条继续保留“即时生效”的快捷入口。
 * 但旧项目还有更完整的设置弹窗，因此这里额外保存一份 origin，
 * 供弹窗关闭时恢复草稿前状态。
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
    <aside class="sidebar">
      <section class="brand-card">
        <div class="brand-mark">DT</div>
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
        <div class="topbar-actions">
          <NButton secondary round @click="toolSearchStore.open">全局搜索 ⌘K</NButton>
          <NIcon :component="SunnyOutline" />
          <NSwitch :value="appStore.isDark" @update:value="appStore.toggleTheme" />
          <NIcon :component="MoonOutline" />
          <NButton secondary round @click="openAppearanceModal">
            <template #icon>
              <NIcon :component="OptionsOutline" />
            </template>
            外观设置
          </NButton>
          <NButton secondary round @click="appStore.loadRuntimeInfo()">刷新本机配置</NButton>
        </div>
      </header>

      <section class="appearance-bar">
        <div class="appearance-current">
          <p class="eyebrow">appearance</p>
          <strong>{{ appStore.currentThemeLabel }}</strong>
          <span class="appearance-meta-line">
            {{ appStore.appearance.glassMode ? '毛玻璃已启用' : '实底模式' }} · 缩放
            {{ appStore.appearance.uiScale }}%
          </span>
        </div>
        <NSelect
          :value="appStore.appearance.theme"
          :options="appThemeOptions"
          size="small"
          class="appearance-theme-select"
          @update:value="(theme) => appStore.applyAppearance({ theme })"
        />
        <div class="appearance-inline">
          <span>毛玻璃</span>
          <NSwitch
            :value="appStore.appearance.glassMode"
            @update:value="(glassMode) => appStore.applyAppearance({ glassMode })"
          />
        </div>
        <div class="appearance-slider">
          <span>透明度 {{ appStore.appearance.glassOpacity }}%</span>
          <NSlider
            :value="appStore.appearance.glassOpacity"
            :min="45"
            :max="95"
            :step="5"
            @update:value="(glassOpacity) => appStore.applyAppearance({ glassOpacity })"
          />
        </div>
        <div class="appearance-slider">
          <span>缩放 {{ appStore.appearance.uiScale }}%</span>
          <NSlider
            :value="appStore.appearance.uiScale"
            :min="50"
            :max="100"
            :step="5"
            @update:value="(uiScale) => appStore.applyAppearance({ uiScale })"
          />
        </div>
        <NSelect
          :value="appStore.appearance.titlebarMode"
          :options="titlebarModeOptions"
          size="small"
          class="appearance-titlebar-select"
          @update:value="(titlebarMode) => appStore.applyAppearance({ titlebarMode })"
        />
      </section>

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
