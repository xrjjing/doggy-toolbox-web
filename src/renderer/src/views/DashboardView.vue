<script setup lang="ts">
import { computed } from 'vue'
import { NCard, NGrid, NGridItem, NProgress, NTag } from 'naive-ui'
import { useAppStore } from '@renderer/stores/app'

const appStore = useAppStore()

const runtimeCards = computed(
  () =>
    [
      {
        title: 'Codex 本机链路',
        status: appStore.runtimeInfo?.codex.available ? '可检测' : '未检测',
        detail: appStore.runtimeInfo?.codex.details ?? '等待检测',
        type: appStore.runtimeInfo?.codex.available ? 'success' : 'warning'
      },
      {
        title: 'Claude Code 本机链路',
        status: appStore.runtimeInfo?.claude.available ? '可检测' : '未检测',
        detail: appStore.runtimeInfo?.claude.details ?? '等待检测',
        type: appStore.runtimeInfo?.claude.available ? 'success' : 'warning'
      },
      {
        title: '数据目录',
        status: 'Electron appData',
        detail: appStore.runtimeInfo?.dataDir ?? '等待检测',
        type: 'info'
      }
    ] as const
)

const migrationGroups = [
  { name: '项目基线', done: 70, text: 'Electron Vite、Vue、Naive UI、IPC、Actions' },
  { name: '纯前端工具', done: 10, text: '优先迁移 Base64、URL、UUID、JSON、Hash' },
  {
    name: '本地数据模块',
    done: 86,
    text: '命令、凭证、Prompt、统一备份和旧数据导入已接入 appData JSON repository'
  },
  { name: 'AI Bridge', done: 25, text: 'SDK 依赖、配置检测、统一流式事件协议' }
]
</script>

<template>
  <section class="hero-card">
    <div>
      <p class="eyebrow">rewrite baseline</p>
      <h2>从 PyWebView 迁移到 Electron + Vue + TypeScript</h2>
      <p class="hero-copy">
        这个新仓先承接桌面壳、现代前端工程、GitHub 打包和本机 AI SDK bridge。
        后续功能按模块迁移，每个模块完成后单独测试和提交。
      </p>
    </div>
    <div class="hero-orbit">
      <span>Vue</span>
      <span>TS</span>
      <span>SDK</span>
    </div>
  </section>

  <NGrid :cols="3" :x-gap="16" :y-gap="16" responsive="screen" class="runtime-grid">
    <NGridItem v-for="card in runtimeCards" :key="card.title">
      <NCard class="soft-card" :bordered="false">
        <template #header>{{ card.title }}</template>
        <NTag :type="card.type" :bordered="false">{{ card.status }}</NTag>
        <p class="muted">{{ card.detail }}</p>
      </NCard>
    </NGridItem>
  </NGrid>

  <section class="section-grid">
    <article v-for="group in migrationGroups" :key="group.name" class="progress-card">
      <div class="progress-head">
        <strong>{{ group.name }}</strong>
        <span>{{ group.done }}%</span>
      </div>
      <NProgress type="line" :percentage="group.done" :show-indicator="false" />
      <p>{{ group.text }}</p>
    </article>
  </section>
</template>
