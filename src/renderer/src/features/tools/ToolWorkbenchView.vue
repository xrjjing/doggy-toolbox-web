<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, watch, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  NButton,
  NCard,
  NIcon,
  NInput,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSpace,
  NStatistic,
  NTag,
  useMessage
} from 'naive-ui'
import {
  CodeSlashOutline,
  CubeOutline,
  GlobeOutline,
  KeyOutline,
  TimeOutline
} from '@vicons/ionicons5'
import { useAiSettingsStore } from '@renderer/stores/ai-settings'
import { useAiStore } from '@renderer/stores/ai'
import { toolCatalog, toolCategories } from './catalog'
import { buildToolAiAssistPrompt } from './tool-ai-assist'
import type { ToolCategoryKey, ToolKind, ToolPanelSnapshot } from './types'
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
import {
  addLineNumbers,
  deduplicate,
  removeEmptyLines,
  reverseLines,
  sortLines
} from './utils/core-text'
import { convertToAllRadix, urlDecode, urlEncode } from './utils/core-url-radix'
import { detectFormat, smartDecode, unicodeEscape } from './utils/core-unicode'
import {
  addDateDays,
  convertBase64Hex,
  convertColor,
  csvToJson,
  decodeHtmlEntity,
  decodeJwt,
  describeCron,
  diffDateDays,
  encodeHtmlEntity,
  extractSqlTables,
  formatSql,
  generatePassword,
  getCharCountStats,
  hmacHexUtf8,
  inferJsonSchema,
  inspectIpv4,
  inspectUserAgent,
  jsonToCsv,
  markdownToHtml,
  maskSensitiveText,
  minifySql,
  parseKeyValueLines,
  parseToml,
  queryJsonPath,
  runRegex,
  signJwtHs256,
  titleCaseText,
  toKeyValueLines
} from './utils/core-legacy'

const QrCodeToolPanel = defineAsyncComponent(() => import('./panels/QrCodeToolPanel.vue'))
const ImageBase64ToolPanel = defineAsyncComponent(() => import('./panels/ImageBase64ToolPanel.vue'))
const MockToolPanel = defineAsyncComponent(() => import('./panels/MockToolPanel.vue'))
const DiffToolPanel = defineAsyncComponent(() => import('./panels/DiffToolPanel.vue'))
const CryptoToolPanel = defineAsyncComponent(() => import('./panels/CryptoToolPanel.vue'))
const RsaToolPanel = defineAsyncComponent(() => import('./panels/RsaToolPanel.vue'))
const WebSocketToolPanel = defineAsyncComponent(() => import('./panels/WebSocketToolPanel.vue'))
const GitCommandGeneratorToolPanel = defineAsyncComponent(
  () => import('./panels/GitCommandGeneratorToolPanel.vue')
)
const DockerCommandGeneratorToolPanel = defineAsyncComponent(
  () => import('./panels/DockerCommandGeneratorToolPanel.vue')
)
const DockerServiceCommandGeneratorToolPanel = defineAsyncComponent(
  () => import('./panels/DockerServiceCommandGeneratorToolPanel.vue')
)
const DockerSwarmCommandGeneratorToolPanel = defineAsyncComponent(
  () => import('./panels/DockerSwarmCommandGeneratorToolPanel.vue')
)
const NginxConfigGeneratorToolPanel = defineAsyncComponent(
  () => import('./panels/NginxConfigGeneratorToolPanel.vue')
)

const message = useMessage()
const route = useRoute()
const aiSettingsStore = useAiSettingsStore()
const aiStore = useAiStore()
const activeTool = ref<ToolKind>('base64')
const activeCategory = ref<ToolCategoryKey>('encoding-format')
const input = ref('')
const output = ref('')
const extra = ref('')
const hashAlgorithm = ref<'md5' | 'sha256'>('md5')
const aiProvider = ref<AiProviderKind>('codex')
const draggingCategory = ref<ToolCategoryKey | null>(null)
const advancedPanelTools = new Set<ToolKind>([
  'qrcode',
  'img-base64',
  'rsa',
  'websocket',
  'mock',
  'diff',
  'crypto',
  'git',
  'docker',
  'docker-service',
  'docker-swarm',
  'nginx'
])
const panelSnapshot = ref<ToolPanelSnapshot>({
  input: '',
  output: '',
  extra: ''
})

const activeDefinition = computed(() => toolCatalog.find((tool) => tool.key === activeTool.value)!)
const categoryIcons = {
  'encoding-format': CodeSlashOutline,
  'security-crypto': KeyOutline,
  'text-content': CubeOutline,
  'network-protocol': GlobeOutline,
  'time-data-devops': TimeOutline
} satisfies Record<ToolCategoryKey, typeof CodeSlashOutline>
const groupedTools = computed(() =>
  toolCategories.map((category) => ({
    ...category,
    tools: toolCatalog.filter((tool) => tool.category === category.key)
  }))
)
const activeCategoryMeta = computed(
  () => groupedTools.value.find((group) => group.key === activeCategory.value) ?? groupedTools.value[0]
)
const activeCategoryTools = computed(() => activeCategoryMeta.value?.tools ?? [])
const aiProviderLabel = computed(() =>
  aiProvider.value === 'codex' ? 'Codex SDK' : 'Claude Code SDK'
)
const usesAdvancedPanel = computed(() => advancedPanelTools.has(activeTool.value))
const aiInput = computed(() => (usesAdvancedPanel.value ? panelSnapshot.value.input : input.value))
const aiOutput = computed(() =>
  usesAdvancedPanel.value ? panelSnapshot.value.output : output.value
)
const aiExtra = computed(() => (usesAdvancedPanel.value ? panelSnapshot.value.extra : extra.value))

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

function updatePanelSnapshot(snapshot: ToolPanelSnapshot): void {
  panelSnapshot.value = snapshot
}

function selectTool(tool: ToolKind): void {
  activeTool.value = tool
}

function handleCategoryDragStart(category: ToolCategoryKey): void {
  draggingCategory.value = category
}

function handleCategoryDrop(targetCategory: ToolCategoryKey): void {
  if (!draggingCategory.value || draggingCategory.value === targetCategory) return
  const sourceIndex = toolCategories.findIndex((item) => item.key === draggingCategory.value)
  const targetIndex = toolCategories.findIndex((item) => item.key === targetCategory)
  if (sourceIndex < 0 || targetIndex < 0) return
  const [source] = toolCategories.splice(sourceIndex, 1)
  toolCategories.splice(targetIndex, 0, source)
  draggingCategory.value = null
}

/**
 * 全局搜索会通过 `/tools?tool=xxx` 直达具体工具。
 * 这里把路由参数同步成 activeTool，避免旧项目“搜索结果跳页面”的体验在 Vue 版里丢失。
 */
function syncToolFromRoute(): void {
  const target = route.query.tool
  const tool = typeof target === 'string' ? target : ''
  if (toolCatalog.some((item) => item.key === tool)) {
    activeTool.value = tool as ToolKind
    activeCategory.value =
      toolCatalog.find((item) => item.key === tool)?.category ?? activeCategory.value
  }
}

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
      case 'jwt': {
        const [token, secret] = input.value.split(/\r?\n---\r?\n/)
        const decoded = decodeJwt(token)
        output.value = JSON.stringify(decoded, null, 2)
        extra.value = secret?.trim()
          ? await signJwtHs256(JSON.stringify(decoded.payload), secret.trim())
          : ''
        break
      }
      case 'hmac': {
        const [secret, ...messageParts] = input.value.split(/\r?\n---\r?\n/)
        output.value = await hmacHexUtf8(secret.trim(), messageParts.join('\n---\n'), 'SHA-256')
        extra.value = '输入格式：第一段 secret，分隔线 ---，第二段 message'
        break
      }
      case 'html-entity':
        output.value = encodeHtmlEntity(input.value)
        extra.value = decodeHtmlEntity(output.value)
        break
      case 'charcount':
        output.value = JSON.stringify(getCharCountStats(input.value), null, 2)
        break
      case 'text-sort':
        output.value = sortLines(input.value, 'asc', false)
        extra.value = [
          '反转:',
          reverseLines(input.value),
          '',
          '加行号:',
          addLineNumbers(input.value, 1),
          '',
          '标题化:',
          titleCaseText(input.value)
        ].join('\n')
        break
      case 'mask':
        output.value = maskSensitiveText(input.value)
        extra.value =
          '如果输入是 JSON，可在第一行写 JSON 内容并使用默认字段 phone,idcard,email,name,password,token 脱敏。'
        break
      case 'regex': {
        const [patternAndFlags, ...textParts] = input.value.split(/\r?\n---\r?\n/)
        const match = patternAndFlags.match(/^\/(.+)\/([a-z]*)$/i)
        const result = runRegex(
          match ? match[1] : patternAndFlags,
          match?.[2] ?? 'g',
          textParts.join('\n---\n')
        )
        output.value = JSON.stringify(result.matches, null, 2)
        extra.value = result.summary
        break
      }
      case 'sql':
        output.value = formatSql(input.value)
        extra.value = [
          `压缩: ${minifySql(input.value)}`,
          `表名: ${extractSqlTables(input.value).join(', ')}`
        ].join('\n')
        break
      case 'csv':
        if (input.value.trim().startsWith('[') || input.value.trim().startsWith('{')) {
          output.value = jsonToCsv(input.value)
        } else {
          output.value = JSON.stringify(csvToJson(input.value), null, 2)
        }
        break
      case 'markdown':
        output.value = markdownToHtml(input.value)
        break
      case 'color':
        output.value = JSON.stringify(convertColor(input.value), null, 2)
        break
      case 'cron':
        output.value = describeCron(input.value)
        break
      case 'password':
        output.value = generatePassword(Number(input.value) || 20)
        break
      case 'json-schema':
        output.value = JSON.stringify(inferJsonSchema(input.value), null, 2)
        break
      case 'jsonpath': {
        const [jsonText, expression = '$'] = input.value.split(/\r?\n---\r?\n/)
        output.value = JSON.stringify(queryJsonPath(jsonText, expression), null, 2)
        extra.value = '输入格式：JSON 文本，分隔线 ---，JSONPath 表达式'
        break
      }
      case 'toml':
        output.value = JSON.stringify(parseToml(input.value), null, 2)
        break
      case 'ua':
        output.value = JSON.stringify(inspectUserAgent(input.value), null, 2)
        break
      case 'ip':
        output.value = JSON.stringify(inspectIpv4(input.value), null, 2)
        break
      case 'b64hex':
        output.value = JSON.stringify(convertBase64Hex(input.value), null, 2)
        break
      case 'datecalc': {
        const [left, right = '0'] = input.value.split(/\r?\n/)
        const numericDays = Number(right)
        if (Number.isFinite(numericDays)) {
          output.value = addDateDays(left, numericDays)
        } else {
          output.value = `${diffDateDays(left, right)} 天`
        }
        break
      }
      case 'data-convert':
        if (input.value.trim().startsWith('{')) {
          output.value = toKeyValueLines(input.value)
        } else {
          output.value = JSON.stringify(parseKeyValueLines(input.value), null, 2)
        }
        break
      case 'qrcode':
      case 'img-base64':
      case 'rsa':
      case 'websocket':
      case 'mock':
      case 'diff':
      case 'crypto':
      case 'git':
      case 'docker':
      case 'docker-service':
      case 'docker-swarm':
      case 'nginx':
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
    naming: 'doggy toolbox web',
    jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkb2dneSIsImV4cCI6NDExNzYwOTYwMH0.signature',
    hmac: 'secret\n---\ndoggy-toolbox-web',
    'html-entity': '<div title="dog">狗狗 & toolbox</div>',
    charcount: 'hello 狗狗\n123',
    'text-sort': 'banana\nApple\ncat',
    mask: '手机号 13812345678，邮箱 doggy@example.com，身份证 110101199001011234',
    regex: '/\\d+/g\n---\n订单 123，金额 456',
    sql: 'select id,name from users where status = 1 order by created_at desc',
    csv: 'name,age\nAlice,18\nBob,20',
    markdown: '# 标题\n\n- dog\n- toolbox\n\n**bold** and `code`',
    color: '#D97706',
    cron: '*/5 9-18 * * 1-5',
    password: '20',
    'json-schema': '{"name":"Alice","age":18,"tags":["dev"]}',
    jsonpath: '{"user":{"name":"dog","tags":["a","b"]}}\n---\n$.user.tags[0]',
    toml: 'title = "Doggy"\n[owner]\nname = "xrj"\nage = 18',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36',
    ip: '192.168.1.10/24',
    b64hex: 'aGVsbG8=',
    datecalc: '2026-04-23\n7',
    'data-convert': '{"name":"doggy","age":1}',
    qrcode: '',
    'img-base64': '',
    rsa: '',
    websocket: '',
    mock: '',
    diff: '',
    crypto: '',
    git: '',
    docker: '',
    'docker-service': '',
    'docker-swarm': '',
    nginx: ''
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
  if (!aiInput.value.trim() && !aiOutput.value.trim() && !aiExtra.value.trim()) {
    message.warning('请先输入内容或运行一次工具，再让 AI 分析')
    return
  }

  const prompt = buildToolAiAssistPrompt({
    toolTitle: activeDefinition.value.title,
    toolDescription: activeDefinition.value.description,
    input: aiInput.value,
    output: aiOutput.value,
    extra: aiExtra.value
  })

  try {
    await aiStore.startChat({
      moduleId: 'tools',
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

watch(() => route.query.tool, syncToolFromRoute, { immediate: true })
watch(activeCategory, (category) => {
  if (!activeCategoryTools.value.some((tool) => tool.key === activeTool.value)) {
    activeTool.value =
      groupedTools.value.find((group) => group.key === category)?.tools[0]?.key ?? activeTool.value
  }
})
</script>

<template>
  <div class="tool-workbench-shell">
    <NCard class="soft-card workbench-categories" :bordered="false">
      <template #header>
        <div class="card-title-row">
          <div>
            <p class="eyebrow">tool rails</p>
            <strong>工具分类</strong>
          </div>
          <NTag size="small" :bordered="false">{{ groupedTools.length }} 组</NTag>
        </div>
      </template>
      <div class="tool-category-list">
        <button
          v-for="group in groupedTools"
          :key="group.key"
          class="tool-category-tab"
          :class="{ active: group.key === activeCategory }"
          :data-dragging="draggingCategory === group.key ? 'true' : 'false'"
          draggable="true"
          type="button"
          @dragstart="handleCategoryDragStart(group.key)"
          @dragover.prevent
          @dragend="draggingCategory = null"
          @drop.prevent="handleCategoryDrop(group.key)"
          @click="activeCategory = group.key"
        >
          <div class="tool-category-icon">
            <NIcon :component="categoryIcons[group.key]" />
          </div>
          <div>
            <strong>{{ group.label }}</strong>
            <p>{{ group.tools.length }} 个工具</p>
          </div>
        </button>
      </div>
    </NCard>

    <div class="tool-workbench-main">
      <NCard class="soft-card workbench-main" :bordered="false">
        <template #header>
          <div class="tool-workbench-header">
            <div class="tool-workbench-title">
              <strong>{{ activeDefinition.title }}</strong>
              <p>{{ activeCategoryMeta.label }} · {{ activeCategoryMeta.description }}</p>
            </div>
            <div class="workbench-header-actions">
              <NTag size="small" :bordered="false">{{ activeCategoryTools.length }} 个工具</NTag>
            </div>
          </div>
        </template>

        <NSpace vertical size="large">
          <section class="tool-current-overview">
            <div class="tool-current-copy">
              <p class="eyebrow">available modules</p>
              <strong>{{ activeDefinition.title }}</strong>
              <p>{{ activeDefinition.description }}</p>
            </div>
            <div class="tool-current-meta">
              <NTag size="small" :bordered="false">{{ activeCategoryMeta.label }}</NTag>
              <NTag size="small" :bordered="false">{{ activeDefinition.accent }}</NTag>
            </div>
          </section>

          <section class="tool-grid-rail">
            <button
              v-for="tool in activeCategoryTools"
              :key="tool.key"
              class="tool-grid-card"
              :class="{ active: tool.key === activeTool }"
              type="button"
              @click="selectTool(tool.key)"
            >
              <div class="tool-icon-box">{{ tool.title.slice(0, 1) }}</div>
              <div class="tool-grid-copy">
                <strong>{{ tool.title }}</strong>
                <p>{{ tool.description }}</p>
              </div>
            </button>
          </section>

          <NSelect
            v-if="activeTool === 'hash'"
            v-model:value="hashAlgorithm"
            :options="[
              { label: 'MD5', value: 'md5' },
              { label: 'SHA-256', value: 'sha256' }
            ]"
          />

          <template v-if="!usesAdvancedPanel">
            <section class="tool-workbench-stage">
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
            </section>
          </template>

          <QrCodeToolPanel v-else-if="activeTool === 'qrcode'" @snapshot="updatePanelSnapshot" />
          <ImageBase64ToolPanel
            v-else-if="activeTool === 'img-base64'"
            @snapshot="updatePanelSnapshot"
          />
          <MockToolPanel v-else-if="activeTool === 'mock'" @snapshot="updatePanelSnapshot" />
          <DiffToolPanel v-else-if="activeTool === 'diff'" @snapshot="updatePanelSnapshot" />
          <CryptoToolPanel v-else-if="activeTool === 'crypto'" @snapshot="updatePanelSnapshot" />
          <RsaToolPanel v-else-if="activeTool === 'rsa'" @snapshot="updatePanelSnapshot" />
          <WebSocketToolPanel
            v-else-if="activeTool === 'websocket'"
            @snapshot="updatePanelSnapshot"
          />
          <GitCommandGeneratorToolPanel
            v-else-if="activeTool === 'git'"
            @snapshot="updatePanelSnapshot"
          />
          <DockerCommandGeneratorToolPanel
            v-else-if="activeTool === 'docker'"
            @snapshot="updatePanelSnapshot"
          />
          <DockerServiceCommandGeneratorToolPanel
            v-else-if="activeTool === 'docker-service'"
            @snapshot="updatePanelSnapshot"
          />
          <DockerSwarmCommandGeneratorToolPanel
            v-else-if="activeTool === 'docker-swarm'"
            @snapshot="updatePanelSnapshot"
          />
          <NginxConfigGeneratorToolPanel
            v-else-if="activeTool === 'nginx'"
            @snapshot="updatePanelSnapshot"
          />

        </NSpace>
      </NCard>

      <NCard class="soft-card tool-ai-assist-card" :bordered="false">
        <template #header>
          <div class="card-title-row">
            <div>
              <p class="eyebrow">local ai assist</p>
              <h3>AI 结果复核</h3>
            </div>
            <NTag size="small" :bordered="false">AI Chat</NTag>
          </div>
        </template>

        <section class="tool-ai-assist">
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
              <NButton
                type="primary"
                :loading="aiStore.running"
                :disabled="!aiSettingsStore.isFeatureEnabled('tools')"
                @click="startAiAssist"
              >
                让 {{ aiProviderLabel }} 分析
              </NButton>
              <NButton secondary :disabled="!aiStore.running" @click="cancelAiAssist">
                取消
              </NButton>
            </div>
          </div>

          <div v-if="aiStore.activeSession" class="ai-runtime-grid tool-ai-runtime-grid">
            <NStatistic label="提供方" :value="aiStore.activeSession.provider" />
            <NStatistic label="阶段" :value="aiPhaseLabel" />
            <NStatistic label="模型" :value="aiStore.runtime?.model || '跟随本机配置'" />
            <NStatistic label="输出 Tokens" :value="aiStore.usage?.outputTokens ?? 0" />
          </div>

          <pre class="stream-output tool-ai-output">{{
            aiStore.output || '等待 AI 分析。会话会同步保存到 AI Chat 页面。'
          }}</pre>
        </section>
      </NCard>
    </div>
  </div>
</template>
