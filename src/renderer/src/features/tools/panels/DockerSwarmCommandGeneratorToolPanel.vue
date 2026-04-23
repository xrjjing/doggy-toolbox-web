<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
  formatWarnings,
  generateDockerStackDeployCommand,
  generateDockerStackLsCommand,
  generateDockerStackPsCommand,
  generateDockerStackRmCommand,
  generateDockerStackServicesCommand,
  generateDockerSwarmInitCommand,
  generateDockerSwarmJoinCommand,
  generateDockerSwarmLeaveCommand,
  generateDockerSwarmUnlockCommand,
  generateDockerSwarmUpdateCommand,
  type CommandResult,
  type DockerStackScene,
  type DockerSwarmScene,
  type DockerSwarmScope
} from '../utils/core-command-generators'

/**
 * Docker Swarm 面板保留旧项目的“两级场景”概念：
 * - 一级：Swarm / Stack
 * - 二级：各自的具体子命令
 * 这样迁移后，用户仍能沿用旧页面的思维路径。
 */
const emit = defineEmits<{
  snapshot: [snapshot: ToolPanelSnapshot]
}>()

const message = useMessage()
const scope = ref<DockerSwarmScope>('swarm')
const swarmScene = ref<DockerSwarmScene>('init')
const stackScene = ref<DockerStackScene>('deploy')
const commandOutput = ref('')
const descriptionOutput = ref('在 Swarm 和 Stack 之间切换后，会实时生成对应命令')
const warningOutput = ref('无额外提醒')
const errorOutput = ref('')

const swarmInitAdvertiseAddr = ref('')
const swarmInitListenAddr = ref('')
const swarmInitForceNewCluster = ref(false)
const swarmJoinAddr = ref('')
const swarmJoinToken = ref('')
const swarmJoinAdvertiseAddr = ref('')
const swarmJoinListenAddr = ref('')
const swarmLeaveForce = ref(false)
const swarmUpdateAutolock = ref<'keep' | 'true' | 'false'>('keep')
const swarmUpdateCertExpiry = ref('')
const swarmUpdateDispatcherHeartbeat = ref('')
const stackDeployName = ref('')
const stackDeployComposeFiles = ref('docker-compose.yml')
const stackDeployWithRegistryAuth = ref(false)
const stackDeployPrune = ref(false)
const stackDeployResolveImage = ref('always')
const stackPsName = ref('')
const stackServicesName = ref('')
const stackRmNames = ref('')

const scopeOptions = [
  { label: 'Swarm', value: 'swarm' },
  { label: 'Stack', value: 'stack' }
] satisfies Array<{ label: string; value: DockerSwarmScope }>

const swarmSceneOptions = [
  { label: 'Init', value: 'init' },
  { label: 'Join', value: 'join' },
  { label: 'Leave', value: 'leave' },
  { label: 'Update', value: 'update' },
  { label: 'Unlock', value: 'unlock' }
] satisfies Array<{ label: string; value: DockerSwarmScene }>

const stackSceneOptions = [
  { label: 'Deploy', value: 'deploy' },
  { label: 'LS', value: 'ls' },
  { label: 'PS', value: 'ps' },
  { label: 'Services', value: 'services' },
  { label: 'RM', value: 'rm' }
] satisfies Array<{ label: string; value: DockerStackScene }>

const resolveImageOptions = [
  { label: 'always', value: 'always' },
  { label: 'changed', value: 'changed' },
  { label: 'never', value: 'never' }
]

const currentSummary = computed(() => {
  if (scope.value === 'swarm') {
    switch (swarmScene.value) {
      case 'init':
        return '初始化新集群，适合 manager 首节点。'
      case 'join':
        return '把当前节点加入已有 Swarm 集群。'
      case 'leave':
        return '让当前节点离开集群。'
      case 'update':
        return '调整 autolock、证书过期和 dispatcher 心跳。'
      case 'unlock':
        return '生成 unlock 命令，并提醒需要手动输入 key。'
      default:
        return '请选择 Swarm 子场景。'
    }
  }

  switch (stackScene.value) {
    case 'deploy':
      return '根据 compose 文件生成 stack deploy。'
    case 'ls':
      return '列出所有 Stack。'
    case 'ps':
      return '查看指定 Stack 下的任务。'
    case 'services':
      return '查看指定 Stack 下的服务。'
    case 'rm':
      return '一次性移除一个或多个 Stack。'
    default:
      return '请选择 Stack 子场景。'
  }
})

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
    input: [
      scope.value,
      scope.value === 'swarm' ? swarmScene.value : stackScene.value,
      collectScopeInput()
    ]
      .filter(Boolean)
      .join('\n'),
    output: commandOutput.value,
    extra: [descriptionOutput.value, warningOutput.value, errorOutput.value]
      .filter(Boolean)
      .join('\n\n')
  })
}

function collectScopeInput(): string {
  if (scope.value === 'swarm') {
    switch (swarmScene.value) {
      case 'init':
        return [swarmInitAdvertiseAddr.value, swarmInitListenAddr.value].filter(Boolean).join('\n')
      case 'join':
        return [
          swarmJoinAddr.value,
          swarmJoinToken.value,
          swarmJoinAdvertiseAddr.value,
          swarmJoinListenAddr.value
        ]
          .filter(Boolean)
          .join('\n')
      case 'leave':
        return `force=${swarmLeaveForce.value}`
      case 'update':
        return [
          swarmUpdateAutolock.value,
          swarmUpdateCertExpiry.value,
          swarmUpdateDispatcherHeartbeat.value
        ]
          .filter(Boolean)
          .join('\n')
      case 'unlock':
        return 'docker swarm unlock'
    }
  }

  switch (stackScene.value) {
    case 'deploy':
      return [stackDeployName.value, stackDeployComposeFiles.value].filter(Boolean).join('\n')
    case 'ls':
      return 'docker stack ls'
    case 'ps':
      return stackPsName.value
    case 'services':
      return stackServicesName.value
    case 'rm':
      return stackRmNames.value
  }
}

function applyResult(result: CommandResult): void {
  commandOutput.value = result.command
  descriptionOutput.value = result.description
  warningOutput.value = formatWarnings(result.warnings)
  errorOutput.value = ''
}

function buildCurrentResult(): CommandResult {
  if (scope.value === 'swarm') {
    switch (swarmScene.value) {
      case 'init':
        return generateDockerSwarmInitCommand({
          advertiseAddr: swarmInitAdvertiseAddr.value,
          listenAddr: swarmInitListenAddr.value,
          forceNewCluster: swarmInitForceNewCluster.value
        })
      case 'join':
        return generateDockerSwarmJoinCommand(swarmJoinAddr.value, {
          token: swarmJoinToken.value,
          advertiseAddr: swarmJoinAdvertiseAddr.value,
          listenAddr: swarmJoinListenAddr.value
        })
      case 'leave':
        return generateDockerSwarmLeaveCommand({ force: swarmLeaveForce.value })
      case 'update':
        return generateDockerSwarmUpdateCommand({
          autolock:
            swarmUpdateAutolock.value === 'keep' ? null : swarmUpdateAutolock.value === 'true',
          certExpiry: swarmUpdateCertExpiry.value,
          dispatcherHeartbeat: swarmUpdateDispatcherHeartbeat.value
        })
      case 'unlock':
        return generateDockerSwarmUnlockCommand()
    }
  }

  switch (stackScene.value) {
    case 'deploy':
      return generateDockerStackDeployCommand(stackDeployName.value, {
        composeFiles: splitComma(stackDeployComposeFiles.value),
        withRegistryAuth: stackDeployWithRegistryAuth.value,
        prune: stackDeployPrune.value,
        resolveImage: stackDeployResolveImage.value
      })
    case 'ls':
      return generateDockerStackLsCommand()
    case 'ps':
      return generateDockerStackPsCommand(stackPsName.value)
    case 'services':
      return generateDockerStackServicesCommand(stackServicesName.value)
    case 'rm':
      return generateDockerStackRmCommand(splitSpace(stackRmNames.value))
  }
}

function refreshPreview(): void {
  try {
    applyResult(buildCurrentResult())
  } catch (error) {
    commandOutput.value = ''
    descriptionOutput.value = '请继续补全 Docker Swarm / Stack 参数'
    warningOutput.value = '无额外提醒'
    errorOutput.value = error instanceof Error ? error.message : String(error)
  }
  emitSnapshot()
}

async function copyCommand(): Promise<void> {
  if (!commandOutput.value) return
  try {
    await navigator.clipboard.writeText(commandOutput.value)
    message.success('Docker Swarm 命令已复制')
  } catch {
    message.error('当前环境无法直接写入剪贴板')
  }
}

watch(
  [
    scope,
    swarmScene,
    stackScene,
    swarmInitAdvertiseAddr,
    swarmInitListenAddr,
    swarmInitForceNewCluster,
    swarmJoinAddr,
    swarmJoinToken,
    swarmJoinAdvertiseAddr,
    swarmJoinListenAddr,
    swarmLeaveForce,
    swarmUpdateAutolock,
    swarmUpdateCertExpiry,
    swarmUpdateDispatcherHeartbeat,
    stackDeployName,
    stackDeployComposeFiles,
    stackDeployWithRegistryAuth,
    stackDeployPrune,
    stackDeployResolveImage,
    stackPsName,
    stackServicesName,
    stackRmNames
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
        <h3>Docker Swarm 命令生成器</h3>
      </div>
      <NTag size="small" :bordered="false">{{ scope }}</NTag>
    </div>

    <p class="muted">
      旧项目里 Swarm 和 Stack 是两层标签页。这里沿用相同结构，方便用户按原先操作心智迁移。
    </p>

    <div class="tool-panel-actions tool-panel-actions--wrap">
      <NRadioGroup v-model:value="scope">
        <NRadioButton v-for="item in scopeOptions" :key="item.value" :value="item.value">
          {{ item.label }}
        </NRadioButton>
      </NRadioGroup>
      <NButton secondary :disabled="!commandOutput" @click="copyCommand">复制命令</NButton>
    </div>

    <div class="tool-command-hero">
      <div>
        <p class="eyebrow">scope note</p>
        <strong>{{ currentSummary }}</strong>
      </div>
    </div>

    <template v-if="scope === 'swarm'">
      <div class="tool-panel-actions tool-panel-actions--wrap">
        <NRadioGroup v-model:value="swarmScene">
          <NRadioButton v-for="item in swarmSceneOptions" :key="item.value" :value="item.value">
            {{ item.label }}
          </NRadioButton>
        </NRadioGroup>
      </div>

      <template v-if="swarmScene === 'init'">
        <div class="tool-panel-grid">
          <NInput v-model:value="swarmInitAdvertiseAddr" placeholder="192.168.1.10" />
          <div class="tool-form-stack">
            <NInput v-model:value="swarmInitListenAddr" placeholder="0.0.0.0:2377" />
            <NCheckbox v-model:checked="swarmInitForceNewCluster">
              强制创建新集群 (--force-new-cluster)
            </NCheckbox>
          </div>
        </div>
      </template>

      <template v-else-if="swarmScene === 'join'">
        <div class="tool-panel-grid">
          <div class="tool-form-stack">
            <NInput v-model:value="swarmJoinAddr" placeholder="192.168.1.10:2377" />
            <NInput v-model:value="swarmJoinToken" placeholder="SWMTKN-..." />
          </div>
          <div class="tool-form-stack">
            <NInput v-model:value="swarmJoinAdvertiseAddr" placeholder="192.168.1.20" />
            <NInput v-model:value="swarmJoinListenAddr" placeholder="0.0.0.0:2377" />
          </div>
        </div>
      </template>

      <template v-else-if="swarmScene === 'leave'">
        <NCheckbox v-model:checked="swarmLeaveForce">强制退出 (--force)</NCheckbox>
      </template>

      <template v-else-if="swarmScene === 'update'">
        <div class="tool-panel-grid">
          <div class="tool-form-stack">
            <NSelect
              v-model:value="swarmUpdateAutolock"
              :options="[
                { label: '保持不变', value: 'keep' },
                { label: '启用 autolock', value: 'true' },
                { label: '关闭 autolock', value: 'false' }
              ]"
            />
            <NInput v-model:value="swarmUpdateCertExpiry" placeholder="2160h" />
          </div>
          <div class="tool-form-stack">
            <NInput v-model:value="swarmUpdateDispatcherHeartbeat" placeholder="5s" />
          </div>
        </div>
      </template>

      <template v-else>
        <div class="tool-preview-placeholder">
          unlock 场景没有额外参数。生成后仍需在终端里手动输入 Swarm unlock key。
        </div>
      </template>
    </template>

    <template v-else>
      <div class="tool-panel-actions tool-panel-actions--wrap">
        <NRadioGroup v-model:value="stackScene">
          <NRadioButton v-for="item in stackSceneOptions" :key="item.value" :value="item.value">
            {{ item.label }}
          </NRadioButton>
        </NRadioGroup>
      </div>

      <template v-if="stackScene === 'deploy'">
        <div class="tool-panel-grid">
          <div class="tool-form-stack">
            <NInput v-model:value="stackDeployName" placeholder="my-stack" />
            <NInput
              v-model:value="stackDeployComposeFiles"
              placeholder="docker-compose.yml,docker-compose.prod.yml"
            />
          </div>
          <div class="tool-form-stack">
            <NSelect v-model:value="stackDeployResolveImage" :options="resolveImageOptions" />
            <NCheckbox v-model:checked="stackDeployWithRegistryAuth">
              携带 registry 认证 (--with-registry-auth)
            </NCheckbox>
            <NCheckbox v-model:checked="stackDeployPrune">清理废弃服务 (--prune)</NCheckbox>
          </div>
        </div>
      </template>

      <template v-else-if="stackScene === 'ls'">
        <div class="tool-preview-placeholder">
          当前场景无需额外参数，直接生成 `docker stack ls`。
        </div>
      </template>

      <template v-else-if="stackScene === 'ps'">
        <NInput v-model:value="stackPsName" placeholder="my-stack" />
      </template>

      <template v-else-if="stackScene === 'services'">
        <NInput v-model:value="stackServicesName" placeholder="my-stack" />
      </template>

      <template v-else>
        <NInput
          v-model:value="stackRmNames"
          type="textarea"
          :autosize="{ minRows: 4, maxRows: 8 }"
          placeholder="stack-a stack-b"
        />
      </template>
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
