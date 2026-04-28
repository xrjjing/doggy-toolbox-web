<script setup lang="ts">
import { computed, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NEmpty, NInput, NModal, NTag } from 'naive-ui'
import { ZenListItem, ZenModalShell } from '@renderer/components/zen'
import { useToolSearchStore, type ToolSearchTarget } from '@renderer/stores/tool-search'

const router = useRouter()
const searchStore = useToolSearchStore()

const selectedTarget = computed(() => searchStore.visibleResults[searchStore.selectedIndex] ?? null)
const visibleGroups = computed(() =>
  searchStore.groupedResults.filter((group) => group.targets.length > 0)
)

/**
 * 搜索弹窗延续旧项目 command palette 的定位：
 * - 展示收藏、最近使用和搜索结果。
 * - 点击后统一走 Vue Router，不直接操作 DOM。
 * - 收藏 / 最近使用 / 使用次数只放在 localStorage，不引入 Main Process。
 */
async function openTarget(target: ToolSearchTarget): Promise<void> {
  searchStore.trackUsage(target.id)
  searchStore.close()
  await router.push(target.path)
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    searchStore.moveSelection(1)
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    searchStore.moveSelection(-1)
    return
  }

  if (event.key === 'Enter' && selectedTarget.value) {
    event.preventDefault()
    void openTarget(selectedTarget.value)
  }
}

watch(
  () => searchStore.isOpen,
  async (isOpen) => {
    if (!isOpen) return
    await nextTick()
    document.querySelector<HTMLInputElement>('.global-search-input input')?.focus()
  }
)
</script>

<template>
  <NModal
    :show="searchStore.isOpen"
    class="global-search-modal"
    @update:show="(value) => (value ? searchStore.open() : searchStore.close())"
  >
    <ZenModalShell eyebrow="Command Palette" title="全局搜索" @close="searchStore.close">
      <NInput
        :value="searchStore.query"
        class="global-search-input"
        clearable
        placeholder="搜索工具、模块、拼音或英文关键字"
        @keydown="handleKeydown"
        @update:value="searchStore.setQuery"
      />

      <div class="global-search-results">
        <template v-if="searchStore.visibleResults.length > 0">
          <section
            v-for="group in visibleGroups"
            :key="group.title"
            class="global-search-section"
          >
            <p class="eyebrow">{{ group.title }}</p>
            <ZenListItem
              v-for="target in group.targets"
              :key="target.id"
              as="button"
              class="global-search-item"
              :active="searchStore.visibleResults[searchStore.selectedIndex]?.id === target.id"
              interactive
              type="button"
              @click="openTarget(target)"
            >
              <strong>{{ target.label }}</strong>
              <p>{{ target.description }}</p>
              <template #meta>
                <NTag size="small" :bordered="false">{{ target.category }}</NTag>
                <button
                  class="global-search-favorite"
                  type="button"
                  :aria-label="searchStore.favorites.has(target.id) ? '取消收藏' : '添加收藏'"
                  @click.stop="searchStore.toggleFavorite(target.id)"
                >
                  {{ searchStore.favorites.has(target.id) ? '★' : '☆' }}
                </button>
              </template>
            </ZenListItem>
          </section>
        </template>

        <NEmpty v-else description="未找到匹配入口" />
      </div>

      <template #footer>
        <div class="global-search-footer">
          <span>↑↓ 选择</span>
          <span>Enter 打开</span>
          <span>Esc 关闭</span>
          <NButton tertiary size="small" @click="searchStore.close">关闭</NButton>
        </div>
      </template>
    </ZenModalShell>
  </NModal>
</template>
