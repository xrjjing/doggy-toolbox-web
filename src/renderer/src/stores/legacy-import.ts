import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  BackupSectionKey,
  LegacyImportAnalysis,
  LegacyImportInput,
  LegacyImportResult
} from '@shared/ipc-contract'

export const useLegacyImportStore = defineStore('legacy-import', () => {
  const sourceJson = ref('')
  const analysis = ref<LegacyImportAnalysis | null>(null)
  const importResult = ref<LegacyImportResult | null>(null)
  const selectedSections = ref<BackupSectionKey[]>([])
  const loading = ref(false)
  const hasAnalysis = computed(() => Boolean(analysis.value))
  const hasImportResult = computed(() => Boolean(importResult.value))
  const availableSections = computed(() => analysis.value?.availableSections ?? [])
  const canImport = computed(
    () => Boolean(analysis.value) && selectedSections.value.length > 0 && !loading.value
  )

  async function analyze(): Promise<LegacyImportAnalysis> {
    loading.value = true
    try {
      const result = await window.doggy.analyzeLegacyImport(sourceJson.value)
      analysis.value = result
      selectedSections.value = [...result.availableSections]
      importResult.value = null
      return result
    } finally {
      loading.value = false
    }
  }

  async function importData(input?: LegacyImportInput): Promise<LegacyImportResult> {
    loading.value = true
    try {
      const result = await window.doggy.importLegacyData(
        input ?? {
          json: sourceJson.value,
          sections:
            selectedSections.value.length > 0 ? selectedSections.value : availableSections.value
        }
      )
      importResult.value = result
      return result
    } finally {
      loading.value = false
    }
  }

  function setSourceJson(value: string): void {
    sourceJson.value = value
    analysis.value = null
    importResult.value = null
    selectedSections.value = []
  }

  function setSections(value: BackupSectionKey[]): void {
    selectedSections.value = availableSections.value.filter((section) => value.includes(section))
  }

  return {
    sourceJson,
    analysis,
    importResult,
    selectedSections,
    loading,
    hasAnalysis,
    hasImportResult,
    availableSections,
    canImport,
    analyze,
    importData,
    setSourceJson,
    setSections
  }
})
