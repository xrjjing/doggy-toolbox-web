<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NIcon, NSwitch, NTag } from 'naive-ui'
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
  TerminalOutline,
  SunnyOutline
} from '@vicons/ionicons5'
import { useAppStore } from '@renderer/stores/app'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()

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

onMounted(() => {
  void appStore.loadRuntimeInfo()
})
</script>

<template>
  <div class="app-frame" :class="{ 'is-dark': appStore.isDark }">
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
        <div>
          <p class="eyebrow">runtime</p>
          <strong>{{ runtimeText }}</strong>
        </div>
        <div class="topbar-actions">
          <NIcon :component="SunnyOutline" />
          <NSwitch :value="appStore.isDark" @update:value="appStore.toggleTheme" />
          <NIcon :component="MoonOutline" />
          <NButton secondary round @click="appStore.loadRuntimeInfo()">刷新本机配置</NButton>
        </div>
      </header>

      <RouterView />
    </main>
  </div>
</template>
