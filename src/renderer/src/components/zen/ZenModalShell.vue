<script setup lang="ts">
withDefaults(
  defineProps<{
    eyebrow?: string
    title: string
    status?: string
    closeLabel?: string
  }>(),
  {
    eyebrow: '',
    status: '',
    closeLabel: '关闭'
  }
)

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <section class="zen-modal-shell" role="dialog" aria-modal="true" :aria-label="title">
    <header class="zen-modal-shell__header">
      <div>
        <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
        <h3>{{ title }}</h3>
      </div>
      <div class="zen-modal-shell__header-actions">
        <slot name="status">
          <span v-if="status" class="zen-modal-shell__status">{{ status }}</span>
        </slot>
        <button class="zen-modal-shell__close" type="button" :aria-label="closeLabel" @click="emit('close')">
          ×
        </button>
      </div>
    </header>
    <div class="zen-modal-shell__body">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="zen-modal-shell__footer">
      <slot name="footer" />
    </footer>
  </section>
</template>

