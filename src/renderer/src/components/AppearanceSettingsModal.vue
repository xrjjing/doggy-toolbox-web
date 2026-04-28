<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NCheckbox, NInputNumber, NSelect, NSlider, NTag } from 'naive-ui'
import { ZenButton, ZenModalShell, ZenPanel } from '@renderer/components/zen'
import {
  appThemeOptions,
  cloneAppearance,
  defaultAppearance,
  mapUiScaleDisplayPercent,
  resolveUiScaleDisplayPercent,
  titlebarModeOptions,
  type AppAppearance
} from '@renderer/stores/app'

/**
 * 这个弹窗专门承接旧项目“设置弹窗先预览，关闭时可恢复”的交互。
 * 这里不直接操作 localStorage，而是把草稿变化通过 emit 交给 AppShell 驱动 store 预览与提交。
 */
const props = defineProps<{
  appearance: AppAppearance
}>()

const emit = defineEmits<{
  preview: [appearance: AppAppearance]
  save: [appearance: AppAppearance]
  cancel: []
}>()

/**
 * original 记录打开弹窗时的基线值。
 * draft 记录当前用户正在预览的临时值。
 * 关闭时如果 dirty=true，主线程会把 original 重新应用回去。
 */
const original = ref<AppAppearance>(cloneAppearance(props.appearance))
const draft = ref<AppAppearance>(cloneAppearance(props.appearance))

const isDirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(original.value))

watch(
  () => props.appearance,
  (appearance) => {
    original.value = cloneAppearance(appearance)
    draft.value = cloneAppearance(appearance)
  },
  { deep: true }
)

/**
 * 所有草稿修改都统一走这里。
 * 这样主题、玻璃、缩放等字段的预览行为保持一致，也便于以后补更多设置项。
 */
function patchDraft(patch: Partial<AppAppearance>): void {
  draft.value = {
    ...draft.value,
    ...patch
  }
  emit('preview', cloneAppearance(draft.value))
}

function closeWithRestore(): void {
  emit('cancel')
}

function saveDraft(): void {
  emit('save', cloneAppearance(draft.value))
}

function updateGlassOpacity(value: number | null): void {
  if (value == null) return
  patchDraft({ glassOpacity: Number(value) })
}

function updateUiScale(value: number | null): void {
  if (value == null) return
  patchDraft({ uiScale: resolveUiScaleDisplayPercent(Number(value)) })
}

function resetDraft(): void {
  draft.value = cloneAppearance(defaultAppearance)
  emit('preview', cloneAppearance(draft.value))
}

function handleWindowKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeWithRestore()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleWindowKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWindowKeydown)
})
</script>

<template>
  <div class="appearance-settings-backdrop" @click.self="closeWithRestore">
    <ZenModalShell
      class="appearance-settings-modal"
      eyebrow="Appearance"
      title="外观设置"
      @close="closeWithRestore"
    >
      <template #status>
        <NTag size="small" :bordered="false">
          {{ isDirty ? '有未保存修改' : '已同步' }}
        </NTag>
      </template>

      <div class="appearance-settings-body">
        <p class="muted">
          修改会即时预览；保存后才持久化，直接关闭会恢复到打开前的状态。
        </p>

        <ZenPanel as="section" class="appearance-modal-section" tone="soft">
          <label class="appearance-modal-label">主题</label>
          <NSelect
            :value="draft.theme"
            :options="appThemeOptions"
            @update:value="(theme) => patchDraft({ theme })"
          />
        </ZenPanel>

        <ZenPanel as="section" class="appearance-modal-section" tone="soft">
          <div class="appearance-modal-inline">
            <label class="appearance-modal-label">毛玻璃</label>
            <NCheckbox
              :checked="draft.glassMode"
              @update:checked="(glassMode) => patchDraft({ glassMode })"
            >
              启用毛玻璃效果
            </NCheckbox>
          </div>
          <div class="appearance-modal-slider">
            <div class="appearance-modal-slider-head">
              <span>透明度 {{ draft.glassOpacity }}%</span>
              <NInputNumber
                :value="draft.glassOpacity"
                size="small"
                :min="45"
                :max="95"
                :step="5"
                :precision="0"
                :disabled="!draft.glassMode"
                @update:value="updateGlassOpacity"
              />
            </div>
            <NSlider
              :value="draft.glassOpacity"
              :min="45"
              :max="95"
              :step="5"
              :disabled="!draft.glassMode"
              @update:value="(glassOpacity) => patchDraft({ glassOpacity })"
            />
          </div>
        </ZenPanel>

        <ZenPanel as="section" class="appearance-modal-section" tone="soft">
          <div class="appearance-modal-slider">
            <div class="appearance-modal-slider-head">
              <span>UI 缩放 {{ mapUiScaleDisplayPercent(draft.uiScale) }}%</span>
              <NInputNumber
                :value="mapUiScaleDisplayPercent(draft.uiScale)"
                size="small"
                :min="82"
                :max="112"
                :step="1"
                :precision="0"
                @update:value="updateUiScale"
              />
            </div>
            <NSlider
              :value="mapUiScaleDisplayPercent(draft.uiScale)"
              :min="82"
              :max="112"
              :step="1"
              @update:value="(uiScale) => patchDraft({ uiScale: resolveUiScaleDisplayPercent(uiScale) })"
            />
          </div>
        </ZenPanel>

        <ZenPanel as="section" class="appearance-modal-section" tone="soft">
          <label class="appearance-modal-label">标题栏视觉模式</label>
          <NSelect
            :value="draft.titlebarMode"
            :options="titlebarModeOptions"
            @update:value="(titlebarMode) => patchDraft({ titlebarMode })"
          />
        </ZenPanel>
      </div>

      <template #footer>
        <div class="appearance-actions">
          <ZenButton class="is-left" variant="tertiary" @click="resetDraft">恢复默认</ZenButton>
          <ZenButton variant="secondary" @click="closeWithRestore">取消并恢复</ZenButton>
          <ZenButton variant="primary" :disabled="!isDirty" @click="saveDraft">保存设置</ZenButton>
        </div>
      </template>
    </ZenModalShell>
  </div>
</template>
