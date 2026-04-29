import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  BackupSectionKey,
  LegacyImportAnalysis,
  LegacyImportInput,
  LegacyImportResult,
  LegacySqliteImportAnalysis,
  LegacySqliteImportInput
} from '@shared/ipc-contract'

/**
 * 旧数据导入向导 store。
 * 状态分两段：analysis 负责“这份 JSON 能导什么”，importResult 负责“真正导入后发生了什么”，
 * 两者之间通过 selectedSections 串起来，便于用户先分析再挑模块导入。
 */

export const useLegacyImportStore = defineStore('legacy-import', () => {
  const sourceJson = ref('')
  const sqliteDbPath = ref('/Users/xrj/.dog_toolbox/doggy_toolbox.db')
  const analysis = ref<LegacyImportAnalysis | null>(null)
  const sqliteAnalysis = ref<LegacySqliteImportAnalysis | null>(null)
  const importResult = ref<LegacyImportResult | null>(null)
  const selectedSections = ref<BackupSectionKey[]>([])
  const loading = ref(false)
  const hasAnalysis = computed(() => Boolean(analysis.value ?? sqliteAnalysis.value))
  const hasImportResult = computed(() => Boolean(importResult.value))
  const activeAnalysis = computed(() => sqliteAnalysis.value ?? analysis.value)
  const availableSections = computed(() => activeAnalysis.value?.availableSections ?? [])
  const canImport = computed(
    () => Boolean(activeAnalysis.value) && selectedSections.value.length > 0 && !loading.value
  )

  /**
   * 先让主进程分析旧 JSON 的结构和可导模块。
   * 分析成功后默认全选 availableSections，降低用户从旧备份迁移时的操作成本。
   */
  async function analyze(): Promise<LegacyImportAnalysis> {
    loading.value = true
    try {
      const result = await window.doggy.analyzeLegacyImport(sourceJson.value)
      analysis.value = result
      sqliteAnalysis.value = null
      selectedSections.value = [...result.availableSections]
      importResult.value = null
      return result
    } finally {
      loading.value = false
    }
  }

  /**
   * 真正导入时仍允许调用方覆盖默认输入，
   * 否则就使用当前文本和已勾选 section 作为本轮迁移范围。
   */
  async function importData(input?: LegacyImportInput): Promise<LegacyImportResult> {
    loading.value = true
    try {
      const result = await window.doggy.importLegacyData(
        input ?? {
          json: sourceJson.value,
          sections:
            selectedSections.value.length > 0
              ? [...selectedSections.value]
              : [...availableSections.value]
        }
      )
      importResult.value = result
      return result
    } finally {
      loading.value = false
    }
  }

  async function analyzeSqlite(): Promise<LegacySqliteImportAnalysis> {
    loading.value = true
    try {
      const result = await window.doggy.analyzeLegacySqliteImport(sqliteDbPath.value)
      sqliteAnalysis.value = result
      analysis.value = null
      selectedSections.value = [...result.availableSections]
      importResult.value = null
      return result
    } finally {
      loading.value = false
    }
  }

  async function importSqlite(input?: LegacySqliteImportInput): Promise<LegacyImportResult> {
    loading.value = true
    try {
      const result = await window.doggy.importLegacySqliteData(
        input ?? {
          dbPath: sqliteDbPath.value,
          sections:
            selectedSections.value.length > 0
              ? [...selectedSections.value]
              : [...availableSections.value]
        }
      )
      importResult.value = result
      return result
    } finally {
      loading.value = false
    }
  }

  /**
   * 源 JSON 一旦变化，之前的分析结果和导入结果都可能失真，因此全部清空重新开始。
   */
  function setSourceJson(value: string): void {
    sourceJson.value = value
    analysis.value = null
    sqliteAnalysis.value = null
    importResult.value = null
    selectedSections.value = []
  }

  function setSqliteDbPath(value: string): void {
    sqliteDbPath.value = value
    analysis.value = null
    sqliteAnalysis.value = null
    importResult.value = null
    selectedSections.value = []
  }

  /**
   * 只允许选择 analysis 声明过的可导 section，防止 renderer 手工塞入后端不支持的键。
   */
  function setSections(value: BackupSectionKey[]): void {
    selectedSections.value = availableSections.value.filter((section) => value.includes(section))
  }

  return {
    sourceJson,
    sqliteDbPath,
    analysis,
    sqliteAnalysis,
    activeAnalysis,
    importResult,
    selectedSections,
    loading,
    hasAnalysis,
    hasImportResult,
    availableSections,
    canImport,
    analyze,
    importData,
    analyzeSqlite,
    importSqlite,
    setSourceJson,
    setSqliteDbPath,
    setSections
  }
})
