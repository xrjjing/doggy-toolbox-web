<script setup lang="ts">
import { NTimeline, NTimelineItem } from 'naive-ui'

const phases: Array<{
  title: string
  type: 'success' | 'info' | 'default' | 'warning'
  text: string
}> = [
  { title: 'Phase 0: 新仓基线', type: 'success', text: '可启动、可打包、文档完整、首个提交推送。' },
  { title: 'Phase 1: 纯前端工具', type: 'info', text: '迁移低风险工具算法并补 Vitest。' },
  {
    title: 'Phase 2: 本地持久化',
    type: 'default',
    text: '替换 Python service，统一 Electron appData。'
  },
  {
    title: 'Phase 3: AI Bridge',
    type: 'warning',
    text: '完善 SDK 事件映射、会话历史、工具页 AI 辅助。'
  },
  { title: 'Phase 4: Release', type: 'default', text: 'GitHub Actions 多平台产物与版本发布。' }
]
</script>

<template>
  <section class="page-heading">
    <p class="eyebrow">todo ledger</p>
    <h2>迁移排期</h2>
    <p>根目录 `重构功能待办.md` 是执行台账；此页面只展示应用内的阶段概览。</p>
  </section>

  <section class="soft-card timeline-card">
    <NTimeline>
      <NTimelineItem
        v-for="phase in phases"
        :key="phase.title"
        :type="phase.type"
        :title="phase.title"
        :content="phase.text"
      />
    </NTimeline>
  </section>
</template>
