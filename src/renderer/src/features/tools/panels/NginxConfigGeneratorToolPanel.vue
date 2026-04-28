<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  NButton,
  NInput,
  NInputNumber,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NTag,
  useMessage
} from 'naive-ui'
import type { ToolPanelSnapshot } from '../types'
import {
  NGINX_TEMPLATE_FIELDS,
  generateNginxConfig,
  validateNginxConfig,
  type NginxGeneratedResult,
  type NginxTemplateKey
} from '../utils/core-command-generators'

/**
 * Nginx 面板不是命令，而是配置片段生成器。
 * 旧项目的关键特征是“模板切换后动态表单变化”，这里保留同样的数据驱动体验。
 */
const emit = defineEmits<{
  snapshot: [snapshot: ToolPanelSnapshot]
}>()

const message = useMessage()
const template = ref<NginxTemplateKey>('reverseProxy')
const serverName = ref('example.com')
const listenPort = ref<number | null>(80)
const dynamicValues = reactive<Record<string, string>>({
  proxyPass: 'http://127.0.0.1:8080',
  proxyTimeout: '60',
  websocket: 'false',
  rootPath: '/var/www/html',
  indexFile: 'index.html',
  gzip: 'true',
  cacheControl: 'true',
  sslCert: '/etc/nginx/ssl/cert.pem',
  sslKey: '/etc/nginx/ssl/key.pem',
  hsts: 'true',
  upstreamName: 'backend',
  servers: '127.0.0.1:8001,127.0.0.1:8002',
  algorithm: '',
  zoneName: 'api_limit',
  rateLimit: '10',
  burstLimit: '20',
  allowOrigin: '*',
  allowMethods: 'GET, POST, PUT, DELETE, OPTIONS',
  maxBodySize: '100',
  uploadPath: '/upload'
})

const configOutput = ref('')
const statusOutput = ref('切换模板并填写参数后，这里会生成对应的 Nginx 配置片段')
const warningOutput = ref('无额外提醒')
const errorOutput = ref('')

const templateOptions = [
  { label: '反向代理', value: 'reverseProxy' },
  { label: '静态站点', value: 'staticSite' },
  { label: 'SPA 单页应用', value: 'spa' },
  { label: 'SSL / HTTPS', value: 'ssl' },
  { label: '负载均衡', value: 'loadBalance' },
  { label: '限流配置', value: 'rateLimit' },
  { label: 'CORS 跨域', value: 'cors' },
  { label: '文件上传', value: 'fileUpload' }
] satisfies Array<{ label: string; value: NginxTemplateKey }>

const currentFields = computed(() => NGINX_TEMPLATE_FIELDS[template.value])

const templateSummary = computed(() => {
  switch (template.value) {
    case 'reverseProxy':
      return '适合把外部流量代理到 Spring Boot、Node、Go API 等后端服务。'
    case 'staticSite':
      return '用于纯静态资源托管，支持 gzip 和缓存开关。'
    case 'spa':
      return '适合 Vue/React 路由前端，自动回退到 index.html。'
    case 'ssl':
      return '同时生成 HTTP -> HTTPS 重定向和 SSL server 配置。'
    case 'loadBalance':
      return '生成 upstream + server 双段配置。'
    case 'rateLimit':
      return '包含 limit_req_zone 和 API 入口限流片段。'
    case 'cors':
      return '补齐常见 CORS 头和 OPTIONS 预检处理。'
    case 'fileUpload':
      return '覆盖大文件上传尺寸和上传路由代理超时。'
    default:
      return '请选择 Nginx 模板。'
  }
})

function emitSnapshot(): void {
  emit('snapshot', {
    input: JSON.stringify(
      {
        template: template.value,
        serverName: serverName.value,
        listenPort: listenPort.value,
        options: currentFields.value.reduce<Record<string, string>>((acc, field) => {
          acc[field.key] = dynamicValues[field.key] || ''
          return acc
        }, {})
      },
      null,
      2
    ),
    output: configOutput.value,
    extra: [statusOutput.value, warningOutput.value, errorOutput.value].filter(Boolean).join('\n\n')
  })
}

function applyResult(result: NginxGeneratedResult): void {
  configOutput.value = result.config
  statusOutput.value = result.summary
  warningOutput.value =
    [...result.warnings, ...validateNginxConfig(result.config)].join('\n') || '无额外提醒'
  errorOutput.value = result.error || ''
}

function refreshPreview(): void {
  const result = generateNginxConfig(template.value, {
    serverName: serverName.value,
    listenPort: String(listenPort.value ?? ''),
    ...Object.fromEntries(
      currentFields.value.map((field) => [field.key, dynamicValues[field.key] || ''])
    )
  })
  applyResult(result)
  emitSnapshot()
}

function updateDynamicValue(key: string, value: string | boolean | number | null): void {
  if (typeof value === 'boolean') {
    dynamicValues[key] = value ? 'true' : 'false'
  } else if (value === null) {
    dynamicValues[key] = ''
  } else {
    dynamicValues[key] = String(value)
  }
}

async function copyConfig(): Promise<void> {
  if (!configOutput.value) return
  try {
    await navigator.clipboard.writeText(configOutput.value)
    message.success('Nginx 配置已复制')
  } catch {
    message.error('当前环境无法直接写入剪贴板')
  }
}

watch([template, serverName, listenPort, () => JSON.stringify(dynamicValues)], refreshPreview, {
  immediate: true
})
</script>

<template>
  <section class="tool-panel-shell">
    <div class="tool-panel-header">
      <div>
        <p class="eyebrow">高级面板</p>
        <h3>Nginx 配置生成器</h3>
      </div>
      <NTag size="small" :bordered="false">{{ template }}</NTag>
    </div>

    <p class="muted">
      这块按旧项目思路保留“模板驱动动态字段”，用于快速生成常见 Nginx 配置片段，并附带基础校验提醒。
    </p>

    <div class="tool-panel-actions tool-panel-actions--wrap">
      <NRadioGroup v-model:value="template">
        <NRadioButton v-for="item in templateOptions" :key="item.value" :value="item.value">
          {{ item.label }}
        </NRadioButton>
      </NRadioGroup>
      <NButton secondary :disabled="!configOutput" @click="copyConfig">复制配置</NButton>
    </div>

    <div class="tool-command-hero">
      <div>
        <p class="eyebrow">template note</p>
        <strong>{{ templateSummary }}</strong>
      </div>
    </div>

    <div class="tool-panel-grid">
      <div class="tool-form-stack">
        <NInput v-model:value="serverName" placeholder="example.com" />
        <NInputNumber v-model:value="listenPort" clearable placeholder="80" />
      </div>
      <div class="tool-form-stack">
        <template v-for="field in currentFields" :key="field.key">
          <NInput
            v-if="field.type === 'text'"
            :value="dynamicValues[field.key]"
            :placeholder="field.placeholder"
            @update:value="updateDynamicValue(field.key, $event)"
          />
          <NInputNumber
            v-else-if="field.type === 'number'"
            :value="dynamicValues[field.key] ? Number(dynamicValues[field.key]) : null"
            clearable
            :placeholder="field.placeholder"
            @update:value="updateDynamicValue(field.key, $event)"
          />
          <NCheckbox
            v-else-if="field.type === 'checkbox'"
            :checked="dynamicValues[field.key] === 'true'"
            @update:checked="updateDynamicValue(field.key, $event)"
          >
            {{ field.label }}
          </NCheckbox>
          <NSelect
            v-else
            :value="dynamicValues[field.key]"
            :options="field.options || []"
            @update:value="updateDynamicValue(field.key, $event ?? '')"
          />
          <p v-if="field.helper" class="muted tool-field-helper">{{ field.helper }}</p>
        </template>
      </div>
    </div>

    <div class="tool-output-grid">
      <section>
        <p class="eyebrow">config</p>
        <pre class="stream-output">{{ configOutput || '等待配置生成...' }}</pre>
      </section>
      <section>
        <p class="eyebrow">details</p>
        <pre class="stream-output">{{
          [statusOutput, warningOutput, errorOutput].filter(Boolean).join('\n\n')
        }}</pre>
      </section>
    </div>
  </section>
</template>
