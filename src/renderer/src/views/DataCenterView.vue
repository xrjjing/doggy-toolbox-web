<script setup lang="ts">
import { computed } from 'vue'
import {
  NButton,
  NCard,
  NTabs,
  NTabPane,
  NCheckboxGroup,
  NEmpty,
  NInput,
  NPopconfirm,
  NTag,
  useMessage
} from 'naive-ui'
import type { BackupSectionKey } from '@shared/ipc-contract'
import { backupSectionOptions, useBackupStore } from '@renderer/stores/backup'
import { useLegacyImportStore } from '@renderer/stores/legacy-import'

const message = useMessage()
const backupStore = useBackupStore()
const legacyImportStore = useLegacyImportStore()
const sectionLabelMap = new Map(backupSectionOptions.map((option) => [option.value, option.label]))

const exportJson = computed(() =>
  backupStore.exportedDocument ? JSON.stringify(backupStore.exportedDocument, null, 2) : ''
)

const migrationCards = computed(() => {
  const backupSummary = backupStore.exportedDocument?.summary ?? backupStore.importResult?.summary
  const legacySummary = legacyImportStore.importResult?.summary ?? legacyImportStore.analysis?.summary
  return [
    {
      label: '旧项目命令',
      value: legacySummary?.commands ?? 0,
      hint: '来自最近一次旧数据识别或导入'
    },
    {
      label: '本地备份模块',
      value: backupStore.selectedSections.length,
      hint: '当前勾选的备份 / 恢复范围'
    },
    {
      label: 'HTTP 集合',
      value: backupSummary?.httpCollections ?? 0,
      hint: '来自最近一次导出或恢复摘要'
    },
    {
      label: 'AI 设置',
      value: backupSummary?.aiSettings ?? 0,
      hint: '会随本地备份协议一起导出'
    }
  ]
})

const summaryCards = computed(() => {
  const summary = backupStore.exportedDocument?.summary ?? backupStore.importResult?.summary
  return [
    { label: '命令', value: summary?.commands ?? 0 },
    { label: '凭证', value: summary?.credentials ?? 0 },
    { label: 'Prompt', value: summary?.promptTemplates ?? 0 },
    { label: 'HTTP 请求', value: summary?.httpRequests ?? 0 }
  ]
})

const legacySummaryCards = computed(() => {
  const summary = legacyImportStore.importResult?.summary ?? legacyImportStore.analysis?.summary
  return [
    { label: '命令', value: summary?.commands ?? 0 },
    { label: '凭证', value: summary?.credentials ?? 0 },
    { label: '分类', value: summary?.promptCategories ?? 0 },
    { label: '模板', value: summary?.promptTemplates ?? 0 }
  ]
})

const sectionOptions = computed(() =>
  backupSectionOptions.filter((option) =>
    legacyImportStore.availableSections.includes(option.value)
  )
)

function formatSections(sections: BackupSectionKey[]): string {
  return sections.map((section) => sectionLabelMap.get(section) ?? section).join('、')
}

function formatImportedAt(value: string): string {
  if (!value) return '等待导入'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function updateBackupSections(value: Array<string | number>): void {
  const allowed = new Set<BackupSectionKey>(backupSectionOptions.map((option) => option.value))
  backupStore.setSections(
    value.filter((item): item is BackupSectionKey => allowed.has(item as BackupSectionKey))
  )
}

function updateLegacySections(value: Array<string | number>): void {
  const allowed = new Set<BackupSectionKey>(sectionOptions.value.map((option) => option.value))
  legacyImportStore.setSections(
    value.filter((item): item is BackupSectionKey => allowed.has(item as BackupSectionKey))
  )
}

async function analyzeSource(): Promise<void> {
  if (!legacyImportStore.sourceJson.trim()) {
    message.warning('请先粘贴旧项目 JSON')
    return
  }

  try {
    const result = await legacyImportStore.analyze()
    message.success(`已识别：${result.sourceLabel}`)
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

async function importSource(): Promise<void> {
  if (!legacyImportStore.hasAnalysis) {
    message.warning('请先识别旧数据类型')
    return
  }
  if (legacyImportStore.selectedSections.length === 0) {
    message.warning('请至少选择一个导入模块')
    return
  }

  try {
    const result = await legacyImportStore.importData()
    message.success(`旧数据已导入：${formatSections(result.sections)}`)
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
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
  <section class="data-center-summary-grid">
    <article v-for="card in migrationCards" :key="card.label" class="progress-card">
      <div class="progress-head">
        <strong>{{ card.label }}</strong>
        <span>{{ card.value }}</span>
      </div>
      <p>{{ card.hint }}</p>
    </article>
  </section>

  <div class="data-center-shell">
    <section class="data-center-main">
      <section class="data-center-progress-island">
        <div class="data-center-progress-copy">
          <p class="eyebrow">migration protocol</p>
          <strong>本地迁移 / 备份恢复中心</strong>
          <p>先识别旧项目数据，再决定导入模块。底部统一处理新仓备份导出与恢复。</p>
        </div>
        <div class="data-center-progress-track">
          <span :style="{ width: `${Math.min(100, Math.max(18, backupStore.selectedSections.length * 18))}%` }" />
        </div>
        <div class="data-center-progress-meta">
          <span>当前备份模块 {{ backupStore.selectedSections.length }}</span>
          <span>旧数据模块 {{ legacyImportStore.selectedSections.length }}</span>
        </div>
      </section>

      <NCard class="soft-card data-center-panel" :bordered="false">
        <template #header>
          <div class="card-title-row">
            <div>
              <p class="eyebrow">legacy migration</p>
              <strong>旧项目导入</strong>
            </div>
            <NTag size="small" :bordered="false">Step 1</NTag>
          </div>
        </template>

        <section class="mini-stats-grid">
          <article v-for="card in legacySummaryCards" :key="card.label" class="mini-stat-card">
            <span>{{ card.label }}</span>
            <strong>{{ card.value }}</strong>
          </article>
        </section>

        <div class="data-center-panel-grid">
          <div class="data-center-editor">
            <label class="appearance-modal-label">旧项目 JSON</label>
            <NInput
              :value="legacyImportStore.sourceJson"
              type="textarea"
              placeholder="粘贴旧项目总备份 JSON，或旧项目 Prompt 模板导出 JSON"
              :autosize="{ minRows: 14, maxRows: 22 }"
              @update:value="legacyImportStore.setSourceJson"
            />
            <div class="action-row">
              <NButton type="primary" :loading="legacyImportStore.loading" @click="analyzeSource">
                识别旧数据类型
              </NButton>
            </div>
          </div>

          <div class="data-center-side-stack">
            <section class="data-center-insight-card">
              <div class="card-title-row">
                <strong>识别结果</strong>
                <NTag
                  v-if="legacyImportStore.analysis"
                  size="small"
                  :bordered="false"
                >
                  {{ legacyImportStore.analysis.sourceKind }}
                </NTag>
              </div>
              <div v-if="legacyImportStore.analysis" class="legacy-analysis">
                <div>
                  <strong>{{ legacyImportStore.analysis.sourceLabel }}</strong>
                  <p class="muted">
                    可导入模块：{{ formatSections(legacyImportStore.analysis.availableSections) }}
                  </p>
                </div>
                <div class="chip-list">
                  <span
                    v-for="warning in legacyImportStore.analysis.warnings"
                    :key="warning"
                    class="chip"
                  >
                    {{ warning }}
                  </span>
                </div>
              </div>
              <NEmpty v-else description="先识别一次旧 JSON，再决定导入哪些模块" />
            </section>

            <section v-if="legacyImportStore.analysis" class="data-center-insight-card">
              <div class="card-title-row">
                <strong>导入模块</strong>
                <NTag size="small" :bordered="false">可选</NTag>
              </div>
              <NCheckboxGroup
                :value="legacyImportStore.selectedSections"
                :options="sectionOptions"
                @update:value="updateLegacySections"
              />
              <p class="muted">
                旧项目总备份会覆盖命令或凭证模块；旧 Prompt 导出会按分类名称和模板标题做合并导入。
              </p>
              <div class="action-row data-center-inline-end">
                <NTag size="small" :bordered="false" type="info">
                  当前选择：{{ formatSections(legacyImportStore.selectedSections) || '未选择' }}
                </NTag>
                <NPopconfirm @positive-click="importSource">
                  <template #trigger>
                    <NButton
                      type="error"
                      secondary
                      :loading="legacyImportStore.loading"
                      :disabled="!legacyImportStore.canImport"
                    >
                      导入识别出的模块
                    </NButton>
                  </template>
                  导入会覆盖或合并新仓对应模块数据。请确认 JSON 来源可靠且当前数据已备份。
                </NPopconfirm>
              </div>
            </section>

            <section v-if="legacyImportStore.importResult" class="data-center-insight-card">
              <div class="card-title-row">
                <strong>最近一次导入</strong>
                <NTag size="small" :bordered="false">{{
                  legacyImportStore.importResult.sourceKind
                }}</NTag>
              </div>
              <p class="muted">
                导入模块：{{ formatSections(legacyImportStore.importResult.sections) }}
              </p>
              <p class="muted">
                导入时间：{{ formatImportedAt(legacyImportStore.importResult.importedAt) }}
              </p>
              <div class="chip-list">
                <span
                  v-for="warning in legacyImportStore.importResult.warnings"
                  :key="warning"
                  class="chip"
                >
                  {{ warning }}
                </span>
              </div>
            </section>
          </div>
        </div>
      </NCard>

      <NCard class="soft-card data-center-panel" :bordered="false">
        <template #header>
          <div class="card-title-row">
            <div>
              <p class="eyebrow">migration operations</p>
              <strong>导入 / 备份 / 恢复</strong>
            </div>
            <NTag size="small" :bordered="false">Bottom Rail</NTag>
          </div>
        </template>

        <section class="mini-stats-grid">
          <article v-for="card in summaryCards" :key="card.label" class="mini-stat-card">
            <span>{{ card.label }}</span>
            <strong>{{ card.value }}</strong>
          </article>
        </section>

        <NTabs type="segment" animated class="data-center-bottom-tabs">
          <NTabPane name="export" tab="备份导出">
            <div class="data-center-panel-grid">
              <div class="data-center-editor">
                <label class="appearance-modal-label">备份 JSON</label>
                <NInput
                  v-if="backupStore.hasExport"
                  :value="exportJson"
                  type="textarea"
                  readonly
                  :autosize="{ minRows: 14, maxRows: 22 }"
                />
                <div v-else class="data-center-empty-state">
                  <NEmpty description="还没有生成备份" />
                </div>
              </div>

              <div class="data-center-side-stack">
                <section class="data-center-insight-card">
                  <div class="card-title-row">
                    <strong>备份范围</strong>
                    <NTag size="small" :bordered="false">v1.0</NTag>
                  </div>
                  <NCheckboxGroup
                    :value="backupStore.selectedSections"
                    :options="backupSectionOptions"
                    @update:value="updateBackupSections"
                  />
                  <p class="muted">
                    当前协议覆盖命令、凭证、Prompt、HTTP 集合和 AI 设置。后续新模块接入时，会继续沿用这套模块级备份接口。
                  </p>
                </section>

                <section class="data-center-insight-card">
                  <div class="card-title-row">
                    <strong>导出动作</strong>
                    <NTag size="small" :bordered="false">safe first</NTag>
                  </div>
                  <div class="data-center-action-stack">
                    <NButton type="primary" :loading="backupStore.loading" @click="exportBackup">
                      生成备份 JSON
                    </NButton>
                    <NButton secondary :disabled="!backupStore.hasExport" @click="copyBackup">
                      复制 JSON
                    </NButton>
                    <NButton secondary :disabled="!backupStore.hasExport" @click="downloadBackup">
                      下载 JSON
                    </NButton>
                  </div>
                </section>
              </div>
            </div>
          </NTabPane>

          <NTabPane name="restore" tab="备份恢复">
            <div class="data-center-panel-grid">
              <div class="data-center-editor">
                <label class="appearance-modal-label">恢复 JSON</label>
                <NInput
                  :value="backupStore.importText"
                  type="textarea"
                  placeholder="粘贴 doggy-toolbox-web 备份 JSON"
                  :autosize="{ minRows: 14, maxRows: 22 }"
                  @update:value="backupStore.setImportText"
                />
              </div>

              <div class="data-center-side-stack">
                <section class="data-center-insight-card">
                  <div class="card-title-row">
                    <strong>恢复说明</strong>
                    <NTag size="small" :bordered="false" type="warning">覆盖写入</NTag>
                  </div>
                  <p class="muted">
                    导入时会覆盖所选模块的本地数据。凭证恢复后会重新按当前机器的编码方式写入；HTTP 集合会按备份里的数组整体覆盖本地资料库；AI 设置会把默认工作目录、系统提示和模块开关一并恢复。
                  </p>
                </section>

                <section class="data-center-insight-card">
                  <div class="card-title-row">
                    <strong>恢复动作</strong>
                    <NTag size="small" :bordered="false">高风险</NTag>
                  </div>
                  <div class="data-center-action-stack">
                    <NPopconfirm @positive-click="importBackup">
                      <template #trigger>
                        <NButton type="error" secondary :loading="backupStore.loading">
                          覆盖恢复所选模块
                        </NButton>
                      </template>
                      恢复会覆盖所选模块当前数据。此操作不可自动撤销，确认继续？
                    </NPopconfirm>
                  </div>
                </section>
              </div>
            </div>
          </NTabPane>
        </NTabs>
      </NCard>
    </section>
  </div>
</template>
