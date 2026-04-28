<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useAttrs,
  watch
} from 'vue'
import { useMessage } from 'naive-ui'
import { useRoute } from 'vue-router'
import { NIcon, NSwitch } from 'naive-ui'
import {
  ChatbubblesOutline,
  ChevronBackOutline,
  ContrastOutline,
  GlobeOutline,
  KeyOutline,
  LibraryOutline,
  GridOutline,
  MenuOutline,
  MoonOutline,
  OptionsOutline,
  RefreshOutline,
  SearchOutline,
  TerminalOutline,
  SunnyOutline
} from '@vicons/ionicons5'
import {
  cloneAppearance,
  useAppStore,
  type AppAppearance
} from '@renderer/stores/app'
import { useToolSearchStore } from '@renderer/stores/tool-search'

const GlobalSearchModal = defineAsyncComponent(
  () => import('@renderer/components/GlobalSearchModal.vue')
)
import AppearanceSettingsModal from '@renderer/components/AppearanceSettingsModal.vue'
import BrandMascot from '@renderer/components/BrandMascot.vue'
import { ZenButton } from '@renderer/components/zen'

const route = useRoute()
const appStore = useAppStore()
const toolSearchStore = useToolSearchStore()
const attrs = useAttrs()
const message = useMessage()
const showAppearanceModal = ref(false)
const appearanceModalOrigin = ref<AppAppearance>(cloneAppearance(appStore.appearance))
const appearanceSavedAt = ref<string | null>(null)
const isSidebarCollapsed = ref(false)
const mainPanelRef = ref<HTMLElement | null>(null)
const mainViewShellRef = ref<HTMLElement | null>(null)

const primaryNavItems = [
  { path: '/tools', label: '开发工具', icon: GridOutline },
  { path: '/commands', label: '命令管理', icon: TerminalOutline },
  { path: '/credentials', label: '凭证管理', icon: KeyOutline },
  { path: '/http', label: 'HTTP 集合', icon: GlobeOutline },
  { path: '/ai', label: 'AI Chat', icon: ChatbubblesOutline },
  { path: '/prompts', label: 'Prompt 模板', icon: LibraryOutline }
]

const maintenanceNavItems = [{ path: '/data-center', label: '数据迁移中心', icon: ContrastOutline }]

const runtimeText = computed(() => {
  const info = appStore.runtimeInfo
  if (!info) return '检测中'
  return `${info.platform} · ${info.appVersion}`
})

const currentNavLabel = computed(
  () =>
    [...primaryNavItems, ...maintenanceNavItems].find((item) => route.path.startsWith(item.path))
      ?.label ?? '当前页'
)
const currentNavItem = computed(
  () =>
    [...primaryNavItems, ...maintenanceNavItems].find((item) => route.path.startsWith(item.path)) ??
    null
)

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

watch(
  () => route.fullPath,
  async () => {
    await nextTick()
    mainPanelRef.value?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    mainViewShellRef.value?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }
)

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
</script>

<template>
  <div
    class="app-frame"
    v-bind="attrs"
    :class="{ 'is-dark': appStore.isDark, 'sidebar-is-collapsed': isSidebarCollapsed }"
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
          <div v-show="!isSidebarCollapsed" class="brand-copy">
            <p class="eyebrow">Doggy Toolbox</p>
            <h1>百宝箱 Web</h1>
            <span class="brand-version">{{ runtimeText }}</span>
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

      <nav class="nav-list nav-list--primary">
        <p v-show="!isSidebarCollapsed" class="nav-section-label">Suite</p>
        <RouterLink
          v-for="item in primaryNavItems"
          :key="item.path"
          class="nav-item"
          :class="{ active: route.path.startsWith(item.path) }"
          :aria-current="route.path.startsWith(item.path) ? 'page' : undefined"
          :title="item.label"
          :to="item.path"
        >
          <NIcon :component="item.icon" />
          <span v-show="!isSidebarCollapsed">{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="sidebar-footer-stack">
        <nav class="nav-list nav-list--secondary">
          <p v-show="!isSidebarCollapsed" class="nav-section-label">System</p>
          <RouterLink
            v-for="item in maintenanceNavItems"
            :key="item.path"
            class="nav-item nav-item--secondary"
            :class="{ active: route.path.startsWith(item.path) }"
            :aria-current="route.path.startsWith(item.path) ? 'page' : undefined"
            :title="item.label"
            :to="item.path"
          >
            <NIcon :component="item.icon" />
            <span v-show="!isSidebarCollapsed">{{ item.label }}</span>
          </RouterLink>
        </nav>
      </div>
    </aside>

    <main ref="mainPanelRef" class="main-panel">
      <header class="topbar zen-workspace-bar">
        <div class="workspace-copy">
          <p class="eyebrow">工作区</p>
          <div class="workspace-title-row">
            <span v-if="currentNavItem" class="workspace-title-icon" aria-hidden="true">
              <NIcon :component="currentNavItem.icon" />
            </span>
            <h2>{{ currentNavLabel }}</h2>
            <span class="workspace-runtime">{{ runtimeText }}</span>
          </div>
        </div>

        <div class="workspace-actions">
          <div class="topbar-theme-switch">
            <NIcon :component="SunnyOutline" />
            <NSwitch :value="appStore.isDark" @update:value="appStore.toggleTheme" />
            <NIcon :component="MoonOutline" />
          </div>
          <ZenButton class="window-action" variant="secondary" @click="toolSearchStore.open">
            <template #icon>
              <NIcon :component="SearchOutline" />
            </template>
            <span>全局搜索</span>
            <span class="window-action-kbd">⌘K</span>
          </ZenButton>
          <ZenButton class="window-action" variant="secondary" @click="openAppearanceModal">
            <template #icon>
              <NIcon :component="OptionsOutline" />
            </template>
            外观设置
          </ZenButton>
          <ZenButton class="window-action" variant="secondary" @click="appStore.loadRuntimeInfo()">
            <template #icon>
              <NIcon :component="RefreshOutline" />
            </template>
            刷新本机配置
          </ZenButton>
        </div>
      </header>

      <div ref="mainViewShellRef" class="main-view-shell">
        <RouterView v-slot="{ Component, route: currentRoute }">
          <Transition name="zen-page" mode="out-in">
            <div
              :key="currentRoute.fullPath"
              class="route-view-stage"
              :class="{ 'route-view-stage--ai': currentRoute.path.startsWith('/ai') }"
            >
              <component :is="Component" />
            </div>
          </Transition>
        </RouterView>
      </div>
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
