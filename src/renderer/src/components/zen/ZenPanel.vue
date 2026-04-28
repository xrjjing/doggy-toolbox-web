<script setup lang="ts">
withDefaults(
  defineProps<{
    as?: string
    tone?: 'default' | 'strong' | 'soft'
    padded?: boolean
  }>(),
  {
    as: 'section',
    tone: 'default',
    padded: true
  }
)
</script>

<template>
  <component
    :is="as"
    class="zen-panel"
    :class="[`zen-panel--${tone}`, { 'zen-panel--flush': !padded }]"
  >
    <slot />
  </component>
</template>

