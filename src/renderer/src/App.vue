<script setup lang="ts">
import { darkTheme, lightTheme, NConfigProvider, NMessageProvider } from 'naive-ui'
import AppShell from '@renderer/components/AppShell.vue'
import { mapGlassOpacitySetting, useAppStore } from '@renderer/stores/app'

const appStore = useAppStore()
</script>

<template>
  <NConfigProvider :theme="appStore.isDark ? darkTheme : lightTheme">
    <NMessageProvider>
      <AppShell
        :style="{
          '--glass-opacity': mapGlassOpacitySetting(appStore.appearance.glassOpacity),
          '--ui-scale': appStore.appearance.uiScale / 100
        }"
      />
    </NMessageProvider>
  </NConfigProvider>
</template>
