<script setup lang="ts">
withDefaults(
  defineProps<{
    active?: boolean
    as?: string
    interactive?: boolean
  }>(),
  {
    active: false,
    as: 'div',
    interactive: false
  }
)
</script>

<template>
  <component
    :is="as"
    class="zen-list-item"
    :class="{ active, 'zen-list-item--interactive': interactive }"
  >
    <div v-if="$slots.leading" class="zen-list-item__leading">
      <slot name="leading" />
    </div>
    <div class="zen-list-item__content">
      <slot />
    </div>
    <div v-if="$slots.meta" class="zen-list-item__meta">
      <slot name="meta" />
    </div>
  </component>
</template>

