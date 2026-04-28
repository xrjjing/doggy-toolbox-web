<script setup lang="ts">
withDefaults(
  defineProps<{
    as?: string
    active?: boolean
    interactive?: boolean
    selected?: boolean
  }>(),
  {
    as: 'article',
    active: false,
    interactive: false,
    selected: false
  }
)
</script>

<template>
  <component
    :is="as"
    class="zen-card"
    :class="{
      'zen-card--active': active,
      'zen-card--interactive': interactive,
      'zen-card--selected': selected
    }"
  >
    <slot />
  </component>
</template>

