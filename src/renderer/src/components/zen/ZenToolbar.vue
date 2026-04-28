<script setup lang="ts">
withDefaults(
  defineProps<{
    align?: 'start' | 'center' | 'end' | 'between'
    compact?: boolean
  }>(),
  {
    align: 'between',
    compact: false
  }
)
</script>

<template>
  <div class="zen-toolbar" :class="[`zen-toolbar--${align}`, { 'zen-toolbar--compact': compact }]">
    <div v-if="$slots.default" class="zen-toolbar__main">
      <slot />
    </div>
    <div v-if="$slots.actions" class="zen-toolbar__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

