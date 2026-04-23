<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  NButton,
  NCheckbox,
  NInput,
  NInputNumber,
  NRadioButton,
  NRadioGroup,
  NTag,
  useMessage
} from 'naive-ui'
import type { ToolPanelSnapshot } from '../types'
import {
  formatWarnings,
  generateDockerServiceCreateCommand,
  generateDockerServiceLogsCommand,
  generateDockerServiceLsCommand,
  generateDockerServicePsCommand,
  generateDockerServiceRmCommand,
  generateDockerServiceScaleCommand,
  generateDockerServiceUpdateCommand,
  type CommandResult,
  type DockerServiceScene
} from '../utils/core-command-generators'

/**
 * Docker Service 场景比普通 Docker 命令更偏运维管理。
 * 这里按旧项目的 create/update/scale/logs/ps/ls/rm 七个子页拆成单一高级面板。
 */
const emit = defineEmits<{
  snapshot: [snapshot: ToolPanelSnapshot]
}>()

const message = useMessage()
const scene = ref<DockerServiceScene>('create')
const commandOutput = ref('')
const descriptionOutput = ref('切换 Docker Service 子场景后，会实时刷新命令预览')
const warningOutput = ref('无额外提醒')
const errorOutput = ref('')

const createImage = ref('')
const createName = ref('')
const createReplicas = ref<number | null>(1)
const createPublish = ref('80:80')
const createNetworks = ref('')
const createEndpointMode = ref('vip')
const createCpuLimit = ref('')
const createCpuReserve = ref('')
const createMemoryLimit = ref('')
const createMemoryReserve = ref('')
const createUpdateParallelism = ref<number | null>(1)
const createUpdateDelay = ref('10s')
const createUpdateFailureAction = ref('pause')
const createMounts = ref('')

const updateName = ref('')
const updateImage = ref('')
const updateReplicas = ref<number | null>(null)
const updatePublish = ref('')
const updateNetworks = ref('')
const updateEndpointMode = ref('')
const updateCpuLimit = ref('')
const updateCpuReserve = ref('')
const updateMemoryLimit = ref('')
const updateMemoryReserve = ref('')
const updateUpdateParallelism = ref<number | null>(null)
const updateUpdateDelay = ref('')
const updateUpdateFailureAction = ref('')
const updateMounts = ref('')

const scaleName = ref('')
const scaleReplicas = ref<number | null>(3)
const logsName = ref('')
const logsFollow = ref(true)
const logsTimestamps = ref(false)
const logsTail = ref<number | null>(100)
const psName = ref('')
const rmNames = ref('')

const sceneOptions = [
  { label: 'Create', value: 'create' },
  { label: 'Update', value: 'update' },
  { label: 'Scale', value: 'scale' },
  { label: 'Logs', value: 'logs' },
  { label: 'PS', value: 'ps' },
  { label: 'LS', value: 'ls' },
  { label: 'RM', value: 'rm' }
] satisfies Array<{ label: string; value: DockerServiceScene }>

function splitComma(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function splitSpace(value: string): string[] {
  return value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function emitSnapshot(): void {
  emit('snapshot', {
    input: [scene.value, collectSceneInput()].filter(Boolean).join('\n'),
    output: commandOutput.value,
    extra: [descriptionOutput.value, warningOutput.value, errorOutput.value]
      .filter(Boolean)
      .join('\n\n')
  })
}

function collectSceneInput(): string {
  switch (scene.value) {
    case 'create':
      return [
        createImage.value,
        createName.value,
        createPublish.value,
        createNetworks.value,
        createMounts.value
      ]
        .filter(Boolean)
        .join('\n')
    case 'update':
      return [
        updateName.value,
        updateImage.value,
        updatePublish.value,
        updateNetworks.value,
        updateMounts.value
      ]
        .filter(Boolean)
        .join('\n')
    case 'scale':
      return [scaleName.value, String(scaleReplicas.value ?? '')].filter(Boolean).join('\n')
    case 'logs':
      return [logsName.value, String(logsTail.value ?? '')].filter(Boolean).join('\n')
    case 'ps':
      return psName.value
    case 'ls':
      return 'docker service ls'
    case 'rm':
      return rmNames.value
  }
}

function applyResult(result: CommandResult): void {
  commandOutput.value = result.command
  descriptionOutput.value = result.description
  warningOutput.value = formatWarnings(result.warnings)
  errorOutput.value = ''
}

function buildCurrentResult(): CommandResult {
  switch (scene.value) {
    case 'create':
      return generateDockerServiceCreateCommand({
        image: createImage.value,
        name: createName.value,
        replicas: createReplicas.value ?? undefined,
        publish: splitComma(createPublish.value),
        networks: splitComma(createNetworks.value),
        endpointMode: createEndpointMode.value,
        cpuLimit: createCpuLimit.value,
        cpuReserve: createCpuReserve.value,
        memoryLimit: createMemoryLimit.value,
        memoryReserve: createMemoryReserve.value,
        updateParallelism: createUpdateParallelism.value ?? undefined,
        updateDelay: createUpdateDelay.value,
        updateFailureAction: createUpdateFailureAction.value,
        mounts: splitComma(createMounts.value)
      })
    case 'update':
      return generateDockerServiceUpdateCommand(updateName.value, {
        image: updateImage.value,
        replicas: updateReplicas.value ?? undefined,
        publish: splitComma(updatePublish.value),
        networks: splitComma(updateNetworks.value),
        endpointMode: updateEndpointMode.value,
        cpuLimit: updateCpuLimit.value,
        cpuReserve: updateCpuReserve.value,
        memoryLimit: updateMemoryLimit.value,
        memoryReserve: updateMemoryReserve.value,
        updateParallelism: updateUpdateParallelism.value ?? undefined,
        updateDelay: updateUpdateDelay.value,
        updateFailureAction: updateUpdateFailureAction.value,
        mounts: splitComma(updateMounts.value)
      })
    case 'scale':
      return generateDockerServiceScaleCommand(scaleName.value, scaleReplicas.value ?? '')
    case 'logs':
      return generateDockerServiceLogsCommand(logsName.value, {
        follow: logsFollow.value,
        timestamps: logsTimestamps.value,
        tail: logsTail.value ?? undefined
      })
    case 'ps':
      return generateDockerServicePsCommand(psName.value)
    case 'ls':
      return generateDockerServiceLsCommand()
    case 'rm':
      return generateDockerServiceRmCommand(splitSpace(rmNames.value))
  }
}

function refreshPreview(): void {
  try {
    applyResult(buildCurrentResult())
  } catch (error) {
    commandOutput.value = ''
    descriptionOutput.value = '请继续补全 Docker Service 场景参数'
    warningOutput.value = '无额外提醒'
    errorOutput.value = error instanceof Error ? error.message : String(error)
  }
  emitSnapshot()
}

async function copyCommand(): Promise<void> {
  if (!commandOutput.value) return
  try {
    await navigator.clipboard.writeText(commandOutput.value)
    message.success('Docker Service 命令已复制')
  } catch {
    message.error('当前环境无法直接写入剪贴板')
  }
}

watch(
  [
    scene,
    createImage,
    createName,
    createReplicas,
    createPublish,
    createNetworks,
    createEndpointMode,
    createCpuLimit,
    createCpuReserve,
    createMemoryLimit,
    createMemoryReserve,
    createUpdateParallelism,
    createUpdateDelay,
    createUpdateFailureAction,
    createMounts,
    updateName,
    updateImage,
    updateReplicas,
    updatePublish,
    updateNetworks,
    updateEndpointMode,
    updateCpuLimit,
    updateCpuReserve,
    updateMemoryLimit,
    updateMemoryReserve,
    updateUpdateParallelism,
    updateUpdateDelay,
    updateUpdateFailureAction,
    updateMounts,
    scaleName,
    scaleReplicas,
    logsName,
    logsFollow,
    logsTimestamps,
    logsTail,
    psName,
    rmNames
  ],
  refreshPreview,
  { immediate: true }
)
</script>

<template>
  <section class="tool-panel-shell">
    <div class="tool-panel-header">
      <div>
        <p class="eyebrow">advanced panel</p>
        <h3>Docker Service 命令生成器</h3>
      </div>
      <NTag size="small" :bordered="false">{{ scene }}</NTag>
    </div>

    <p class="muted">
      保留旧项目 Docker Service 七个子场景，但改成统一高级面板，适合在同一个工作台里来回切换。
    </p>

    <div class="tool-panel-actions tool-panel-actions--wrap">
      <NRadioGroup v-model:value="scene">
        <NRadioButton v-for="item in sceneOptions" :key="item.value" :value="item.value">
          {{ item.label }}
        </NRadioButton>
      </NRadioGroup>
      <NButton secondary :disabled="!commandOutput" @click="copyCommand">复制命令</NButton>
    </div>

    <template v-if="scene === 'create'">
      <div class="tool-panel-grid">
        <div class="tool-form-stack">
          <NInput v-model:value="createImage" placeholder="nginx:latest" />
          <NInput v-model:value="createName" placeholder="web-service" />
          <NInputNumber v-model:value="createReplicas" clearable placeholder="1" />
          <NInput v-model:value="createPublish" placeholder="8080:80,443:443" />
          <NInput v-model:value="createNetworks" placeholder="frontend,backend" />
          <NInput v-model:value="createEndpointMode" placeholder="vip / dnsrr" />
          <NInput v-model:value="createMounts" placeholder="type=volume,source=data,target=/data" />
        </div>
        <div class="tool-form-stack">
          <NInput v-model:value="createCpuLimit" placeholder="1.0" />
          <NInput v-model:value="createCpuReserve" placeholder="0.5" />
          <NInput v-model:value="createMemoryLimit" placeholder="512m" />
          <NInput v-model:value="createMemoryReserve" placeholder="256m" />
          <NInputNumber v-model:value="createUpdateParallelism" clearable placeholder="1" />
          <NInput v-model:value="createUpdateDelay" placeholder="10s" />
          <NInput
            v-model:value="createUpdateFailureAction"
            placeholder="pause / continue / rollback"
          />
        </div>
      </div>
    </template>

    <template v-else-if="scene === 'update'">
      <div class="tool-panel-grid">
        <div class="tool-form-stack">
          <NInput v-model:value="updateName" placeholder="web-service" />
          <NInput v-model:value="updateImage" placeholder="nginx:1.27" />
          <NInputNumber v-model:value="updateReplicas" clearable placeholder="2" />
          <NInput v-model:value="updatePublish" placeholder="8080:80" />
          <NInput v-model:value="updateNetworks" placeholder="frontend" />
          <NInput v-model:value="updateEndpointMode" placeholder="vip / dnsrr" />
          <NInput v-model:value="updateMounts" placeholder="type=bind,source=/host,target=/app" />
        </div>
        <div class="tool-form-stack">
          <NInput v-model:value="updateCpuLimit" placeholder="1.5" />
          <NInput v-model:value="updateCpuReserve" placeholder="0.5" />
          <NInput v-model:value="updateMemoryLimit" placeholder="1g" />
          <NInput v-model:value="updateMemoryReserve" placeholder="512m" />
          <NInputNumber v-model:value="updateUpdateParallelism" clearable placeholder="1" />
          <NInput v-model:value="updateUpdateDelay" placeholder="10s" />
          <NInput
            v-model:value="updateUpdateFailureAction"
            placeholder="pause / continue / rollback"
          />
        </div>
      </div>
    </template>

    <template v-else-if="scene === 'scale'">
      <div class="tool-panel-grid">
        <NInput v-model:value="scaleName" placeholder="web-service" />
        <NInputNumber v-model:value="scaleReplicas" clearable placeholder="3" />
      </div>
    </template>

    <template v-else-if="scene === 'logs'">
      <div class="tool-panel-grid">
        <div class="tool-form-stack">
          <NInput v-model:value="logsName" placeholder="web-service" />
          <NInputNumber v-model:value="logsTail" clearable placeholder="100" />
        </div>
        <div class="tool-form-stack">
          <NCheckbox v-model:checked="logsFollow">持续跟踪 (--follow)</NCheckbox>
          <NCheckbox v-model:checked="logsTimestamps">显示时间戳 (--timestamps)</NCheckbox>
        </div>
      </div>
    </template>

    <template v-else-if="scene === 'ps'">
      <NInput v-model:value="psName" placeholder="web-service" />
    </template>

    <template v-else-if="scene === 'ls'">
      <div class="tool-preview-placeholder">
        当前场景无需额外参数，直接生成 `docker service ls`。
      </div>
    </template>

    <template v-else>
      <NInput
        v-model:value="rmNames"
        type="textarea"
        :autosize="{ minRows: 4, maxRows: 8 }"
        placeholder="web-service api-service worker-service"
      />
    </template>

    <div class="tool-output-grid">
      <section>
        <p class="eyebrow">command</p>
        <pre class="stream-output">{{ commandOutput || '等待命令生成...' }}</pre>
      </section>
      <section>
        <p class="eyebrow">details</p>
        <pre class="stream-output">{{
          [descriptionOutput, warningOutput, errorOutput].filter(Boolean).join('\n\n')
        }}</pre>
      </section>
    </div>
  </section>
</template>
