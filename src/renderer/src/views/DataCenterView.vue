<script setup lang="ts">
import { computed } from 'vue'
import {
  NButton,
  NCard,
  NTabs,
  NTabPane,
  NCheckboxGroup,
  NEmpty,
  NIcon,
  NInput,
  NPopconfirm,
  NTag,
  useMessage
} from 'naive-ui'
import {
  CloudDoneOutline,
  CloudDownloadOutline,
  CloudUploadOutline,
  DocumentTextOutline,
  ShieldCheckmarkOutline,
  ServerOutline,
  SwapHorizontalOutline
} from '@vicons/ionicons5'
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
const backupProgress = computed(() =>
  Math.min(100, Math.max(18, backupStore.selectedSections.length * 18))
)

const migrationCards = computed(() => {
  const backupSummary = backupStore.exportedDocument?.summary ?? backupStore.importResult?.summary
  const legacySummary =
    legacyImportStore.importResult?.summary ?? legacyImportStore.sqliteAnalysis?.summary
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
  const summary = legacyImportStore.importResult?.summary ?? legacyImportStore.sqliteAnalysis?.summary
  return [
    { label: '命令', value: summary?.commands ?? 0 },
    { label: '凭证', value: summary?.credentials ?? 0 },
    { label: 'Prompt', value: summary?.promptTemplates ?? 0 },
    { label: 'HTTP 集合', value: summary?.httpCollections ?? 0 }
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

async function analyzeSqliteSource(): Promise<void> {
  if (!legacyImportStore.sqliteDbPath.trim()) {
    message.warning('请先填写旧项目 SQLite DB 路径')
    return
  }

  try {
    const result = await legacyImportStore.analyzeSqlite()
    message.success(`已识别：${result.sourceLabel}`)
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

async function importSqliteSource(): Promise<void> {
  if (!legacyImportStore.sqliteAnalysis) {
    message.warning('请先分析旧 SQLite DB')
    return
  }
  if (legacyImportStore.selectedSections.length === 0) {
    message.warning('请至少选择一个导入模块')
    return
  }

  try {
    const result = await legacyImportStore.importSqlite()
    message.success(`SQLite 数据已导入：${formatSections(result.sections)}`)
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
        <div class="data-center-orb">
          <NIcon :component="CloudDoneOutline" />
        </div>
        <div class="data-center-progress-copy">
          <p class="eyebrow">本地数据协议</p>
          <strong>备份与 SQLite 导入</strong>
          <p>先只读分析旧项目 DB，再选择模块导入；本地备份导出和覆盖恢复仍保留在同一控制台。</p>
        </div>
        <div class="data-center-progress-track">
          <span :style="{ width: `${backupProgress}%` }" />
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
              <p class="eyebrow">旧项目 SQLite</p>
              <strong>数据导入预览</strong>
            </div>
            <NTag size="small" :bordered="false">只读分析</NTag>
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
            <label class="appearance-modal-label">旧项目 DB 路径</label>
            <NInput
              class="sqlite-path-input"
              :value="legacyImportStore.sqliteDbPath"
              placeholder="/Users/xrj/.dog_toolbox/doggy_toolbox.db"
              @update:value="legacyImportStore.setSqliteDbPath"
            />
            <section class="sqlite-path-note">
              <NIcon :component="ServerOutline" />
              <div>
                <strong>默认读取本机旧库</strong>
                <p>/Users/xrj/.dog_toolbox/doggy_toolbox.db</p>
              </div>
            </section>
            <div class="action-row">
              <NButton
                type="primary"
                :loading="legacyImportStore.loading"
                @click="analyzeSqliteSource"
              >
                <template #icon>
                  <NIcon :component="DocumentTextOutline" />
                </template>
                分析 SQLite DB
              </NButton>
            </div>
          </div>

          <div class="data-center-side-stack">
            <section class="data-center-insight-card">
              <div class="card-title-row">
                <strong>
                  <NIcon :component="ShieldCheckmarkOutline" />
                  识别结果
                </strong>
                <NTag
                  v-if="legacyImportStore.sqliteAnalysis"
                  size="small"
                  :bordered="false"
                >
                  SQLite
                </NTag>
              </div>
              <div v-if="legacyImportStore.sqliteAnalysis" class="legacy-analysis">
                <div>
                  <strong>{{ legacyImportStore.sqliteAnalysis.sourceLabel }}</strong>
                  <p class="muted">
                    可导入模块：{{ formatSections(legacyImportStore.sqliteAnalysis.availableSections) }}
                  </p>
                </div>
                <div class="sqlite-table-list">
                  <article
                    v-for="table in legacyImportStore.sqliteAnalysis.tables"
                    :key="table.name"
                    class="sqlite-table-row"
                  >
                    <span>{{ table.name }}</span>
                    <strong>{{ table.rows }}</strong>
                  </article>
                </div>
                <div class="chip-list">
                  <span
                    v-for="warning in legacyImportStore.sqliteAnalysis.warnings"
                    :key="warning"
                    class="chip"
                  >
                    {{ warning }}
                  </span>
                </div>
              </div>
              <NEmpty v-else description="先只读分析旧 SQLite DB，再决定导入哪些模块" />
            </section>

            <section v-if="legacyImportStore.sqliteAnalysis" class="data-center-insight-card data-center-risk-card">
              <div class="card-title-row">
                <strong>
                  <NIcon :component="SwapHorizontalOutline" />
                  导入模块
                </strong>
                <NTag size="small" :bordered="false">可选</NTag>
              </div>
              <NCheckboxGroup
                :value="legacyImportStore.selectedSections"
                :options="sectionOptions"
                @update:value="updateLegacySections"
              />
              <p class="muted">
                SQLite 导入会按模块覆盖命令、凭证、Prompt 或 HTTP 集合。执行前请先在下方生成当前项目备份。
              </p>
              <div class="action-row data-center-inline-end">
                <NTag size="small" :bordered="false" type="info">
                  当前选择：{{ formatSections(legacyImportStore.selectedSections) || '未选择' }}
                </NTag>
                <NPopconfirm
                  negative-text="取消"
                  positive-text="确认执行"
                  @positive-click="importSqliteSource"
                >
                  <template #trigger>
                    <NButton
                      type="error"
                      secondary
                      :loading="legacyImportStore.loading"
                      :disabled="!legacyImportStore.canImport"
                    >
                      导入选中模块
                    </NButton>
                  </template>
                  导入会覆盖新仓对应模块数据。请确认 DB 来源可靠且当前数据已备份。
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
              <p class="eyebrow">本地备份协议</p>
              <strong>备份 / 数据导入</strong>
            </div>
            <NTag size="small" :bordered="false">可审计</NTag>
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
                  :autosize="{ minRows: 8, maxRows: 16 }"
                />
                <div v-else class="data-center-empty-state">
                  <NEmpty description="还没有生成备份" />
                </div>
              </div>

              <div class="data-center-side-stack">
                <section class="data-center-insight-card">
                  <div class="card-title-row">
                    <strong>
                      <NIcon :component="ShieldCheckmarkOutline" />
                      备份范围
                    </strong>
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
                    <strong>
                      <NIcon :component="CloudUploadOutline" />
                      导出动作
                    </strong>
                    <NTag size="small" :bordered="false">本地生成</NTag>
                  </div>
                  <div class="data-center-action-stack">
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
                  :autosize="{ minRows: 8, maxRows: 16 }"
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

                <section class="data-center-insight-card data-center-risk-card">
                  <div class="card-title-row">
                    <strong>
                      <NIcon :component="CloudDownloadOutline" />
                      恢复动作
                    </strong>
                    <NTag size="small" :bordered="false">高风险</NTag>
                  </div>
                  <div class="data-center-action-stack">
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
                </section>
              </div>
            </div>
          </NTabPane>
        </NTabs>
      </NCard>
    </section>
  </div>
</template>
