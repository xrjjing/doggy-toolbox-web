<script setup lang="ts">
import { NCard, NGrid, NGridItem, NTag } from 'naive-ui'
import ToolWorkbenchView from '@renderer/features/tools/ToolWorkbenchView.vue'

const groups = [
  {
    title: '编码与格式转换',
    status: '已迁入工作台',
    tools: ['Base64', 'URL', 'Unicode', 'JSON', 'CSV', 'Markdown', 'QRCode', 'Image Base64']
  },
  {
    title: '安全与加密',
    status: '已迁入工作台',
    tools: ['Hash', 'HMAC', 'JWT', 'AES/DES', 'RSA', '密码生成器', '脱敏']
  },
  {
    title: '网络与接口',
    status: '迁移进行中',
    tools: ['HTTP 集合', '环境变量', 'cURL', 'WebSocket', 'IP', 'Nginx', 'Diff']
  },
  {
    title: '本地数据',
    status: '资料模块已对齐',
    tools: ['命令管理', '凭证管理', '节点转换', 'Prompt 模板', '备份恢复', 'Mock']
  },
  {
    title: '命令生成器',
    status: '已接入高级面板',
    tools: ['Git', 'Docker', 'Docker Service', 'Docker Swarm', 'Stack', 'Nginx 模板']
  }
]
</script>

<template>
  <section class="page-heading">
    <p class="eyebrow">migration groups</p>
    <h2>旧功能迁移分组</h2>
    <p>
      当前工作台已开始承接旧项目的大部分前端化工具，剩余差距主要集中在体验补齐和极少数模块细节。
    </p>
  </section>

  <NGrid :cols="2" :x-gap="18" :y-gap="18" responsive="screen">
    <NGridItem v-for="group in groups" :key="group.title">
      <NCard class="soft-card tool-card" :bordered="false">
        <template #header>
          <div class="card-title-row">
            <span>{{ group.title }}</span>
            <NTag size="small" :bordered="false">{{ group.status }}</NTag>
          </div>
        </template>
        <div class="chip-list">
          <span v-for="tool in group.tools" :key="tool" class="chip">{{ tool }}</span>
        </div>
      </NCard>
    </NGridItem>
  </NGrid>

  <ToolWorkbenchView />
</template>
