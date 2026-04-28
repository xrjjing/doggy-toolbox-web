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
  DocumentTextOutline,
  ShieldCheckmarkOutline,
  SwapHorizontalOutline
} from '@vicons/ionicons5'
import type { BackupSectionKey } from '@shared/ipc-contract'
import { backupSectionOptions } from '@renderer/stores/backup'
import { useLegacyImportStore } from '@renderer/stores/legacy-import'

/**
 * 旧数据导入页是 renderer 侧的导入编排界面，不直接解析 JSON，也不直接落盘。
 *
 * 真实链路：
 * UI -> legacyImportStore -> window.doggy(preload)
 * -> ipcMain.handle('legacy:analyze-import' | 'legacy:import')
 * -> LegacyImportService -> 各模块 service(Command/Credential/Prompt)
 *
 * 这样拆分后：
 * - 页面只负责提示来源类型、可选模块和导入结果。
 * - LegacyImportService 统一判断 JSON 合法性、来源结构以及覆盖/合并策略。
 * - 具体模块落盘仍由各自 service 执行，避免导入逻辑绕过正常持久化边界。
 */
const message = useMessage()
const legacyImportStore = useLegacyImportStore()
const sectionLabelMap = new Map(backupSectionOptions.map((option) => [option.value, option.label]))

// 统计卡片优先展示最近一次导入结果；若还未导入，则展示最近一次分析摘要。
const summaryCards = computed(() => {
  const summary = legacyImportStore.importResult?.summary ?? legacyImportStore.analysis?.summary
  return [
    { label: '命令', value: summary?.commands ?? 0 },
    { label: '命令分组', value: summary?.commandTabs ?? 0 },
    { label: '凭证', value: summary?.credentials ?? 0 },
    { label: 'Prompt 分类', value: summary?.promptCategories ?? 0 },
    { label: 'Prompt 模板', value: summary?.promptTemplates ?? 0 }
  ]
})
// 可选模块以后端识别出的 availableSections 为准，页面不能越权暴露不支持的导入项。
const sectionOptions = computed(() =>
  backupSectionOptions.filter((option) =>
    legacyImportStore.availableSections.includes(option.value)
  )
)
const importProgress = computed(() => {
  if (legacyImportStore.importResult) return 100
  if (legacyImportStore.hasAnalysis) return Math.max(48, legacyImportStore.selectedSections.length * 24)
  return 18
})

function formatSections(sections: BackupSectionKey[]): string {
  return sections.map((section) => sectionLabelMap.get(section) ?? section).join('、')
}

function formatImportedAt(value: string): string {
  if (!value) return '等待导入'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

// 复选框回调给出的值类型较宽，这里显式收窄成 BackupSectionKey，并过滤掉不允许的项。
function updateSections(value: Array<string | number>): void {
  const allowed = new Set<BackupSectionKey>(sectionOptions.value.map((option) => option.value))
  legacyImportStore.setSections(
    value.filter((item): item is BackupSectionKey => allowed.has(item as BackupSectionKey))
  )
}

// 识别阶段只做预分析，不执行真实写入。
// 其输出用于提示“来源是什么”“哪些模块可导入”“可能有哪些风险”。
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

// 真实导入必须基于一次成功的 analyze 结果；
// 页面仅做前置校验，覆盖/合并语义由 LegacyImportService 决定。
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
  <section class="data-center-progress-island backup-progress-hero">
    <div class="data-center-orb">
      <NIcon :component="SwapHorizontalOutline" />
    </div>
    <div class="data-center-progress-copy">
      <p class="eyebrow">旧项目迁移</p>
      <strong>识别、选择、确认导入</strong>
      <p>先由后端识别 JSON 来源和可导入模块，再选择范围并通过确认弹层执行真实写入。</p>
    </div>
    <div class="data-center-progress-track">
      <span :style="{ width: `${importProgress}%` }" />
    </div>
    <div class="data-center-progress-meta">
      <span>{{ legacyImportStore.hasAnalysis ? '已识别来源' : '等待识别' }}</span>
      <span>已选 {{ legacyImportStore.selectedSections.length }} 个模块</span>
    </div>
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

  <div class="backup-shell backup-zen-shell legacy-zen-shell">
    <NCard class="soft-card backup-flow-card" :bordered="false">
      <template #header>
        <div class="card-title-row">
          <strong>
            <NIcon :component="DocumentTextOutline" />
            导入源 JSON
          </strong>
          <NTag size="small" :bordered="false">只读识别</NTag>
        </div>
      </template>
      <div class="backup-flow-stack">
        <!-- 原始 JSON 文本由 store 暂存；一旦用户改动文本，旧分析和旧导入结果会被清空。 -->
        <NInput
          :value="legacyImportStore.sourceJson"
          type="textarea"
          placeholder="粘贴旧项目总备份 JSON，或旧项目 Prompt 模板导出 JSON"
          :autosize="{ minRows: 12, maxRows: 18 }"
          @update:value="legacyImportStore.setSourceJson"
        />

        <div class="action-row">
          <NButton type="primary" :loading="legacyImportStore.loading" @click="analyzeSource">
            <template #icon>
              <NIcon :component="DocumentTextOutline" />
            </template>
            识别旧数据类型
          </NButton>
        </div>
      </div>
    </NCard>

    <NCard class="soft-card backup-flow-card" :bordered="false">
      <template #header>
        <div class="card-title-row">
          <strong>
            <NIcon :component="ShieldCheckmarkOutline" />
            识别结果
          </strong>
          <NTag size="small" :bordered="false">预检</NTag>
        </div>
      </template>

      <div v-if="legacyImportStore.analysis" class="legacy-analysis">
        <!-- 这里展示的是 analyze 阶段的只读结果，目的是在导入前先讲清来源和影响范围。 -->
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
      class="soft-card backup-options-card backup-flow-card backup-risk-panel"
      :bordered="false"
    >
      <template #header>
        <div class="card-title-row">
          <strong>
            <NIcon :component="SwapHorizontalOutline" />
            导入模块
          </strong>
          <NTag size="small" :bordered="false" type="warning">确认后写入</NTag>
        </div>
      </template>

      <!-- 复选框只允许选择当前来源真实支持的 section。 -->
      <NCheckboxGroup
        :value="legacyImportStore.selectedSections"
        :options="sectionOptions"
        @update:value="updateSections"
      />

      <p class="muted">
        旧项目总备份会覆盖命令或凭证模块；旧 Prompt 导出会按分类名称和模板标题做合并导入。
      </p>

      <div class="action-row">
        <NTag size="small" :bordered="false" type="info">
          当前选择：{{ formatSections(legacyImportStore.selectedSections) || '未选择' }}
        </NTag>

        <div>
          <NPopconfirm
            negative-text="取消"
            positive-text="确认执行"
            @positive-click="importSource"
          >
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

    <NCard v-if="legacyImportStore.importResult" class="soft-card backup-flow-card" :bordered="false">
      <template #header>
        <div class="card-title-row">
          <strong>最近一次导入结果</strong>
          <NTag size="small" :bordered="false">完成</NTag>
        </div>
      </template>

      <!-- 这里展示的是 import 阶段的最终结果，与上面的 analysis 预估结果明确分层。 -->
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
