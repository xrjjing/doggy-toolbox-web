<script setup lang="ts">
import { computed } from 'vue'
import {
  NButton,
  NCard,
  NCheckboxGroup,
  NEmpty,
  NInput,
  NPopconfirm,
  NSpace,
  NTag,
  useMessage
} from 'naive-ui'
import type { BackupSectionKey } from '@shared/ipc-contract'
import { backupSectionOptions } from '@renderer/stores/backup'
import { useLegacyImportStore } from '@renderer/stores/legacy-import'

const message = useMessage()
const legacyImportStore = useLegacyImportStore()
const sectionLabelMap = new Map(backupSectionOptions.map((option) => [option.value, option.label]))

const summaryCards = computed(() => {
  const summary = legacyImportStore.importResult?.summary ?? legacyImportStore.analysis?.summary
  return [
    { label: '命令', value: summary?.commands ?? 0 },
    { label: '命令分组', value: summary?.commandTabs ?? 0 },
    { label: '凭证', value: summary?.credentials ?? 0 },
    { label: 'Prompt 分类', value: summary?.promptCategories ?? 0 },
    { label: 'Prompt 模板', value: summary?.promptTemplates ?? 0 },
    { label: '节点', value: summary?.nodes ?? 0 }
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

function updateSections(value: Array<string | number>): void {
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
</script>

<template>
  <section class="page-heading">
    <p class="eyebrow">legacy import</p>
    <h2>旧数据导入助手</h2>
    <p>
      当前识别两类旧项目数据源：旧项目总备份 JSON，以及旧项目 Prompt 模板导出 JSON。
      导入前会先做结构识别，导入时只落到新仓已经完成的模块。
    </p>
  </section>

  <section class="backup-summary-grid">
    <article v-for="card in summaryCards" :key="card.label" class="progress-card">
      <div class="progress-head">
        <strong>{{ card.label }}</strong>
        <span>{{ card.value }}</span>
      </div>
      <p>来自最近一次分析或导入结果。</p>
    </article>
  </section>

  <div class="backup-shell">
    <NCard class="soft-card" :bordered="false">
      <template #header>导入源 JSON</template>
      <NSpace vertical size="large">
        <NInput
          :value="legacyImportStore.sourceJson"
          type="textarea"
          placeholder="粘贴旧项目总备份 JSON，或旧项目 Prompt 模板导出 JSON"
          :autosize="{ minRows: 12, maxRows: 18 }"
          @update:value="legacyImportStore.setSourceJson"
        />

        <div class="action-row">
          <NButton type="primary" :loading="legacyImportStore.loading" @click="analyzeSource">
            识别旧数据类型
          </NButton>
        </div>
      </NSpace>
    </NCard>

    <NCard class="soft-card" :bordered="false">
      <template #header>识别结果</template>

      <div v-if="legacyImportStore.analysis" class="legacy-analysis">
        <div class="card-title-row">
          <strong>{{ legacyImportStore.analysis.sourceLabel }}</strong>
          <NTag size="small" :bordered="false">{{ legacyImportStore.analysis.sourceKind }}</NTag>
        </div>
        <p class="muted">
          可导入模块：{{ formatSections(legacyImportStore.analysis.availableSections) }}
        </p>

        <div class="chip-list">
          <span v-for="warning in legacyImportStore.analysis.warnings" :key="warning" class="chip">
            {{ warning }}
          </span>
        </div>
      </div>

      <NEmpty v-else description="先执行一次识别，确认旧数据类型和可导入模块" />
    </NCard>

    <NCard
      v-if="legacyImportStore.analysis"
      class="soft-card backup-options-card"
      :bordered="false"
    >
      <template #header>导入模块</template>

      <NCheckboxGroup
        :value="legacyImportStore.selectedSections"
        :options="sectionOptions"
        @update:value="updateSections"
      />

      <p class="muted">
        旧项目总备份会覆盖命令、凭证或节点模块；旧 Prompt 导出会按分类名称和模板标题做合并导入。
      </p>

      <div class="action-row">
        <NTag size="small" :bordered="false" type="info">
          当前选择：{{ formatSections(legacyImportStore.selectedSections) || '未选择' }}
        </NTag>

        <div>
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
      </div>
    </NCard>

    <NCard v-if="legacyImportStore.importResult" class="soft-card" :bordered="false">
      <template #header>最近一次导入结果</template>

      <div class="legacy-analysis">
        <div class="card-title-row">
          <strong>{{ formatSections(legacyImportStore.importResult.sections) }}</strong>
          <NTag size="small" :bordered="false">{{
            legacyImportStore.importResult.sourceKind
          }}</NTag>
        </div>
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
      </div>
    </NCard>
  </div>
</template>
