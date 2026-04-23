<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import {
  NButton,
  NCard,
  NInput,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSpace,
  NStatistic,
  NTag,
  useMessage
} from 'naive-ui'
import { useAiStore } from '@renderer/stores/ai'
import { toolCatalog } from './catalog'
import { buildToolAiAssistPrompt } from './tool-ai-assist'
import type { ToolKind } from './types'
import type { AiProviderKind, AiSessionPhase } from '@shared/ipc-contract'
import {
  base64DecodeToTextUtf8,
  base64EncodeTextUtf8,
  generateUuidV4,
  toNamingFormats
} from './utils/core-basic'
import { hashHexUtf8, sha256HexUtf8Async } from './utils/core-hash'
import { formatUnixMillis, getNowValues, parseTimeInput } from './utils/core-time'
import { advancedFixJson, formatJson, sortJsonFields, validateJson } from './utils/core-json'
import { deduplicate, removeEmptyLines, sortLines } from './utils/core-text'
import { convertToAllRadix, urlDecode, urlEncode } from './utils/core-url-radix'
import { detectFormat, smartDecode, unicodeEscape } from './utils/core-unicode'

const message = useMessage()
const aiStore = useAiStore()
const activeTool = ref<ToolKind>('base64')
const input = ref('')
const output = ref('')
const extra = ref('')
const hashAlgorithm = ref<'md5' | 'sha256'>('md5')
const aiProvider = ref<AiProviderKind>('codex')

const activeDefinition = computed(() => toolCatalog.find((tool) => tool.key === activeTool.value)!)
const toolOptions = toolCatalog.map((tool) => ({ label: tool.title, value: tool.key }))
const aiProviderLabel = computed(() =>
  aiProvider.value === 'codex' ? 'Codex SDK' : 'Claude Code SDK'
)

const aiPhaseLabel = computed(() => {
  const labels: Record<AiSessionPhase, string> = {
    idle: '空闲',
    starting: '启动中',
    streaming: '流式输出',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消'
  }
  return labels[aiStore.phase]
})

async function runTool(): Promise<void> {
  try {
    extra.value = ''
    switch (activeTool.value) {
      case 'base64':
        output.value = base64EncodeTextUtf8(input.value)
        extra.value = base64DecodeToTextUtf8(output.value)
        break
      case 'url':
        output.value = urlEncode(input.value)
        extra.value = urlDecode(output.value)
        break
      case 'uuid':
        output.value = Array.from({ length: Math.max(1, Number(input.value) || 1) })
          .slice(0, 20)
          .map(() => generateUuidV4())
          .join('\n')
        break
      case 'hash':
        output.value =
          hashAlgorithm.value === 'md5'
            ? hashHexUtf8(input.value, 'md5')
            : await sha256HexUtf8Async(input.value)
        break
      case 'time': {
        const parsed = parseTimeInput(input.value, 'auto', 8 * 60 * 60 * 1000)
        if (parsed.errors.length || !parsed.unixMillis) {
          throw new Error(parsed.errors[0] || '无法解析时间')
        }
        output.value = [
          `UTC+8 秒格式: ${formatUnixMillis(parsed.unixMillis, 8 * 60 * 60 * 1000, false)}`,
          `UTC+8 毫秒格式: ${formatUnixMillis(parsed.unixMillis, 8 * 60 * 60 * 1000, true)}`,
          `当前时间: ${JSON.stringify(getNowValues(8 * 60 * 60 * 1000), null, 2)}`
        ].join('\n')
        break
      }
      case 'json': {
        const formatted = formatJson(input.value, 2)
        if (formatted.error) {
          const fixed = advancedFixJson(input.value)
          output.value = fixed.result
          extra.value = fixed.error || `修复动作: ${fixed.fixes.join(' / ') || '无'}`
        } else {
          output.value = formatted.result
          const validation = validateJson(input.value)
          const sorted = sortJsonFields(input.value, 'asc', 2)
          extra.value = [
            `校验: ${validation.valid ? '通过' : validation.error}`,
            `排序预览:\n${sorted.result}`
          ].join('\n\n')
        }
        break
      }
      case 'text':
        output.value = deduplicate(input.value, false, true)
        extra.value = [
          '升序排序:',
          sortLines(input.value, 'asc', false),
          '',
          '去空行:',
          removeEmptyLines(input.value)
        ].join('\n')
        break
      case 'unicode':
        output.value = unicodeEscape(input.value)
        extra.value = `${detectFormat(output.value)} -> ${smartDecode(output.value).result}`
        break
      case 'radix': {
        const result = convertToAllRadix(input.value, null)
        output.value = JSON.stringify(result, null, 2)
        break
      }
      case 'naming':
        output.value = JSON.stringify(toNamingFormats(input.value), null, 2)
        break
    }
  } catch (error) {
    output.value = ''
    extra.value = ''
    message.error(error instanceof Error ? error.message : String(error))
  }
}

function fillExample(): void {
  const examples: Record<ToolKind, string> = {
    base64: 'hello 狗狗百宝箱',
    url: 'https://example.com?q=狗狗 百宝箱',
    uuid: '3',
    hash: 'doggy-toolbox-web',
    time: '1713763200',
    json: "{foo:'bar', trailing: [1,2,], // comment\nbaz: true}",
    text: 'Apple\nbanana\napple\n\nDog',
    unicode: '你好🐕',
    radix: '0xff',
    naming: 'doggy toolbox web'
  }
  input.value = examples[activeTool.value]
  void runTool()
}

function clearTool(): void {
  input.value = ''
  output.value = ''
  extra.value = ''
}

async function startAiAssist(): Promise<void> {
  if (!input.value.trim() && !output.value.trim() && !extra.value.trim()) {
    message.warning('请先输入内容或运行一次工具，再让 AI 分析')
    return
  }

  const prompt = buildToolAiAssistPrompt({
    toolTitle: activeDefinition.value.title,
    toolDescription: activeDefinition.value.description,
    input: input.value,
    output: output.value,
    extra: extra.value
  })

  try {
    await aiStore.startChat({
      provider: aiProvider.value,
      title: `${activeDefinition.value.title} 工具 AI 分析`,
      prompt
    })
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

async function cancelAiAssist(): Promise<void> {
  await aiStore.cancelChat()
}

onBeforeUnmount(() => {
  aiStore.disposeStream()
})
</script>

<template>
  <section class="page-heading">
    <p class="eyebrow">phase 1</p>
    <h2>纯前端工具工作台</h2>
    <p>这里承接首批不依赖 Python 的工具算法迁移。当前先做统一工作台，后续再拆独立页面。</p>
  </section>

  <div class="tool-workbench">
    <NCard class="soft-card workbench-nav" :bordered="false">
      <template #header>首批工具</template>
      <div class="tool-nav-list">
        <button
          v-for="tool in toolCatalog"
          :key="tool.key"
          class="tool-nav-item"
          :class="{ active: tool.key === activeTool }"
          type="button"
          @click="activeTool = tool.key"
        >
          <div>
            <strong>{{ tool.title }}</strong>
            <p>{{ tool.description }}</p>
          </div>
          <NTag size="small" :bordered="false">{{ tool.accent }}</NTag>
        </button>
      </div>
    </NCard>

    <NCard class="soft-card workbench-main" :bordered="false">
      <template #header>
        <div class="card-title-row">
          <span>{{ activeDefinition.title }}</span>
          <NSelect
            v-model:value="activeTool"
            :options="toolOptions"
            size="small"
            class="tool-select"
          />
        </div>
      </template>

      <NSpace vertical size="large">
        <p class="muted">{{ activeDefinition.description }}</p>

        <NSelect
          v-if="activeTool === 'hash'"
          v-model:value="hashAlgorithm"
          :options="[
            { label: 'MD5', value: 'md5' },
            { label: 'SHA-256', value: 'sha256' }
          ]"
        />

        <NInput
          v-model:value="input"
          type="textarea"
          :autosize="{ minRows: 6, maxRows: 12 }"
          placeholder="输入内容，点击“运行工具”查看结果"
        />

        <div class="action-row">
          <NButton type="primary" @click="runTool">运行工具</NButton>
          <NButton secondary @click="fillExample">填充示例</NButton>
          <NButton tertiary @click="clearTool">清空</NButton>
        </div>

        <div class="tool-output-grid">
          <section>
            <p class="eyebrow">result</p>
            <pre class="stream-output">{{ output || '等待运行结果...' }}</pre>
          </section>
          <section>
            <p class="eyebrow">extra</p>
            <pre class="stream-output">{{ extra || '这里显示校验、预览或反向结果...' }}</pre>
          </section>
        </div>

        <section class="tool-ai-assist">
          <div class="card-title-row">
            <div>
              <p class="eyebrow">local ai assist</p>
              <h3>AI 结果复核</h3>
            </div>
            <NTag size="small" :bordered="false">本机 SDK</NTag>
          </div>

          <p class="muted">
            把当前工具名、输入、result 和 extra 组织成 prompt，交给本机 Codex / Claude Code SDK
            做结果解释、异常判断和下一步建议。
          </p>

          <div class="tool-ai-toolbar">
            <NRadioGroup v-model:value="aiProvider">
              <NRadioButton value="codex">Codex SDK</NRadioButton>
              <NRadioButton value="claude-code">Claude Code SDK</NRadioButton>
            </NRadioGroup>
            <div class="action-row">
              <NButton type="primary" :loading="aiStore.running" @click="startAiAssist">
                让 {{ aiProviderLabel }} 分析
              </NButton>
              <NButton secondary :disabled="!aiStore.running" @click="cancelAiAssist">
                取消
              </NButton>
            </div>
          </div>

          <div v-if="aiStore.activeSession" class="ai-runtime-grid">
            <NStatistic label="提供方" :value="aiStore.activeSession.provider" />
            <NStatistic label="阶段" :value="aiPhaseLabel" />
            <NStatistic label="模型" :value="aiStore.runtime?.model || '跟随本机配置'" />
            <NStatistic label="输出 Tokens" :value="aiStore.usage?.outputTokens ?? 0" />
          </div>

          <pre class="stream-output tool-ai-output">{{
            aiStore.output || '等待 AI 分析。会话会同步保存到 AI SDK Bridge 验证台。'
          }}</pre>
        </section>
      </NSpace>
    </NCard>
  </div>
</template>
