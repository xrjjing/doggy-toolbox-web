import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  CredentialImportInput,
  CredentialImportResult,
  CredentialModuleState,
  CredentialRecord,
  CredentialSaveInput
} from '@shared/ipc-contract'

/**
 * 凭证管理 store。
 * 这里刻意不在 renderer 处理加解密，只展示主进程返回的模块快照与 secretEncoding 信息，
 * 让安全策略始终收口在 main 进程。
 */

/**
 * 搜索包含 password / extra，是为了让“凭证里记了备注或口令片段”的老数据也能被找回。
 * 这属于本地桌面工具的取舍，优先可检索性，而不是服务端场景那种最小暴露面。
 */
function matchesSearch(credential: CredentialRecord, normalizedSearch: string): boolean {
  if (!normalizedSearch) return true

  return [
    credential.service,
    credential.url,
    credential.account,
    credential.password,
    ...credential.extra
  ]
    .join('\n')
    .toLowerCase()
    .includes(normalizedSearch)
}

export const useCredentialsStore = defineStore('credentials', () => {
  const snapshot = ref<CredentialModuleState | null>(null)
  const search = ref('')
  const loading = ref(false)
  const saving = ref(false)
  const hasLoaded = ref(false)
  const normalizedSearch = computed(() => search.value.trim().toLowerCase())

  const credentials = computed(() => snapshot.value?.credentials ?? [])
  const storageFile = computed(() => snapshot.value?.storageFile ?? '')
  const updatedAt = computed(() => snapshot.value?.updatedAt ?? '')
  const secretEncoding = computed(() => snapshot.value?.secretEncoding ?? 'plain')
  const visibleCredentials = computed(() =>
    credentials.value.filter((credential) => matchesSearch(credential, normalizedSearch.value))
  )

  /**
   * 凭证列表没有额外的 active item 视图态，因此 hydrate 只负责替换快照并标记加载完成。
   */
  function hydrateState(nextState: CredentialModuleState): void {
    snapshot.value = nextState
    hasLoaded.value = true
  }

  /**
   * 统一从主进程重载，确保 renderer 展示的 secretEncoding、更新时间与真实落盘一致。
   */
  async function load(): Promise<void> {
    loading.value = true
    try {
      hydrateState(await window.doggy.getCredentialsState())
    } finally {
      loading.value = false
    }
  }

  /**
   * 写入后不手工拼接本地列表，而是回源重新获取完整状态，
   * 避免漏掉主进程生成的 id、排序与编码方式信息。
   */
  async function saveCredential(input: CredentialSaveInput): Promise<CredentialRecord> {
    saving.value = true
    try {
      const credential = await window.doggy.saveCredential(input)
      await load()
      return credential
    } finally {
      saving.value = false
    }
  }

  /**
   * 删除流程与保存保持同一收口策略：先执行主进程操作，再整体 reload。
   */
  async function removeCredential(credentialId: string): Promise<boolean> {
    saving.value = true
    try {
      const result = await window.doggy.deleteCredential(credentialId)
      await load()
      return result.ok
    } finally {
      saving.value = false
    }
  }

  async function importCredentials(input: CredentialImportInput): Promise<CredentialImportResult> {
    saving.value = true
    try {
      const result = await window.doggy.importCredentials(input)
      await load()
      return result
    } finally {
      saving.value = false
    }
  }

  async function reorderCredentials(credentialIds: string[]): Promise<void> {
    saving.value = true
    try {
      await window.doggy.reorderCredentials(credentialIds)
      await load()
    } finally {
      saving.value = false
    }
  }

  function setSearch(value: string): void {
    search.value = value
  }

  return {
    snapshot,
    search,
    loading,
    saving,
    hasLoaded,
    credentials,
    visibleCredentials,
    storageFile,
    updatedAt,
    secretEncoding,
    load,
    saveCredential,
    importCredentials,
    reorderCredentials,
    removeCredential,
    setSearch
  }
})
