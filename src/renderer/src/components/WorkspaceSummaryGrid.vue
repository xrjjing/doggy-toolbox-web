<script setup lang="ts">
type SummaryItem = {
  label: string
  value: string | number
  description?: string
}

defineProps<{
  items: SummaryItem[]
  compact?: boolean
}>()
</script>

<template>
  <section class="workspace-summary-grid" :class="{ compact }">
    <article v-for="item in items" :key="item.label" class="workspace-summary-card">
      <div class="workspace-summary-head">
        <strong>{{ item.label }}</strong>
        <span>{{ item.value }}</span>
      </div>
      <p v-if="item.description">{{ item.description }}</p>
    </article>
  </section>
</template>
