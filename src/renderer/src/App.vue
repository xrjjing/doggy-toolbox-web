<script setup lang="ts">
import { darkTheme, lightTheme, NConfigProvider, NMessageProvider } from 'naive-ui'
import AppShell from '@renderer/components/AppShell.vue'
import { useAppStore } from '@renderer/stores/app'

const appStore = useAppStore()
</script>

<template>
  <NConfigProvider :theme="appStore.isDark ? darkTheme : lightTheme">
    <NMessageProvider>
      <AppShell />
    </NMessageProvider>
  </NConfigProvider>
</template>
