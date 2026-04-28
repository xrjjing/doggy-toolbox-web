<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  NButton,
  NCheckbox,
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
  formatWarnings,
  generateDockerBuildCommand,
  generateDockerComposeCommand,
  generateDockerContainerCommand,
  generateDockerCpCommand,
  generateDockerExecCommand,
  generateDockerImagesCommand,
  generateDockerLogsCommand,
  generateDockerNetworkCommand,
  generateDockerPruneCommand,
  generateDockerPsCommand,
  generateDockerRunCommand,
  generateDockerVolumeCommand,
  getDockerCommandTemplates,
  type CommandResult,
  type DockerComposeAction,
  type DockerContainerAction,
  type DockerNetworkAction,
  type DockerScene,
  type DockerVolumeAction
} from '../utils/core-command-generators'

/**
 * Docker 高级面板迁移目标：
 * - 覆盖旧项目 run/build/compose/exec/logs/ps/images/container/network/volume/prune/cp 全部主场景。
 * - 状态与命令生成解耦，后续主线程接中心注册时只需 import 组件即可。
 */
const emit = defineEmits<{
  snapshot: [snapshot: ToolPanelSnapshot]
}>()

const message = useMessage()
const scene = ref<DockerScene>('run')
const commandOutput = ref('')
const descriptionOutput = ref('选择 Docker 子命令后，这里会自动生成可复制命令')
const warningOutput = ref('无额外提醒')
const errorOutput = ref('')

/**
 * run 场景状态。
 */
const runImage = ref('')
const runName = ref('')
const runPorts = ref('80:80,443:443')
const runVolumes = ref('')
const runEnv = ref('')
const runNetwork = ref('bridge')
const runRestart = ref('unless-stopped')
const runMemory = ref('')
const runCpus = ref('')
const runCommand = ref('')
const runDetach = ref(true)
const runInteractive = ref(false)
const runRm = ref(false)
const runPrivileged = ref(false)

/**
 * build / compose / exec / logs 场景状态。
 */
const buildPath = ref('.')
const buildTag = ref('')
const buildFile = ref('Dockerfile')
const buildArgs = ref('')
const buildTarget = ref('')
const buildNoCache = ref(false)
const buildPull = ref(true)
const composeAction = ref<DockerComposeAction>('up')
const composeFile = ref('docker-compose.yml')
const composeProject = ref('')
const composeServices = ref('')
const composeDetach = ref(true)
const composeBuild = ref(false)
const composeNoBuild = ref(false)
const composeVolumes = ref(false)
const composeRemoveOrphans = ref(false)
const composeFollow = ref(true)
const composeTail = ref<number | null>(100)
const execContainer = ref('')
const execCommand = ref('/bin/sh')
const execInteractive = ref(true)
const execDetach = ref(false)
const execUser = ref('')
const execWorkdir = ref('')
const execEnv = ref('')
const logsContainer = ref('')
const logsFollow = ref(true)
const logsTail = ref<number | null>(100)
const logsTimestamps = ref(false)
const logsSince = ref('')
const logsUntil = ref('')

/**
 * 列表 / 管理 / 复制场景状态。
 */
const psAll = ref(true)
const psQuiet = ref(false)
const psSize = ref(false)
const psFilter = ref('')
const psFormat = ref('')
const imagesAll = ref(false)
const imagesQuiet = ref(false)
const imagesDigests = ref(false)
const imagesFilter = ref('')
const imagesFormat = ref('')
const containerAction = ref<DockerContainerAction>('rm')
const containerNames = ref('')
const containerForce = ref(true)
const containerVolumes = ref(false)
const containerTime = ref<number | null>(10)
const networkAction = ref<DockerNetworkAction>('create')
const networkName = ref('')
const networkDriver = ref('bridge')
const networkSubnet = ref('')
const networkGateway = ref('')
const networkIpRange = ref('')
const networkFilter = ref('')
const networkContainer = ref('')
const networkIp = ref('')
const networkAlias = ref('')
const networkInternal = ref(false)
const networkAttachable = ref(false)
const networkForce = ref(false)
const volumeAction = ref<DockerVolumeAction>('create')
const volumeName = ref('')
const volumeDriver = ref('local')
const volumeLabels = ref('')
const volumeOpts = ref('')
const volumeFilter = ref('')
const volumeQuiet = ref(false)
const volumeForce = ref(false)
const volumeAll = ref(false)
const pruneForce = ref(true)
const pruneAll = ref(false)
const pruneVolumes = ref(false)
const pruneFilter = ref('')
const cpSource = ref('')
const cpDest = ref('')
const cpArchive = ref(false)
const cpFollowLink = ref(false)

const sceneOptions = [
  { label: 'Run', value: 'run' },
  { label: 'Build', value: 'build' },
  { label: 'Compose', value: 'compose' },
  { label: 'Exec', value: 'exec' },
  { label: 'Logs', value: 'logs' },
  { label: 'PS', value: 'ps' },
  { label: 'Images', value: 'images' },
  { label: 'Container', value: 'container' },
  { label: 'Network', value: 'network' },
  { label: 'Volume', value: 'volume' },
  { label: 'Prune', value: 'prune' },
  { label: 'CP', value: 'cp' }
] satisfies Array<{ label: string; value: DockerScene }>

const composeActionOptions = [
  { label: 'up', value: 'up' },
  { label: 'down', value: 'down' },
  { label: 'start', value: 'start' },
  { label: 'stop', value: 'stop' },
  { label: 'restart', value: 'restart' },
  { label: 'ps', value: 'ps' },
  { label: 'logs', value: 'logs' },
  { label: 'build', value: 'build' },
  { label: 'pull', value: 'pull' },
  { label: 'exec', value: 'exec' }
] satisfies Array<{ label: string; value: DockerComposeAction }>

const containerActionOptions = [
  { label: 'stop', value: 'stop' },
  { label: 'start', value: 'start' },
  { label: 'restart', value: 'restart' },
  { label: 'rm', value: 'rm' }
] satisfies Array<{ label: string; value: DockerContainerAction }>

const networkActionOptions = [
  { label: 'create', value: 'create' },
  { label: 'ls', value: 'ls' },
  { label: 'rm', value: 'rm' },
  { label: 'inspect', value: 'inspect' },
  { label: 'connect', value: 'connect' },
  { label: 'disconnect', value: 'disconnect' },
  { label: 'prune', value: 'prune' }
] satisfies Array<{ label: string; value: DockerNetworkAction }>

const volumeActionOptions = [
  { label: 'create', value: 'create' },
  { label: 'ls', value: 'ls' },
  { label: 'rm', value: 'rm' },
  { label: 'inspect', value: 'inspect' },
  { label: 'prune', value: 'prune' }
] satisfies Array<{ label: string; value: DockerVolumeAction }>

const templateOptions = getDockerCommandTemplates().map((item) => ({
  label: `${item.category} / ${item.name}`,
  value: item.command
}))

const sceneSummary = computed(() => {
  switch (scene.value) {
    case 'run':
      return '覆盖容器命名、端口、卷、环境变量、网络与资源限制。'
    case 'build':
      return '聚焦镜像构建路径、Tag、Dockerfile、build-arg 和 target。'
    case 'compose':
      return '兼容 up/down/logs 等 docker compose 常见工作流。'
    case 'exec':
      return '快速拼装进入容器执行命令的调试场景。'
    case 'logs':
      return '围绕 follow/tail/time window 做日志查看。'
    case 'ps':
      return '容器列表过滤与格式化输出。'
    case 'images':
      return '镜像列表、摘要和格式化输出。'
    case 'container':
      return '容器 stop/start/restart/rm 批量管理。'
    case 'network':
      return '网络 create/connect/disconnect/prune 等操作。'
    case 'volume':
      return '卷的 create/inspect/prune 等运维操作。'
    case 'prune':
      return '系统清理类命令，保留风险提示。'
    case 'cp':
      return '宿主机与容器之间的文件复制。'
    default:
      return '请选择 Docker 子场景。'
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
    input: collectSnapshotInput(),
    output: commandOutput.value,
    extra: [descriptionOutput.value, warningOutput.value, errorOutput.value]
      .filter(Boolean)
      .join('\n\n')
  })
}

function collectSnapshotInput(): string {
  switch (scene.value) {
    case 'run':
      return [
        scene.value,
        runImage.value,
        runName.value,
        runPorts.value,
        runVolumes.value,
        runEnv.value
      ]
        .filter(Boolean)
        .join('\n')
    case 'build':
      return [
        scene.value,
        buildPath.value,
        buildTag.value,
        buildFile.value,
        buildArgs.value,
        buildTarget.value
      ]
        .filter(Boolean)
        .join('\n')
    case 'compose':
      return [
        scene.value,
        composeAction.value,
        composeFile.value,
        composeProject.value,
        composeServices.value
      ]
        .filter(Boolean)
        .join('\n')
    case 'exec':
      return [
        scene.value,
        execContainer.value,
        execCommand.value,
        execUser.value,
        execWorkdir.value,
        execEnv.value
      ]
        .filter(Boolean)
        .join('\n')
    case 'logs':
      return [scene.value, logsContainer.value, logsSince.value, logsUntil.value]
        .filter(Boolean)
        .join('\n')
    case 'ps':
      return [
        scene.value,
        psFilter.value,
        psFormat.value,
        `all=${psAll.value}`,
        `quiet=${psQuiet.value}`
      ]
        .filter(Boolean)
        .join('\n')
    case 'images':
      return [scene.value, imagesFilter.value, imagesFormat.value, `digests=${imagesDigests.value}`]
        .filter(Boolean)
        .join('\n')
    case 'container':
      return [scene.value, containerAction.value, containerNames.value].filter(Boolean).join('\n')
    case 'network':
      return [
        scene.value,
        networkAction.value,
        networkName.value,
        networkContainer.value,
        networkFilter.value
      ]
        .filter(Boolean)
        .join('\n')
    case 'volume':
      return [
        scene.value,
        volumeAction.value,
        volumeName.value,
        volumeLabels.value,
        volumeOpts.value
      ]
        .filter(Boolean)
        .join('\n')
    case 'prune':
      return [
        scene.value,
        pruneFilter.value,
        `all=${pruneAll.value}`,
        `volumes=${pruneVolumes.value}`
      ]
        .filter(Boolean)
        .join('\n')
    case 'cp':
      return [scene.value, cpSource.value, cpDest.value].filter(Boolean).join('\n')
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
    case 'run':
      return generateDockerRunCommand(runImage.value, {
        name: runName.value,
        ports: splitComma(runPorts.value),
        volumes: splitComma(runVolumes.value),
        env: splitComma(runEnv.value),
        network: runNetwork.value,
        restart: runRestart.value,
        memory: runMemory.value,
        cpus: runCpus.value,
        command: runCommand.value,
        detach: runDetach.value,
        interactive: runInteractive.value,
        rm: runRm.value,
        privileged: runPrivileged.value
      })
    case 'build':
      return generateDockerBuildCommand(buildPath.value, {
        tag: buildTag.value,
        file: buildFile.value,
        buildArg: splitComma(buildArgs.value),
        target: buildTarget.value,
        noCache: buildNoCache.value,
        pull: buildPull.value
      })
    case 'compose':
      return generateDockerComposeCommand(composeAction.value, {
        file: composeFile.value,
        projectName: composeProject.value,
        service: splitComma(composeServices.value),
        detach: composeDetach.value,
        build: composeBuild.value,
        noBuild: composeNoBuild.value,
        volumes: composeVolumes.value,
        removeOrphans: composeRemoveOrphans.value,
        follow: composeFollow.value,
        tail: composeTail.value ?? undefined
      })
    case 'exec':
      return generateDockerExecCommand(execContainer.value, execCommand.value, {
        interactive: execInteractive.value,
        detach: execDetach.value,
        user: execUser.value,
        workdir: execWorkdir.value,
        env: splitComma(execEnv.value)
      })
    case 'logs':
      return generateDockerLogsCommand(logsContainer.value, {
        follow: logsFollow.value,
        tail: logsTail.value ?? undefined,
        timestamps: logsTimestamps.value,
        since: logsSince.value,
        until: logsUntil.value
      })
    case 'ps':
      return generateDockerPsCommand({
        all: psAll.value,
        quiet: psQuiet.value,
        size: psSize.value,
        filter: psFilter.value,
        format: psFormat.value
      })
    case 'images':
      return generateDockerImagesCommand({
        all: imagesAll.value,
        quiet: imagesQuiet.value,
        digests: imagesDigests.value,
        filter: imagesFilter.value,
        format: imagesFormat.value
      })
    case 'container':
      return generateDockerContainerCommand(
        containerAction.value,
        splitSpace(containerNames.value),
        {
          force: containerForce.value,
          volumes: containerVolumes.value,
          time: containerTime.value ?? undefined
        }
      )
    case 'network':
      return generateDockerNetworkCommand(networkAction.value, networkName.value, {
        driver: networkDriver.value,
        subnet: networkSubnet.value,
        gateway: networkGateway.value,
        ipRange: networkIpRange.value,
        filter: networkFilter.value,
        container: networkContainer.value,
        ip: networkIp.value,
        alias: networkAlias.value,
        internal: networkInternal.value,
        attachable: networkAttachable.value,
        force: networkForce.value
      })
    case 'volume':
      return generateDockerVolumeCommand(volumeAction.value, volumeName.value, {
        driver: volumeDriver.value,
        label: splitComma(volumeLabels.value),
        opt: splitComma(volumeOpts.value),
        filter: volumeFilter.value,
        quiet: volumeQuiet.value,
        force: volumeForce.value,
        all: volumeAll.value
      })
    case 'prune':
      return generateDockerPruneCommand({
        force: pruneForce.value,
        all: pruneAll.value,
        volumes: pruneVolumes.value,
        filter: pruneFilter.value
      })
    case 'cp':
      return generateDockerCpCommand(cpSource.value, cpDest.value, {
        archive: cpArchive.value,
        followLink: cpFollowLink.value
      })
  }
}

function refreshPreview(): void {
  try {
    applyResult(buildCurrentResult())
  } catch (error) {
    commandOutput.value = ''
    descriptionOutput.value = '请继续补充当前 Docker 场景参数'
    warningOutput.value = '无额外提醒'
    errorOutput.value = error instanceof Error ? error.message : String(error)
  }
  emitSnapshot()
}

function clearCurrentScene(): void {
  switch (scene.value) {
    case 'run':
      runImage.value = ''
      runName.value = ''
      runPorts.value = ''
      runVolumes.value = ''
      runEnv.value = ''
      runCommand.value = ''
      break
    case 'build':
      buildPath.value = '.'
      buildTag.value = ''
      buildArgs.value = ''
      buildTarget.value = ''
      break
    case 'compose':
      composeServices.value = ''
      composeProject.value = ''
      break
    case 'exec':
      execContainer.value = ''
      execCommand.value = '/bin/sh'
      execUser.value = ''
      execWorkdir.value = ''
      execEnv.value = ''
      break
    case 'logs':
      logsContainer.value = ''
      logsSince.value = ''
      logsUntil.value = ''
      break
    case 'ps':
      psFilter.value = ''
      psFormat.value = ''
      break
    case 'images':
      imagesFilter.value = ''
      imagesFormat.value = ''
      break
    case 'container':
      containerNames.value = ''
      break
    case 'network':
      networkName.value = ''
      networkSubnet.value = ''
      networkGateway.value = ''
      networkIpRange.value = ''
      networkFilter.value = ''
      networkContainer.value = ''
      networkIp.value = ''
      networkAlias.value = ''
      break
    case 'volume':
      volumeName.value = ''
      volumeLabels.value = ''
      volumeOpts.value = ''
      volumeFilter.value = ''
      break
    case 'prune':
      pruneFilter.value = ''
      break
    case 'cp':
      cpSource.value = ''
      cpDest.value = ''
      break
  }
}

function applyTemplate(templateCommand: string | null): void {
  if (!templateCommand) return
  commandOutput.value = templateCommand
  descriptionOutput.value = '已填入常用 Docker 模板'
  warningOutput.value = '模板不会自动回写所有表单字段，如需继续可手动修改当前场景参数'
  errorOutput.value = ''
  emitSnapshot()
}

async function copyCommand(): Promise<void> {
  if (!commandOutput.value) return
  try {
    await navigator.clipboard.writeText(commandOutput.value)
    message.success('Docker 命令已复制')
  } catch {
    message.error('当前环境无法直接写入剪贴板')
  }
}

watch(
  [
    scene,
    runImage,
    runName,
    runPorts,
    runVolumes,
    runEnv,
    runNetwork,
    runRestart,
    runMemory,
    runCpus,
    runCommand,
    runDetach,
    runInteractive,
    runRm,
    runPrivileged,
    buildPath,
    buildTag,
    buildFile,
    buildArgs,
    buildTarget,
    buildNoCache,
    buildPull,
    composeAction,
    composeFile,
    composeProject,
    composeServices,
    composeDetach,
    composeBuild,
    composeNoBuild,
    composeVolumes,
    composeRemoveOrphans,
    composeFollow,
    composeTail,
    execContainer,
    execCommand,
    execInteractive,
    execDetach,
    execUser,
    execWorkdir,
    execEnv,
    logsContainer,
    logsFollow,
    logsTail,
    logsTimestamps,
    logsSince,
    logsUntil,
    psAll,
    psQuiet,
    psSize,
    psFilter,
    psFormat,
    imagesAll,
    imagesQuiet,
    imagesDigests,
    imagesFilter,
    imagesFormat,
    containerAction,
    containerNames,
    containerForce,
    containerVolumes,
    containerTime,
    networkAction,
    networkName,
    networkDriver,
    networkSubnet,
    networkGateway,
    networkIpRange,
    networkFilter,
    networkContainer,
    networkIp,
    networkAlias,
    networkInternal,
    networkAttachable,
    networkForce,
    volumeAction,
    volumeName,
    volumeDriver,
    volumeLabels,
    volumeOpts,
    volumeFilter,
    volumeQuiet,
    volumeForce,
    volumeAll,
    pruneForce,
    pruneAll,
    pruneVolumes,
    pruneFilter,
    cpSource,
    cpDest,
    cpArchive,
    cpFollowLink
  ],
  refreshPreview,
  { immediate: true }
)
</script>

<template>
  <section class="tool-panel-shell">
    <div class="tool-panel-header">
      <div>
        <p class="eyebrow">高级面板</p>
        <h3>Docker 命令生成器</h3>
      </div>
      <NTag size="small" :bordered="false">{{ scene }}</NTag>
    </div>

    <p class="muted">
      这块把旧项目的大型 Docker 页面迁移成独立高级面板。核心思路不变，但统一成 Vue + TypeScript
      的可测试实现。
    </p>

    <div class="tool-panel-actions tool-panel-actions--wrap">
      <NRadioGroup v-model:value="scene">
        <NRadioButton v-for="item in sceneOptions" :key="item.value" :value="item.value">
          {{ item.label }}
        </NRadioButton>
      </NRadioGroup>
    </div>

    <div class="tool-command-hero">
      <div>
        <p class="eyebrow">scene note</p>
        <strong>{{ sceneSummary }}</strong>
      </div>
      <div class="tool-command-hero__actions">
        <NSelect
          placeholder="快速套用常用 Docker 模板"
          :options="templateOptions"
          class="tool-command-template-select"
          @update:value="applyTemplate"
        />
        <NButton tertiary @click="clearCurrentScene">清空当前场景</NButton>
        <NButton secondary :disabled="!commandOutput" @click="copyCommand">复制命令</NButton>
      </div>
    </div>

    <template v-if="scene === 'run'">
      <div class="tool-panel-grid">
        <div class="tool-form-stack">
          <NInput v-model:value="runImage" placeholder="nginx:alpine" />
          <NInput v-model:value="runName" placeholder="web-nginx" />
          <NInput v-model:value="runPorts" placeholder="80:80,443:443" />
          <NInput v-model:value="runVolumes" placeholder="/host/app:/app,/host/logs:/var/log/app" />
          <NInput v-model:value="runEnv" placeholder="NODE_ENV=prod,APP_ENV=release" />
          <NInput v-model:value="runCommand" placeholder='/bin/sh -c "npm run start"' />
        </div>
        <div class="tool-form-stack">
          <NInput v-model:value="runNetwork" placeholder="bridge / host / custom-network" />
          <NInput v-model:value="runRestart" placeholder="unless-stopped" />
          <NInput v-model:value="runMemory" placeholder="512m" />
          <NInput v-model:value="runCpus" placeholder="1.0" />
          <NCheckbox v-model:checked="runDetach">后台运行 (-d)</NCheckbox>
          <NCheckbox v-model:checked="runInteractive">交互模式 (-it)</NCheckbox>
          <NCheckbox v-model:checked="runRm">退出即删除 (--rm)</NCheckbox>
          <NCheckbox v-model:checked="runPrivileged">特权模式 (--privileged)</NCheckbox>
        </div>
      </div>
    </template>

    <template v-else-if="scene === 'build'">
      <div class="tool-panel-grid">
        <div class="tool-form-stack">
          <NInput v-model:value="buildPath" placeholder="." />
          <NInput v-model:value="buildTag" placeholder="my-app:latest" />
          <NInput v-model:value="buildFile" placeholder="Dockerfile" />
          <NInput
            v-model:value="buildArgs"
            placeholder="NODE_ENV=production,HTTP_PROXY=http://proxy"
          />
          <NInput v-model:value="buildTarget" placeholder="builder / runtime" />
        </div>
        <div class="tool-form-stack">
          <NCheckbox v-model:checked="buildNoCache">禁用缓存 (--no-cache)</NCheckbox>
          <NCheckbox v-model:checked="buildPull">总是拉取基础镜像 (--pull)</NCheckbox>
        </div>
      </div>
    </template>

    <template v-else-if="scene === 'compose'">
      <div class="tool-panel-grid">
        <div class="tool-form-stack">
          <NSelect v-model:value="composeAction" :options="composeActionOptions" />
          <NInput v-model:value="composeFile" placeholder="docker-compose.yml" />
          <NInput v-model:value="composeProject" placeholder="toolbox-web" />
          <NInput v-model:value="composeServices" placeholder="web,worker" />
          <NInputNumber v-model:value="composeTail" clearable placeholder="100" />
        </div>
        <div class="tool-form-stack">
          <NCheckbox v-model:checked="composeDetach">后台运行 (-d)</NCheckbox>
          <NCheckbox v-model:checked="composeBuild">启动前构建 (--build)</NCheckbox>
          <NCheckbox v-model:checked="composeNoBuild">禁止构建 (--no-build)</NCheckbox>
          <NCheckbox v-model:checked="composeVolumes">down 时删除卷 (-v)</NCheckbox>
          <NCheckbox v-model:checked="composeRemoveOrphans"
            >删除孤儿容器 (--remove-orphans)</NCheckbox
          >
          <NCheckbox v-model:checked="composeFollow">logs 时持续跟随 (-f)</NCheckbox>
        </div>
      </div>
    </template>

    <template v-else-if="scene === 'exec'">
      <div class="tool-panel-grid">
        <div class="tool-form-stack">
          <NInput v-model:value="execContainer" placeholder="web-nginx" />
          <NInput v-model:value="execCommand" placeholder="/bin/sh" />
          <NInput v-model:value="execUser" placeholder="root" />
          <NInput v-model:value="execWorkdir" placeholder="/app" />
          <NInput v-model:value="execEnv" placeholder="DEBUG=1,LANG=C.UTF-8" />
        </div>
        <div class="tool-form-stack">
          <NCheckbox v-model:checked="execInteractive">交互模式 (-it)</NCheckbox>
          <NCheckbox v-model:checked="execDetach">后台执行 (-d)</NCheckbox>
        </div>
      </div>
    </template>

    <template v-else-if="scene === 'logs'">
      <div class="tool-panel-grid">
        <div class="tool-form-stack">
          <NInput v-model:value="logsContainer" placeholder="web-nginx" />
          <NInput v-model:value="logsSince" placeholder="2026-04-23T09:00:00" />
          <NInput v-model:value="logsUntil" placeholder="2026-04-23T18:00:00" />
          <NInputNumber v-model:value="logsTail" clearable placeholder="100" />
        </div>
        <div class="tool-form-stack">
          <NCheckbox v-model:checked="logsFollow">跟随日志 (-f)</NCheckbox>
          <NCheckbox v-model:checked="logsTimestamps">显示时间戳 (-t)</NCheckbox>
        </div>
      </div>
    </template>

    <template v-else-if="scene === 'ps'">
      <div class="tool-panel-grid">
        <div class="tool-form-stack">
          <NInput v-model:value="psFilter" placeholder="status=running" />
          <NInput
            v-model:value="psFormat"
            placeholder="table {{.Names}}\t{{.Image}}\t{{.Status}}"
          />
        </div>
        <div class="tool-form-stack">
          <NCheckbox v-model:checked="psAll">显示所有容器 (-a)</NCheckbox>
          <NCheckbox v-model:checked="psQuiet">只输出 ID (-q)</NCheckbox>
          <NCheckbox v-model:checked="psSize">带大小信息 (-s)</NCheckbox>
        </div>
      </div>
    </template>

    <template v-else-if="scene === 'images'">
      <div class="tool-panel-grid">
        <div class="tool-form-stack">
          <NInput v-model:value="imagesFilter" placeholder="dangling=true" />
          <NInput
            v-model:value="imagesFormat"
            placeholder="table {{.Repository}}\t{{.Tag}}\t{{.Size}}"
          />
        </div>
        <div class="tool-form-stack">
          <NCheckbox v-model:checked="imagesAll">显示所有层 (-a)</NCheckbox>
          <NCheckbox v-model:checked="imagesQuiet">只输出 ID (-q)</NCheckbox>
          <NCheckbox v-model:checked="imagesDigests">显示摘要 (--digests)</NCheckbox>
        </div>
      </div>
    </template>

    <template v-else-if="scene === 'container'">
      <div class="tool-panel-grid">
        <div class="tool-form-stack">
          <NSelect v-model:value="containerAction" :options="containerActionOptions" />
          <NInput v-model:value="containerNames" placeholder="web-nginx api-worker cache-redis" />
          <NInputNumber v-model:value="containerTime" clearable placeholder="stop 等待秒数" />
        </div>
        <div class="tool-form-stack">
          <NCheckbox v-model:checked="containerForce" :disabled="containerAction !== 'rm'">
            rm 时强制删除 (-f)
          </NCheckbox>
          <NCheckbox v-model:checked="containerVolumes" :disabled="containerAction !== 'rm'">
            rm 时连卷一起删 (-v)
          </NCheckbox>
        </div>
      </div>
    </template>

    <template v-else-if="scene === 'network'">
      <div class="tool-panel-grid">
        <div class="tool-form-stack">
          <NSelect v-model:value="networkAction" :options="networkActionOptions" />
          <NInput v-model:value="networkName" placeholder="frontend-net" />
          <NInput v-model:value="networkDriver" placeholder="bridge / overlay" />
          <NInput v-model:value="networkSubnet" placeholder="172.28.0.0/16" />
          <NInput v-model:value="networkGateway" placeholder="172.28.0.1" />
          <NInput v-model:value="networkIpRange" placeholder="172.28.5.0/24" />
          <NInput v-model:value="networkFilter" placeholder="driver=bridge" />
          <NInput v-model:value="networkContainer" placeholder="需要 connect/disconnect 的容器名" />
          <NInput v-model:value="networkIp" placeholder="172.28.5.10" />
          <NInput v-model:value="networkAlias" placeholder="api-service" />
        </div>
        <div class="tool-form-stack">
          <NCheckbox v-model:checked="networkInternal">create 时内部网络 (--internal)</NCheckbox>
          <NCheckbox v-model:checked="networkAttachable">create 时可附加 (--attachable)</NCheckbox>
          <NCheckbox v-model:checked="networkForce">disconnect 时强制断开 (-f)</NCheckbox>
        </div>
      </div>
    </template>

    <template v-else-if="scene === 'volume'">
      <div class="tool-panel-grid">
        <div class="tool-form-stack">
          <NSelect v-model:value="volumeAction" :options="volumeActionOptions" />
          <NInput v-model:value="volumeName" placeholder="app-data" />
          <NInput v-model:value="volumeDriver" placeholder="local / nfs" />
          <NInput v-model:value="volumeLabels" placeholder="team=ops,env=prod" />
          <NInput v-model:value="volumeOpts" placeholder="type=nfs,o=addr=10.0.0.1,rw" />
          <NInput v-model:value="volumeFilter" placeholder="dangling=true" />
        </div>
        <div class="tool-form-stack">
          <NCheckbox v-model:checked="volumeQuiet">ls 时仅输出名称 (-q)</NCheckbox>
          <NCheckbox v-model:checked="volumeForce">rm 时强制删除 (-f)</NCheckbox>
          <NCheckbox v-model:checked="volumeAll">prune 时包含全部候选 (-a)</NCheckbox>
        </div>
      </div>
    </template>

    <template v-else-if="scene === 'prune'">
      <div class="tool-panel-grid">
        <div class="tool-form-stack">
          <NInput v-model:value="pruneFilter" placeholder="until=24h" />
        </div>
        <div class="tool-form-stack">
          <NCheckbox v-model:checked="pruneForce">直接确认 (-f)</NCheckbox>
          <NCheckbox v-model:checked="pruneAll">包含未使用镜像 (-a)</NCheckbox>
          <NCheckbox v-model:checked="pruneVolumes">包含卷 (--volumes)</NCheckbox>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="tool-panel-grid">
        <div class="tool-form-stack">
          <NInput v-model:value="cpSource" placeholder="container:/app/dist 或 ./dist" />
          <NInput v-model:value="cpDest" placeholder="./backup 或 container:/app/dist" />
        </div>
        <div class="tool-form-stack">
          <NCheckbox v-model:checked="cpArchive">归档模式 (-a)</NCheckbox>
          <NCheckbox v-model:checked="cpFollowLink">跟随符号链接 (-L)</NCheckbox>
        </div>
      </div>
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
