import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  CredentialModuleState,
  CredentialRecord,
  CredentialSaveInput
} from '@shared/ipc-contract'

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

  function hydrateState(nextState: CredentialModuleState): void {
    snapshot.value = nextState
    hasLoaded.value = true
  }

  async function load(): Promise<void> {
    loading.value = true
    try {
      hydrateState(await window.doggy.getCredentialsState())
    } finally {
      loading.value = false
    }
  }

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
    removeCredential,
    setSearch
  }
})
