<script setup lang="ts">
import { onMounted } from 'vue'
import { darkTheme, lightTheme, NConfigProvider, NMessageProvider } from 'naive-ui'
import AppShell from '@renderer/components/AppShell.vue'
import { mapGlassOpacitySetting, useAppStore } from '@renderer/stores/app'

const appStore = useAppStore()

onMounted(() => {
  void appStore.syncAppearanceToWindow()
})
</script>

<template>
  <NConfigProvider :theme="appStore.isDark ? darkTheme : lightTheme">
    <NMessageProvider>
      <AppShell
        :style="{
          '--glass-opacity': mapGlassOpacitySetting(appStore.appearance.glassOpacity)
        }"
      />
    </NMessageProvider>
  </NConfigProvider>
</template>
