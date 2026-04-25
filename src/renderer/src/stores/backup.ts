import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  BackupDocument,
  BackupExportInput,
  BackupImportInput,
  BackupImportResult,
  BackupSectionKey
} from '@shared/ipc-contract'

/**
 * 统一备份恢复 store。
 * renderer 只负责收集用户选中的 section、原始导入文本和最近一次结果，
 * 真正的文档拼装与覆盖恢复都在主进程完成。
 */

/**
 * 这里的 section 顺序同时服务于 UI 展示和默认导出顺序，
 * 与主进程 `BackupService` 的模块命名保持一致，避免前后端映射分叉。
 */
export const backupSectionOptions: Array<{ label: string; value: BackupSectionKey }> = [
  { label: '命令管理', value: 'commands' },
  { label: '凭证管理', value: 'credentials' },
  { label: 'Prompt 模板', value: 'prompts' },
  { label: 'HTTP 集合', value: 'httpCollections' },
  { label: 'AI 设置', value: 'aiSettings' }
]

export const useBackupStore = defineStore('backup', () => {
  const selectedSections = ref<BackupSectionKey[]>([
    'commands',
    'credentials',
    'prompts',
    'httpCollections',
    'aiSettings'
  ])
  const exportedDocument = ref<BackupDocument | null>(null)
  const importResult = ref<BackupImportResult | null>(null)
  const importText = ref('')
  const loading = ref(false)
  const hasExport = computed(() => Boolean(exportedDocument.value))

  /**
   * 导出时优先使用调用方显式传入的 input；
   * 视图层没传参时，退回当前勾选的 section 作为默认导出范围。
   */
  async function exportBackup(input?: BackupExportInput): Promise<BackupDocument> {
    loading.value = true
    try {
      const document = await window.doggy.exportBackup(
        input ?? { sections: selectedSections.value }
      )
      exportedDocument.value = document
      return document
    } finally {
      loading.value = false
    }
  }

  /**
   * 导入同样遵循“显式参数优先，store 草稿兜底”的约定，
   * 方便表单模式和编排式调用复用同一入口。
   */
  async function importBackup(input?: BackupImportInput): Promise<BackupImportResult> {
    loading.value = true
    try {
      const result = await window.doggy.importBackup(
        input ?? {
          json: importText.value,
          sections: selectedSections.value
        }
      )
      importResult.value = result
      return result
    } finally {
      loading.value = false
    }
  }

  /**
   * section 选择是纯 renderer 态，直到真正导入/导出时才会送给主进程。
   */
  function setSections(value: BackupSectionKey[]): void {
    selectedSections.value = value
  }

  /**
   * 保留原始 JSON 文本，便于用户在导入前继续编辑或粘贴替换。
   */
  function setImportText(value: string): void {
    importText.value = value
  }

  return {
    selectedSections,
    exportedDocument,
    importResult,
    importText,
    loading,
    hasExport,
    exportBackup,
    importBackup,
    setSections,
    setImportText
  }
})
