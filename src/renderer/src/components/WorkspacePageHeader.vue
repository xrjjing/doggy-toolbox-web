<script setup lang="ts">
import { NTag } from 'naive-ui'

defineProps<{
  eyebrow: string
  title: string
  description: string
  badge?: string
}>()
</script>

<template>
  <section class="page-heading page-heading--workspace">
    <div class="page-heading__main">
      <div class="page-heading__headline">
        <p class="eyebrow">{{ eyebrow }}</p>
        <NTag v-if="badge" size="small" :bordered="false">{{ badge }}</NTag>
      </div>
      <h2>{{ title }}</h2>
      <p>{{ description }}</p>
    </div>
  </section>
</template>
