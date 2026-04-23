<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  NButton,
  NCheckbox,
  NInput,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NTag,
  useMessage
} from 'naive-ui'
import type { ToolPanelSnapshot } from '../types'
import {
  analyzeDiff,
  applyDiffDirection,
  buildInlineDiffSegments,
  formatDiffSummary,
  normalizeDiffInput,
  serializeDiffRows,
  type DiffDirection,
  type DiffMode,
  type DiffRow,
  type DiffSegment
} from '../utils/core-diff'

const emit = defineEmits<{
  snapshot: [snapshot: ToolPanelSnapshot]
}>()

const message = useMessage()
const mode = ref<DiffMode>('text')
const wrap = ref(true)
const direction = ref<DiffDirection>('ltr')
const leftText = ref('')
const rightText = ref('')
const rows = ref<DiffRow[]>([])
const extra = ref('')
const leftError = ref('')
const rightError = ref('')

const modeOptions = [
  { label: 'Text', value: 'text' },
  { label: 'JSON', value: 'json' }
]

/**
 * `applyLabel` 只依赖当前方向。
 * 单独抽成计算属性后，模板不需要再内联三元表达式，状态切换时也更容易排查“按钮文案和真实方向不一致”的问题。
 */
const applyLabel = computed(() => (direction.value === 'ltr' ? '应用到右侧' : '应用到左侧'))

function emitSnapshot(): void {
  emit('snapshot', {
    input: [leftText.value, '---', rightText.value].join('\n'),
    output: serializeDiffRows(rows.value),
    extra: extra.value
  })
}

function runDiff(): void {
  try {
    const result = analyzeDiff(leftText.value, rightText.value, mode.value)
    rows.value = result.rows
    leftError.value = result.leftError ?? ''
    rightError.value = result.rightError ?? ''
    extra.value = [
      `模式: ${mode.value}`,
      `自动换行: ${wrap.value ? '开启' : '关闭'}`,
      `方向: ${direction.value === 'ltr' ? '左→右' : '右→左'}`,
      formatDiffSummary(result.summary)
    ].join('\n')
    emitSnapshot()
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

function formatJsonText(): void {
  if (mode.value !== 'json') return
  const leftResult = normalizeDiffInput(leftText.value, 'json')
  const rightResult = normalizeDiffInput(rightText.value, 'json')
  leftText.value = leftResult.text
  rightText.value = rightResult.text
  runDiff()
}

function applyDirection(): void {
  const applied = applyDiffDirection(leftText.value, rightText.value, direction.value)
  leftText.value = applied.leftText
  rightText.value = applied.rightText
  runDiff()
}

function clearPanel(): void {
  leftText.value = ''
  rightText.value = ''
  rows.value = []
  extra.value = ''
  leftError.value = ''
  rightError.value = ''
  emitSnapshot()
}

function lineClass(row: DiffRow): string {
  return `diff-row diff-row--${row.type}`
}

/**
 * 这里直接返回结构化片段，让模板按 class 渲染。
 * 这样可以保留行内高亮，又不需要使用 `v-html`。
 */
function renderSegments(segments: DiffSegment[]): Array<{
  key: string
  className: string
  text: string
}> {
  return segments.map((segment, index) => ({
    key: `${segment.type}-${index}-${segment.text.length}`,
    className:
      segment.type === 'insert'
        ? 'diff-inline diff-inline--insert'
        : segment.type === 'delete'
          ? 'diff-inline diff-inline--delete'
          : 'diff-inline',
    text: segment.text
  }))
}

function buildRowSegments(
  row: DiffRow,
  side: 'left' | 'right'
): Array<{
  key: string
  className: string
  text: string
}> {
  const value = side === 'left' ? row.left : row.right
  if (value === null) return []
  if (row.type !== 'change') {
    return [{ key: 'plain', className: 'diff-inline', text: value }]
  }

  const inline = buildInlineDiffSegments(row.left ?? '', row.right ?? '')
  return side === 'left'
    ? renderSegments(inline.leftSegments)
    : renderSegments(inline.rightSegments)
}
</script>

<template>
  <section class="tool-panel-shell">
    <div class="tool-panel-header">
      <div>
        <p class="eyebrow">advanced panel</p>
        <h3>文本对比</h3>
      </div>
      <NTag size="small" :bordered="false">{{ mode.toUpperCase() }}</NTag>
    </div>

    <p class="muted">
      这块沿用旧项目的“按行对比 + 行内细粒度高亮”路线。JSON
      模式下会先尝试格式化，再输出差异摘要、方向应用和错误提示。
    </p>

    <div class="tool-panel-actions tool-panel-actions--wrap">
      <NSelect v-model:value="mode" :options="modeOptions" class="tool-inline-select" />
      <NCheckbox v-model:checked="wrap">自动换行</NCheckbox>
      <NRadioGroup v-model:value="direction">
        <NRadioButton value="ltr">左→右</NRadioButton>
        <NRadioButton value="rtl">右→左</NRadioButton>
      </NRadioGroup>
      <NButton secondary @click="formatJsonText">JSON 格式化</NButton>
      <NButton secondary @click="applyDirection">{{ applyLabel }}</NButton>
      <NButton tertiary @click="clearPanel">清空</NButton>
    </div>

    <div class="tool-panel-grid">
      <section>
        <NInput
          v-model:value="leftText"
          type="textarea"
          :autosize="{ minRows: 6, maxRows: 12 }"
          placeholder="左侧输入..."
        />
        <p v-if="leftError" class="tool-error-text">{{ leftError }}</p>
      </section>
      <section>
        <NInput
          v-model:value="rightText"
          type="textarea"
          :autosize="{ minRows: 6, maxRows: 12 }"
          placeholder="右侧输入..."
        />
        <p v-if="rightError" class="tool-error-text">{{ rightError }}</p>
      </section>
    </div>

    <div class="tool-panel-actions">
      <NButton type="primary" @click="runDiff">执行对比</NButton>
    </div>

    <div class="diff-view" :class="{ 'diff-view--wrap': wrap }">
      <div class="diff-head">
        <div class="diff-cell diff-cell--ln">L</div>
        <div class="diff-cell">左侧</div>
        <div class="diff-cell diff-cell--ln">R</div>
        <div class="diff-cell">右侧</div>
      </div>

      <div v-if="rows.length === 0" class="tool-preview-placeholder">
        执行对比后，这里显示按行差异。
      </div>

      <div
        v-for="row in rows"
        :key="`${row.leftNo}-${row.rightNo}-${row.type}`"
        :class="lineClass(row)"
      >
        <div class="diff-cell diff-cell--ln">{{ row.leftNo ?? '' }}</div>
        <div class="diff-cell diff-cell--text" :class="{ 'diff-cell--empty': row.left === null }">
          <template v-for="segment in buildRowSegments(row, 'left')" :key="segment.key">
            <span :class="segment.className">{{ segment.text }}</span>
          </template>
        </div>
        <div class="diff-cell diff-cell--ln">{{ row.rightNo ?? '' }}</div>
        <div class="diff-cell diff-cell--text" :class="{ 'diff-cell--empty': row.right === null }">
          <template v-for="segment in buildRowSegments(row, 'right')" :key="segment.key">
            <span :class="segment.className">{{ segment.text }}</span>
          </template>
        </div>
      </div>
    </div>

    <pre class="stream-output">{{ extra || '这里显示模式、方向、换行状态和差异摘要。' }}</pre>
  </section>
</template>

<style scoped>
.tool-error-text {
  margin: 8px 0 0;
  color: #dc2626;
  font-size: 13px;
}

.diff-view {
  border: 1px solid var(--line);
  border-radius: 24px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.45);
}

.diff-view--wrap .diff-cell--text {
  white-space: pre-wrap;
  word-break: break-word;
}

.diff-head,
.diff-row {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) 56px minmax(0, 1fr);
}

.diff-head {
  background: rgba(15, 23, 42, 0.08);
  font-weight: 600;
}

.diff-row + .diff-row {
  border-top: 1px solid rgba(15, 23, 42, 0.08);
}

.diff-cell {
  padding: 10px 12px;
}

.diff-cell--ln {
  text-align: center;
  color: var(--muted);
  border-right: 1px solid rgba(15, 23, 42, 0.08);
}

.diff-cell--text {
  white-space: pre;
  overflow-x: auto;
}

.diff-cell--empty {
  background: rgba(15, 23, 42, 0.04);
}

.diff-row--insert {
  background: rgba(16, 185, 129, 0.08);
}

.diff-row--delete {
  background: rgba(239, 68, 68, 0.08);
}

.diff-row--change {
  background: rgba(245, 158, 11, 0.08);
}

.diff-inline--insert {
  background: rgba(16, 185, 129, 0.18);
}

.diff-inline--delete {
  background: rgba(239, 68, 68, 0.18);
}
</style>
