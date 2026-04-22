import { defineStore } from 'pinia'
import type { RuntimeInfo } from '../../../shared/ipc-contract'

export const useAppStore = defineStore('app', {
  state: () => ({
    isDark: false,
    runtimeInfo: null as RuntimeInfo | null
  }),
  actions: {
    toggleTheme() {
      this.isDark = !this.isDark
    },
    async loadRuntimeInfo() {
      this.runtimeInfo = await window.doggy.getRuntimeInfo()
    }
  }
})
