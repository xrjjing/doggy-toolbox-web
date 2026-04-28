<script setup lang="ts">
import { computed } from 'vue'
import {
  NButton,
  NCard,
  NCheckboxGroup,
  NEmpty,
  NIcon,
  NInput,
  NPopconfirm,
  NTag,
  useMessage
} from 'naive-ui'
import {
  CloudDownloadOutline,
  CloudUploadOutline,
  ShieldCheckmarkOutline
} from '@vicons/ionicons5'
import type { BackupSectionKey } from '@shared/ipc-contract'
import { backupSectionOptions, useBackupStore } from '@renderer/stores/backup'

const message = useMessage()
const backupStore = useBackupStore()

const exportJson = computed(() =>
  backupStore.exportedDocument ? JSON.stringify(backupStore.exportedDocument, null, 2) : ''
)
const backupProgress = computed(() =>
  Math.min(100, Math.max(18, backupStore.selectedSections.length * 18))
)
const summaryCards = computed(() => {
  const summary = backupStore.exportedDocument?.summary ?? backupStore.importResult?.summary

  return [
    { label: '命令', value: summary?.commands ?? 0 },
    { label: '命令分组', value: summary?.commandTabs ?? 0 },
    { label: '凭证', value: summary?.credentials ?? 0 },
    { label: 'Prompt 分类', value: summary?.promptCategories ?? 0 },
    { label: 'Prompt 模板', value: summary?.promptTemplates ?? 0 },
    { label: 'HTTP 集合', value: summary?.httpCollections ?? 0 },
    { label: 'HTTP 请求', value: summary?.httpRequests ?? 0 },
    { label: 'HTTP 环境', value: summary?.httpEnvironments ?? 0 },
    { label: 'HTTP 历史', value: summary?.httpHistoryRecords ?? 0 },
    { label: 'AI 设置', value: summary?.aiSettings ?? 0 }
  ]
})

function updateSections(value: Array<string | number>): void {
  const allowed = new Set<BackupSectionKey>(backupSectionOptions.map((option) => option.value))
  backupStore.setSections(
    value.filter((item): item is BackupSectionKey => allowed.has(item as BackupSectionKey))
  )
}

function downloadBackup(): void {
  if (!exportJson.value) {
    message.warning('请先生成备份')
    return
  }

  const blob = new Blob([exportJson.value], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '')
  link.href = url
  link.download = `doggy-toolbox-web-backup-${timestamp}.json`
  link.click()
  URL.revokeObjectURL(url)
}

async function copyBackup(): Promise<void> {
  if (!exportJson.value) {
    message.warning('请先生成备份')
    return
  }

  try {
    await navigator.clipboard.writeText(exportJson.value)
    message.success('备份 JSON 已复制')
  } catch {
    message.error('当前环境无法直接写入剪贴板')
  }
}

async function exportBackup(): Promise<void> {
  try {
    await backupStore.exportBackup()
    message.success('备份已生成')
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

async function importBackup(): Promise<void> {
  if (!backupStore.importText.trim()) {
    message.warning('请先粘贴备份 JSON')
    return
  }

  try {
    await backupStore.importBackup()
    message.success('备份已恢复，建议刷新对应页面确认数据')
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}
</script>

<template>
  <section class="data-center-progress-island backup-progress-hero">
    <div class="data-center-orb">
      <NIcon :component="CloudUploadOutline" />
    </div>
    <div class="data-center-progress-copy">
      <p class="eyebrow">本地备份协议</p>
      <strong>备份与覆盖恢复</strong>
      <p>按模块生成可复制、可下载的 JSON。恢复前必须经过确认，不绕过原有覆盖语义。</p>
    </div>
    <div class="data-center-progress-track">
      <span :style="{ width: `${backupProgress}%` }" />
    </div>
    <div class="data-center-progress-meta">
      <span>当前模块 {{ backupStore.selectedSections.length }}</span>
      <span>协议 v1.0</span>
    </div>
  </section>

  <section class="backup-summary-grid">
    <article v-for="card in summaryCards" :key="card.label" class="progress-card">
      <div class="progress-head">
        <strong>{{ card.label }}</strong>
        <span>{{ card.value }}</span>
      </div>
      <p>来自最近一次导出或导入结果。</p>
    </article>
  </section>

  <div class="backup-shell backup-zen-shell">
    <NCard class="soft-card backup-options-card backup-flow-card" :bordered="false">
      <template #header>
        <div class="card-title-row">
          <strong>
            <NIcon :component="ShieldCheckmarkOutline" />
            备份范围
          </strong>
          <NTag size="small" :bordered="false">v1.0</NTag>
        </div>
      </template>

      <NCheckboxGroup
        :value="backupStore.selectedSections"
        :options="backupSectionOptions"
        @update:value="updateSections"
      />

      <p class="muted">
        导入时会覆盖所选模块的本地数据。凭证恢复后会重新按当前机器的编码方式写入；HTTP
        集合会按备份里的数组整体覆盖本地资料库；AI
        设置会把默认工作目录、系统提示和模块开关一并恢复。
      </p>
    </NCard>

    <NCard class="soft-card backup-flow-card" :bordered="false">
      <template #header>
        <div class="card-title-row">
          <strong>
            <NIcon :component="CloudUploadOutline" />
            导出备份
          </strong>
          <NTag size="small" :bordered="false">本地生成</NTag>
        </div>
      </template>
      <div class="backup-flow-stack">
        <div class="action-row">
          <NButton type="primary" :loading="backupStore.loading" @click="exportBackup">
            <template #icon>
              <NIcon :component="CloudUploadOutline" />
            </template>
            生成备份 JSON
          </NButton>
          <NButton secondary :disabled="!backupStore.hasExport" @click="copyBackup">
            复制 JSON
          </NButton>
          <NButton secondary :disabled="!backupStore.hasExport" @click="downloadBackup">
            <template #icon>
              <NIcon :component="CloudDownloadOutline" />
            </template>
            下载 JSON
          </NButton>
        </div>

        <NInput
          v-if="backupStore.hasExport"
          :value="exportJson"
          type="textarea"
          readonly
          :autosize="{ minRows: 12, maxRows: 18 }"
        />
        <div v-else class="data-center-empty-state">
          <NEmpty description="还没有生成备份" />
        </div>
      </div>
    </NCard>

    <NCard class="soft-card backup-flow-card backup-risk-panel" :bordered="false">
      <template #header>
        <div class="card-title-row">
          <strong>
            <NIcon :component="CloudDownloadOutline" />
            恢复备份
          </strong>
          <NTag size="small" :bordered="false" type="warning">覆盖写入</NTag>
        </div>
      </template>
      <div class="backup-flow-stack">
        <NInput
          :value="backupStore.importText"
          type="textarea"
          placeholder="粘贴 doggy-toolbox-web 备份 JSON"
          :autosize="{ minRows: 12, maxRows: 18 }"
          @update:value="backupStore.setImportText"
        />

        <div class="action-row">
          <NPopconfirm
            negative-text="取消"
            positive-text="确认执行"
            @positive-click="importBackup"
          >
            <template #trigger>
              <NButton type="error" secondary :loading="backupStore.loading">
                覆盖恢复所选模块
              </NButton>
            </template>
            恢复会覆盖所选模块当前数据。此操作不可自动撤销，确认继续？
          </NPopconfirm>
        </div>
      </div>
    </NCard>
  </div>
</template>
