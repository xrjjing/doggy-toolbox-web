<script setup lang="ts">
import { computed, ref } from 'vue'
import { NButton, NInputNumber, NSelect, NSpace, NTag, useMessage } from 'naive-ui'
import type { ToolPanelSnapshot } from '../types'
import {
  buildMockData,
  clampMockCount,
  type MockDataType,
  type MockOutputFormat
} from '../utils/core-mock'

const emit = defineEmits<{
  snapshot: [snapshot: ToolPanelSnapshot]
}>()

const message = useMessage()
const type = ref<MockDataType>('name')
const count = ref(10)
const format = ref<MockOutputFormat>('lines')
const output = ref('')
const extra = ref('')

const typeOptions = [
  { label: '中文姓名', value: 'name' },
  { label: '邮箱', value: 'email' },
  { label: '手机号', value: 'phone' },
  { label: '身份证号', value: 'idcard' },
  { label: '地址', value: 'address' },
  { label: 'UUID', value: 'uuid' },
  { label: '日期', value: 'date' }
]

const formatOptions = [
  { label: '纯文本（每行一个）', value: 'lines' },
  { label: 'JSON 数组', value: 'json' },
  { label: 'CSV', value: 'csv' },
  { label: 'JSON Lines', value: 'jsonlines' }
]

/**
 * 这块单独算一份“已归一化数量”，是为了把 UI 输入态和真实执行态分开：
 * - 输入框里允许用户先敲任意数字；
 * - 真正运行时仍然会把数量收敛到旧项目约定的 1..1000。
 */
const normalizedCount = computed(() => clampMockCount(Number(count.value ?? 10)))

function emitSnapshot(): void {
  emit('snapshot', {
    input: [`类型: ${type.value}`, `数量: ${normalizedCount.value}`, `格式: ${format.value}`].join(
      '\n'
    ),
    output: output.value,
    extra: extra.value
  })
}

function runMock(): void {
  try {
    const result = buildMockData(type.value, normalizedCount.value, format.value)
    output.value = result.output
    extra.value = result.summary
    emitSnapshot()
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

function fillExample(): void {
  type.value = 'email'
  count.value = 5
  format.value = 'jsonlines'
  runMock()
}

function clearPanel(): void {
  output.value = ''
  extra.value = ''
  count.value = 10
  type.value = 'name'
  format.value = 'lines'
  emitSnapshot()
}

async function copyOutput(): Promise<void> {
  if (!output.value) return
  try {
    await navigator.clipboard.writeText(output.value)
    message.success('Mock 输出已复制')
  } catch {
    message.error('当前环境无法直接写入剪贴板')
  }
}
</script>

<template>
  <section class="tool-panel-shell">
    <div class="tool-panel-header">
      <div>
        <p class="eyebrow">高级面板</p>
        <h3>Mock 数据生成</h3>
      </div>
      <NTag size="small" :bordered="false">faker-lite</NTag>
    </div>

    <p class="muted">
      这块承接旧项目的轻量 Mock 能力，保留“数据类型 + 数量 +
      输出格式”三件最常用的控制项，输出行为尽量和原工具一致。
    </p>

    <div class="tool-panel-grid">
      <NSelect v-model:value="type" :options="typeOptions" />
      <NSelect v-model:value="format" :options="formatOptions" />
    </div>

    <div class="tool-panel-actions tool-panel-actions--wrap">
      <NInputNumber
        v-model:value="count"
        :min="1"
        :max="1000"
        :step="1"
        placeholder="生成数量"
        class="tool-inline-number"
      />
      <NButton type="primary" @click="runMock">生成</NButton>
      <NButton secondary @click="fillExample">填充示例</NButton>
      <NButton tertiary @click="clearPanel">清空</NButton>
    </div>

    <div class="chip-list">
      <span class="chip">实际数量：{{ normalizedCount }}</span>
      <span class="chip">格式：{{ format }}</span>
      <span class="chip">类型：{{ type }}</span>
    </div>

    <NSpace>
      <NButton secondary :disabled="!output" @click="copyOutput">复制输出</NButton>
    </NSpace>

    <div class="tool-output-grid">
      <section>
        <p class="eyebrow">生成结果</p>
        <pre class="stream-output">{{ output || '点击生成后，这里显示 mock 结果。' }}</pre>
      </section>
      <section>
        <p class="eyebrow">摘要信息</p>
        <pre class="stream-output">{{ extra || '这里显示类型、数量、格式和首条样例摘要。' }}</pre>
      </section>
    </div>
  </section>
</template>

<style scoped>
.tool-inline-number {
  width: 160px;
}
</style>
