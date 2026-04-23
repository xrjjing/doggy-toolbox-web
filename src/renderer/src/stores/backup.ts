import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  BackupDocument,
  BackupExportInput,
  BackupImportInput,
  BackupImportResult,
  BackupSectionKey
} from '@shared/ipc-contract'

export const backupSectionOptions: Array<{ label: string; value: BackupSectionKey }> = [
  { label: '命令管理', value: 'commands' },
  { label: '凭证管理', value: 'credentials' },
  { label: 'Prompt 模板', value: 'prompts' },
  { label: '节点列表', value: 'nodes' },
  { label: 'HTTP 集合', value: 'httpCollections' }
]

export const useBackupStore = defineStore('backup', () => {
  const selectedSections = ref<BackupSectionKey[]>([
    'commands',
    'credentials',
    'prompts',
    'nodes',
    'httpCollections'
  ])
  const exportedDocument = ref<BackupDocument | null>(null)
  const importResult = ref<BackupImportResult | null>(null)
  const importText = ref('')
  const loading = ref(false)
  const hasExport = computed(() => Boolean(exportedDocument.value))

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

  function setSections(value: BackupSectionKey[]): void {
    selectedSections.value = value
  }

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
