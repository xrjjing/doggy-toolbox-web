<script setup lang="ts">
import { NCard, NGrid, NGridItem, NTag } from 'naive-ui'

const groups = [
  {
    title: '编码与格式转换',
    status: '下一阶段',
    tools: ['Base64', 'URL', 'Unicode', 'JSON', 'YAML/XML', 'CSV', 'Markdown']
  },
  {
    title: '安全与加密',
    status: '排期中',
    tools: ['Hash', 'HMAC', 'JWT', 'AES/DES', 'RSA', '密码生成器', '脱敏']
  },
  {
    title: '网络与接口',
    status: '复杂模块',
    tools: ['HTTP 集合', '环境变量', 'cURL', 'WebSocket', 'IP', 'nginx', '二维码']
  },
  {
    title: '本地数据',
    status: '需持久化',
    tools: ['命令管理', '凭证管理', '节点转换', 'Prompt 模板', '备份恢复']
  }
]
</script>

<template>
  <section class="page-heading">
    <p class="eyebrow">migration groups</p>
    <h2>旧功能迁移分组</h2>
    <p>先迁移纯前端工具，再进入本地持久化与网络模块，避免一开始把复杂度堆到一起。</p>
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
</template>
