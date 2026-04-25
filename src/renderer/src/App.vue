<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watchEffect } from 'vue'
import type { GlobalThemeOverrides } from 'naive-ui'
import { darkTheme, lightTheme, NConfigProvider, NMessageProvider } from 'naive-ui'
import AppShell from '@renderer/components/AppShell.vue'
import { mapGlassOpacitySetting, mapUiScaleSetting, useAppStore } from '@renderer/stores/app'

const appStore = useAppStore()
const glassOpacity = computed(() => mapGlassOpacitySetting(appStore.appearance.glassOpacity))
const uiScale = computed(() => mapUiScaleSetting(appStore.appearance.uiScale))
const uiDensity = computed(() => Math.max(0.84, uiScale.value - 0.06))
const uiFontScale = computed(() => Math.max(0.9, uiScale.value - 0.02))
const glassSurfaceAlpha = computed(() =>
  Number(Math.max(0.18, Math.min(0.84, glassOpacity.value * 0.92)).toFixed(3))
)
const glassSurfaceStrongAlpha = computed(() =>
  Number(Math.max(0.28, Math.min(0.92, glassOpacity.value * 1.04)).toFixed(3))
)
const themeOverrides = computed<GlobalThemeOverrides>(() => {
  const themeFingerprint = [
    appStore.appearance.theme,
    appStore.appearance.titlebarMode,
    appStore.appearance.glassMode ? 'glass' : 'solid',
    appStore.isDark ? 'dark' : 'light'
  ].join(':')
  void themeFingerprint
  if (typeof window === 'undefined') return {}
  const frame = document.querySelector<HTMLElement>('.app-frame')
  const source = frame ?? document.body
  const css = getComputedStyle(source)
  const accent = css.getPropertyValue('--accent').trim() || '#0e639c'
  const accentStrong = css.getPropertyValue('--accent-strong').trim() || accent
  const ink = css.getPropertyValue('--ink').trim() || '#1f2328'
  const muted = css.getPropertyValue('--muted').trim() || '#5f6b76'
  const paper = css.getPropertyValue('--paper').trim() || '#ffffff'
  const paperElevated = css.getPropertyValue('--paper-elevated').trim() || paper
  const paperMuted = css.getPropertyValue('--paper-muted').trim() || paper
  const line = css.getPropertyValue('--line').trim() || 'rgba(31, 35, 40, 0.12)'
  const scrollbarThumb = css.getPropertyValue('--scrollbar-thumb').trim() || accent
  const scrollbarThumbHover = css.getPropertyValue('--scrollbar-thumb-hover').trim() || accentStrong
  const scrollbarTrack = css.getPropertyValue('--scrollbar-track').trim() || 'rgba(0,0,0,0.08)'
  return {
    common: {
      primaryColor: accent,
      primaryColorHover: accentStrong,
      primaryColorPressed: accentStrong,
      primaryColorSuppl: accentStrong,
      infoColor: accent,
      infoColorHover: accentStrong,
      infoColorPressed: accentStrong,
      infoColorSuppl: accentStrong,
      successColor: accent,
      successColorHover: accentStrong,
      successColorPressed: accentStrong,
      successColorSuppl: accentStrong,
      textColorBase: ink,
      textColor1: ink,
      textColor2: ink,
      textColor3: muted,
      placeholderColor: muted,
      placeholderColorDisabled: muted,
      iconColor: muted,
      iconColorHover: ink,
      iconColorPressed: ink,
      borderColor: line,
      dividerColor: line,
      cardColor: paper,
      modalColor: paper,
      popoverColor: paperElevated,
      bodyColor: paperMuted,
      tableColor: paper,
      tagColor: paperElevated,
      railColor: scrollbarTrack,
      scrollbarColor: scrollbarThumb,
      scrollbarColorHover: scrollbarThumbHover,
      buttonColor2: paperElevated,
      buttonColor2Hover: paper,
      buttonColor2Pressed: paperMuted,
      inputColor: paperElevated,
      inputColorDisabled: paperMuted,
      actionColor: paperMuted,
      hoverColor: paperMuted,
      pressedColor: paperElevated
    },
    Button: {
      textColorHover: accentStrong,
      textColorPressed: accentStrong,
      textColorFocus: accentStrong,
      colorSecondary: paperElevated,
      colorSecondaryHover: paper,
      colorSecondaryPressed: paperMuted,
      colorTertiary: paperElevated,
      colorTertiaryHover: paper,
      colorTertiaryPressed: paperMuted,
      border: `1px solid ${line}`,
      borderHover: `1px solid ${accent}`,
      borderPressed: `1px solid ${accentStrong}`,
      borderFocus: `1px solid ${accentStrong}`,
      colorPrimary: accent,
      colorHoverPrimary: accentStrong,
      colorPressedPrimary: accentStrong,
      colorFocusPrimary: accentStrong,
      borderPrimary: `1px solid ${accent}`,
      borderHoverPrimary: `1px solid ${accentStrong}`,
      borderPressedPrimary: `1px solid ${accentStrong}`,
      borderFocusPrimary: `1px solid ${accentStrong}`
    },
    Switch: {
      railColor: scrollbarTrack,
      railColorActive: accent,
      buttonColor: paperElevated,
      textColor: paper
    },
    Slider: {
      railColor: scrollbarTrack,
      railColorHover: scrollbarTrack,
      fillColor: accent,
      fillColorHover: accentStrong,
      handleColor: paperElevated,
      dotColor: paperElevated,
      dotColorModal: paperElevated,
      dotColorPopover: paperElevated,
      dotBorder: `2px solid ${scrollbarTrack}`,
      dotBorderActive: `2px solid ${accent}`
    },
    Checkbox: {
      color: paperElevated,
      colorChecked: accent,
      border: `1px solid ${line}`,
      borderChecked: `1px solid ${accent}`,
      borderFocus: `1px solid ${accentStrong}`,
      textColor: ink,
      textColorDisabled: muted
    },
    Tag: {
      color: paperElevated,
      colorPrimary: accent,
      colorChecked: accent,
      colorCheckedHover: accentStrong,
      colorCheckedPressed: accentStrong,
      textColor: ink,
      textColorPrimary: paper,
      textColorChecked: paper,
      border: `1px solid ${line}`,
      borderPrimary: `1px solid ${accent}`,
      closeIconColor: muted,
      closeIconColorHover: ink,
      closeIconColorPressed: ink
    }
  }
})

function syncAppearanceAttributes(target: HTMLElement): void {
  target.dataset.theme = appStore.appearance.theme
  target.dataset.glass = appStore.appearance.glassMode ? 'true' : 'false'
  target.dataset.titlebarMode = appStore.appearance.titlebarMode
  target.classList.toggle('is-dark-theme', appStore.isDark)
  target.style.setProperty('--glass-opacity', String(glassOpacity.value))
  target.style.setProperty('--glass-surface-alpha', String(glassSurfaceAlpha.value))
  target.style.setProperty('--glass-surface-strong-alpha', String(glassSurfaceStrongAlpha.value))
  target.style.setProperty('--ui-scale', String(uiScale.value))
  target.style.setProperty('--ui-density', String(uiDensity.value))
  target.style.setProperty('--ui-font-scale', String(uiFontScale.value))
}

onMounted(() => {
  void appStore.syncAppearanceToWindow()
})

watchEffect(() => {
  syncAppearanceAttributes(document.documentElement)
  syncAppearanceAttributes(document.body)
})

onBeforeUnmount(() => {
  for (const target of [document.documentElement, document.body]) {
    delete target.dataset.theme
    delete target.dataset.glass
    delete target.dataset.titlebarMode
    target.classList.remove('is-dark-theme')
    target.style.removeProperty('--glass-opacity')
    target.style.removeProperty('--glass-surface-alpha')
    target.style.removeProperty('--glass-surface-strong-alpha')
    target.style.removeProperty('--ui-scale')
    target.style.removeProperty('--ui-density')
    target.style.removeProperty('--ui-font-scale')
  }
})
</script>

<template>
  <NConfigProvider :theme="appStore.isDark ? darkTheme : lightTheme" :theme-overrides="themeOverrides">
    <NMessageProvider>
      <div
        class="app-shell-host"
        :data-theme="appStore.appearance.theme"
        :data-glass="appStore.appearance.glassMode ? 'true' : 'false'"
        :data-titlebar-mode="appStore.appearance.titlebarMode"
        :style="{
          '--glass-opacity': glassOpacity,
          '--glass-surface-alpha': glassSurfaceAlpha,
          '--glass-surface-strong-alpha': glassSurfaceStrongAlpha,
          '--ui-scale': uiScale,
          '--ui-density': uiDensity,
          '--ui-font-scale': uiFontScale
        }"
      >
        <AppShell />
      </div>
    </NMessageProvider>
  </NConfigProvider>
</template>

<style scoped>
.app-shell-host {
  width: 100%;
  min-height: 0;
  height: 100%;
  max-height: 100%;
  overflow: hidden;
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  font-size: calc(16px * var(--ui-font-scale));
}
</style>
