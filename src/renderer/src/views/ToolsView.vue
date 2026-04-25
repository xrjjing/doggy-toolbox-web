<script setup lang="ts">
import { NTag } from 'naive-ui'

import ToolWorkbenchView from '@renderer/features/tools/ToolWorkbenchView.vue'
</script>

<template>
  <section class="page-heading page-heading--workspace page-heading--tools">
    <div class="page-heading__main">
      <div class="page-heading__headline">
        <p class="eyebrow">工具工作区</p>
        <NTag size="small" :bordered="false">分类横排 + 抽屉切换</NTag>
      </div>
      <h2>开发工具</h2>
      <p>常用能力按项目维度整理，分类卡片负责切组，工具本体在工作区内切换，减少纵向滚动。</p>
    </div>
  </section>

  <ToolWorkbenchView />
</template>
