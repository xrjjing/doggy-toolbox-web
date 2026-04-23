<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NButton, NCard, NCheckbox, NModal, NSelect, NSlider, NSpace, NTag } from 'naive-ui'
import {
  appThemeOptions,
  cloneAppearance,
  defaultAppearance,
  titlebarModeOptions,
  type AppAppearance
} from '@renderer/stores/app'

/**
 * 这个弹窗专门承接旧项目“设置弹窗先预览，关闭时可恢复”的交互。
 * 这里不直接操作 localStorage，而是把草稿变化通过 emit 交给 AppShell 驱动 store 预览与提交。
 */
const props = defineProps<{
  show: boolean
  appearance: AppAppearance
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
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
  () => props.show,
  (visible) => {
    if (!visible) return
    original.value = cloneAppearance(props.appearance)
    draft.value = cloneAppearance(props.appearance)
  }
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
  emit('update:show', false)
}

function saveDraft(): void {
  emit('save', cloneAppearance(draft.value))
  emit('update:show', false)
}

function resetDraft(): void {
  draft.value = cloneAppearance(defaultAppearance)
  emit('preview', cloneAppearance(draft.value))
}
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    class="appearance-settings-modal"
    @mask-click="closeWithRestore"
    @update:show="(value) => !value && closeWithRestore()"
  >
    <NCard :bordered="false">
      <template #header>
        <div class="card-title-row">
          <div>
            <p class="eyebrow">appearance modal</p>
            <h3>外观设置</h3>
          </div>
          <NTag size="small" :bordered="false">
            {{ isDirty ? '有未保存修改' : '已同步' }}
          </NTag>
        </div>
      </template>

      <p class="muted">
        这里补回旧项目的设置弹窗体验：修改时先预览，保存后才持久化；直接关闭会恢复到打开前的状态。
      </p>

      <section class="appearance-modal-section">
        <label class="appearance-modal-label">主题</label>
        <NSelect
          :value="draft.theme"
          :options="appThemeOptions"
          @update:value="(theme) => patchDraft({ theme })"
        />
      </section>

      <section class="appearance-modal-section">
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
          <span>透明度 {{ draft.glassOpacity }}%</span>
          <NSlider
            :value="draft.glassOpacity"
            :min="45"
            :max="95"
            :step="5"
            :disabled="!draft.glassMode"
            @update:value="(glassOpacity) => patchDraft({ glassOpacity })"
          />
        </div>
      </section>

      <section class="appearance-modal-section">
        <div class="appearance-modal-slider">
          <span>UI 缩放 {{ draft.uiScale }}%</span>
          <NSlider
            :value="draft.uiScale"
            :min="50"
            :max="100"
            :step="5"
            @update:value="(uiScale) => patchDraft({ uiScale })"
          />
        </div>
      </section>

      <section class="appearance-modal-section">
        <label class="appearance-modal-label">标题栏视觉模式</label>
        <NSelect
          :value="draft.titlebarMode"
          :options="titlebarModeOptions"
          @update:value="(titlebarMode) => patchDraft({ titlebarMode })"
        />
      </section>

      <NSpace justify="end">
        <NButton tertiary @click="resetDraft">恢复默认</NButton>
        <NButton secondary @click="closeWithRestore">取消并恢复</NButton>
        <NButton type="primary" :disabled="!isDirty" @click="saveDraft">保存设置</NButton>
      </NSpace>
    </NCard>
  </NModal>
</template>
