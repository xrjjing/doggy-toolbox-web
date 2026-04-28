<script setup lang="ts">
withDefaults(
  defineProps<{
    type?: 'button' | 'submit' | 'reset'
    variant?: 'primary' | 'secondary' | 'tertiary' | 'danger'
    disabled?: boolean
  }>(),
  {
    type: 'button',
    variant: 'secondary',
    disabled: false
  }
)

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()
</script>

<template>
  <button
    class="zen-button"
    :class="[`zen-button--${variant}`]"
    :type="type"
    :disabled="disabled"
    @click="emit('click', $event)"
  >
    <span v-if="$slots.icon" class="zen-button__icon">
      <slot name="icon" />
    </span>
    <span class="zen-button__label">
      <slot />
    </span>
  </button>
</template>

