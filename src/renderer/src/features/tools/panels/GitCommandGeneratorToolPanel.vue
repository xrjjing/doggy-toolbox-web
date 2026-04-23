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
  generateGitBranchCommand,
  generateGitCherryPickCommand,
  generateGitCloneCommand,
  generateGitCommitCommand,
  generateGitLogCommand,
  generateGitMergeCommand,
  generateGitRebaseCommand,
  generateGitRemoteCommand,
  generateGitResetCommand,
  generateGitRevertCommand,
  generateGitStashCommand,
  generateGitTagCommand,
  getGitCommandTemplates,
  type CommandResult,
  type GitBranchAction,
  type GitRemoteAction,
  type GitResetMode,
  type GitScene,
  type GitStashAction,
  type GitTagAction
} from '../utils/core-command-generators'

/**
 * 这个面板对应旧项目的 Git 命令生成器。
 * 设计上继续保留“多场景切换 + 表单参数 -> 命令预览”的思路，
 * 但把真正的命令拼装逻辑下沉到纯 TypeScript utils，方便测试和后续接主线程注册。
 */
const emit = defineEmits<{
  snapshot: [snapshot: ToolPanelSnapshot]
}>()

const message = useMessage()
const scene = ref<GitScene>('commit')
const commandOutput = ref('')
const descriptionOutput = ref('选择场景并填写参数后，这里会自动生成 Git 命令')
const warningOutput = ref('无额外提醒')
const errorOutput = ref('')

/**
 * 提交场景状态。
 */
const commitMessage = ref('')
const commitAll = ref(false)
const commitAmend = ref(false)
const commitNoVerify = ref(false)

/**
 * 分支场景状态。
 */
const branchAction = ref<GitBranchAction>('create')
const branchName = ref('')
const branchNewName = ref('')
const branchForce = ref(false)
const branchRemote = ref(false)
const branchTrack = ref(false)

/**
 * 日志场景状态。
 */
const logOneline = ref(true)
const logGraph = ref(true)
const logCount = ref<number | null>(20)
const logAuthor = ref('')
const logGrep = ref('')

/**
 * reset / clone / merge / stash / rebase 等场景状态。
 */
const resetMode = ref<GitResetMode>('mixed')
const resetRef = ref('HEAD~1')
const cloneUrl = ref('')
const cloneBranch = ref('')
const cloneDir = ref('')
const cloneDepth = ref<number | null>(1)
const cloneRecursive = ref(true)
const cloneSingleBranch = ref(false)
const mergeBranch = ref('')
const mergeNoFf = ref(false)
const mergeSquash = ref(false)
const mergeMessage = ref('')
const stashAction = ref<GitStashAction>('save')
const stashMessage = ref('')
const stashIndex = ref<number | null>(0)
const stashKeepIndex = ref(false)
const rebaseBranch = ref('')
const rebaseInteractive = ref(true)
const rebaseOnto = ref('')
const cherryPickCommits = ref('')
const cherryPickNoCommit = ref(false)
const cherryPickEdit = ref(false)
const cherryPickSignoff = ref(false)
const cherryPickMainline = ref<number | null>(null)
const tagAction = ref<GitTagAction>('create')
const tagName = ref('')
const tagAnnotate = ref(true)
const tagMessage = ref('')
const tagRemote = ref('origin')
const tagForce = ref(false)
const remoteAction = ref<GitRemoteAction>('add')
const remoteName = ref('origin')
const remoteValue = ref('')
const revertCommits = ref('')
const revertNoCommit = ref(false)
const revertNoEdit = ref(true)
const revertEdit = ref(false)
const revertMainline = ref<number | null>(null)

const sceneOptions = [
  { label: 'Commit', value: 'commit' },
  { label: 'Branch', value: 'branch' },
  { label: 'Log', value: 'log' },
  { label: 'Reset', value: 'reset' },
  { label: 'Clone', value: 'clone' },
  { label: 'Merge', value: 'merge' },
  { label: 'Stash', value: 'stash' },
  { label: 'Rebase', value: 'rebase' },
  { label: 'Cherry-pick', value: 'cherry-pick' },
  { label: 'Tag', value: 'tag' },
  { label: 'Remote', value: 'remote' },
  { label: 'Revert', value: 'revert' }
] satisfies Array<{ label: string; value: GitScene }>

const branchActionOptions = [
  { label: '创建', value: 'create' },
  { label: '删除', value: 'delete' },
  { label: '列表', value: 'list' },
  { label: '重命名', value: 'rename' },
  { label: '切换', value: 'switch' }
] satisfies Array<{ label: string; value: GitBranchAction }>

const resetModeOptions = [
  { label: 'soft', value: 'soft' },
  { label: 'mixed', value: 'mixed' },
  { label: 'hard', value: 'hard' }
] satisfies Array<{ label: string; value: GitResetMode }>

const stashActionOptions = [
  { label: 'save', value: 'save' },
  { label: 'list', value: 'list' },
  { label: 'pop', value: 'pop' },
  { label: 'apply', value: 'apply' },
  { label: 'drop', value: 'drop' },
  { label: 'clear', value: 'clear' }
] satisfies Array<{ label: string; value: GitStashAction }>

const tagActionOptions = [
  { label: 'create', value: 'create' },
  { label: 'delete', value: 'delete' },
  { label: 'push', value: 'push' },
  { label: 'list', value: 'list' }
] satisfies Array<{ label: string; value: GitTagAction }>

const remoteActionOptions = [
  { label: 'add', value: 'add' },
  { label: 'set-url', value: 'set-url' },
  { label: 'remove', value: 'remove' },
  { label: 'show', value: 'show' },
  { label: 'rename', value: 'rename' }
] satisfies Array<{ label: string; value: GitRemoteAction }>

const templateOptions = getGitCommandTemplates().map((item) => ({
  label: `${item.category} / ${item.name}`,
  value: item.command
}))

/**
 * 当前场景的用途摘要，放到卡片说明区，帮助用户快速判断当前是在生成什么类型的 Git 操作。
 */
const sceneSummary = computed(() => {
  switch (scene.value) {
    case 'commit':
      return '提交消息、amend、跳过 hooks 等常见提交场景。'
    case 'branch':
      return '覆盖创建、删除、列出、重命名和切换分支。'
    case 'log':
      return '用于按数量、作者、关键词过滤提交历史。'
    case 'reset':
      return '对齐旧项目 soft / mixed / hard 三种 reset 模式。'
    case 'clone':
      return '支持浅克隆、指定分支、目标目录和递归子模块。'
    case 'merge':
      return '合并分支时可选 no-ff、squash 和自定义消息。'
    case 'stash':
      return '保留 save/list/pop/apply/drop/clear 六类 stash 工作流。'
    case 'rebase':
      return '支持交互式变基和 onto 基底切换。'
    case 'cherry-pick':
      return '支持多提交挑选、签名和主线参数。'
    case 'tag':
      return '支持创建、删除、推送和列出标签。'
    case 'remote':
      return '围绕 origin 等远端做 add/set-url/remove/show/rename。'
    case 'revert':
      return '按旧项目保留 no-commit/no-edit/mainline 等撤销策略。'
    default:
      return '请选择 Git 子场景。'
  }
})

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
    case 'commit':
      return [
        scene.value,
        commitMessage.value,
        `all=${commitAll.value}`,
        `amend=${commitAmend.value}`
      ].join('\n')
    case 'branch':
      return [
        scene.value,
        `action=${branchAction.value}`,
        branchName.value,
        branchNewName.value,
        `force=${branchForce.value}`,
        `remote=${branchRemote.value}`,
        `track=${branchTrack.value}`
      ]
        .filter(Boolean)
        .join('\n')
    case 'log':
      return [
        scene.value,
        `oneline=${logOneline.value}`,
        `graph=${logGraph.value}`,
        `count=${logCount.value ?? ''}`,
        logAuthor.value,
        logGrep.value
      ]
        .filter(Boolean)
        .join('\n')
    case 'reset':
      return [scene.value, resetMode.value, resetRef.value].filter(Boolean).join('\n')
    case 'clone':
      return [
        scene.value,
        cloneUrl.value,
        cloneBranch.value,
        cloneDir.value,
        `depth=${cloneDepth.value ?? ''}`,
        `recursive=${cloneRecursive.value}`
      ]
        .filter(Boolean)
        .join('\n')
    case 'merge':
      return [
        scene.value,
        mergeBranch.value,
        `noFf=${mergeNoFf.value}`,
        `squash=${mergeSquash.value}`,
        mergeMessage.value
      ]
        .filter(Boolean)
        .join('\n')
    case 'stash':
      return [
        scene.value,
        `action=${stashAction.value}`,
        stashMessage.value,
        `index=${stashIndex.value ?? ''}`,
        `keepIndex=${stashKeepIndex.value}`
      ]
        .filter(Boolean)
        .join('\n')
    case 'rebase':
      return [
        scene.value,
        rebaseBranch.value,
        `interactive=${rebaseInteractive.value}`,
        rebaseOnto.value
      ]
        .filter(Boolean)
        .join('\n')
    case 'cherry-pick':
      return [
        scene.value,
        cherryPickCommits.value,
        `noCommit=${cherryPickNoCommit.value}`,
        `edit=${cherryPickEdit.value}`,
        `signoff=${cherryPickSignoff.value}`,
        `mainline=${cherryPickMainline.value ?? ''}`
      ]
        .filter(Boolean)
        .join('\n')
    case 'tag':
      return [
        scene.value,
        `action=${tagAction.value}`,
        tagName.value,
        `annotate=${tagAnnotate.value}`,
        tagMessage.value,
        tagRemote.value,
        `force=${tagForce.value}`
      ]
        .filter(Boolean)
        .join('\n')
    case 'remote':
      return [scene.value, `action=${remoteAction.value}`, remoteName.value, remoteValue.value]
        .filter(Boolean)
        .join('\n')
    case 'revert':
      return [
        scene.value,
        revertCommits.value,
        `noCommit=${revertNoCommit.value}`,
        `noEdit=${revertNoEdit.value}`,
        `edit=${revertEdit.value}`,
        `mainline=${revertMainline.value ?? ''}`
      ]
        .filter(Boolean)
        .join('\n')
  }
}

/**
 * 真正的命令预览入口。
 * 所有 watch 都汇总到这里，保证任意字段变化后，预览区和 snapshot 都同步刷新。
 */
function refreshPreview(): void {
  try {
    const result = buildCurrentResult()
    applyResult(result)
  } catch (error) {
    commandOutput.value = ''
    descriptionOutput.value = '请继续补充当前场景的必填参数'
    warningOutput.value = '无额外提醒'
    errorOutput.value = error instanceof Error ? error.message : String(error)
  }
  emitSnapshot()
}

function buildCurrentResult(): CommandResult {
  switch (scene.value) {
    case 'commit':
      return generateGitCommitCommand(commitMessage.value, {
        all: commitAll.value,
        amend: commitAmend.value,
        noVerify: commitNoVerify.value
      })
    case 'branch':
      return generateGitBranchCommand(branchAction.value, branchName.value, {
        newName: branchNewName.value,
        force: branchForce.value,
        remote: branchRemote.value,
        track: branchTrack.value
      })
    case 'log':
      return generateGitLogCommand({
        oneline: logOneline.value,
        graph: logGraph.value,
        maxCount: logCount.value ?? undefined,
        author: logAuthor.value,
        grep: logGrep.value
      })
    case 'reset':
      return generateGitResetCommand(resetMode.value, resetRef.value)
    case 'clone':
      return generateGitCloneCommand(cloneUrl.value, {
        branch: cloneBranch.value,
        targetDir: cloneDir.value,
        depth: cloneDepth.value ?? undefined,
        recursive: cloneRecursive.value,
        singleBranch: cloneSingleBranch.value
      })
    case 'merge':
      return generateGitMergeCommand(mergeBranch.value, {
        noFf: mergeNoFf.value,
        squash: mergeSquash.value,
        message: mergeMessage.value
      })
    case 'stash':
      return generateGitStashCommand(stashAction.value, {
        message: stashMessage.value,
        index: stashIndex.value ?? undefined,
        keepIndex: stashKeepIndex.value
      })
    case 'rebase':
      return generateGitRebaseCommand(rebaseBranch.value, {
        interactive: rebaseInteractive.value,
        onto: rebaseOnto.value
      })
    case 'cherry-pick':
      return generateGitCherryPickCommand(cherryPickCommits.value, {
        noCommit: cherryPickNoCommit.value,
        edit: cherryPickEdit.value,
        signoff: cherryPickSignoff.value,
        mainline: cherryPickMainline.value ?? undefined
      })
    case 'tag':
      return generateGitTagCommand(tagAction.value, tagName.value, {
        annotate: tagAnnotate.value,
        message: tagMessage.value,
        remote: tagRemote.value,
        force: tagForce.value
      })
    case 'remote':
      return generateGitRemoteCommand(remoteAction.value, remoteName.value, remoteValue.value)
    case 'revert':
      return generateGitRevertCommand(revertCommits.value, {
        noCommit: revertNoCommit.value,
        noEdit: revertNoEdit.value,
        edit: revertEdit.value,
        mainline: revertMainline.value ?? undefined
      })
  }
}

function applyResult(result: CommandResult): void {
  commandOutput.value = result.command
  descriptionOutput.value = result.description
  warningOutput.value = formatWarnings(result.warnings)
  errorOutput.value = ''
}

function clearCurrentScene(): void {
  switch (scene.value) {
    case 'commit':
      commitMessage.value = ''
      commitAll.value = false
      commitAmend.value = false
      commitNoVerify.value = false
      break
    case 'branch':
      branchName.value = ''
      branchNewName.value = ''
      branchForce.value = false
      branchRemote.value = false
      branchTrack.value = false
      break
    case 'log':
      logOneline.value = true
      logGraph.value = true
      logCount.value = 20
      logAuthor.value = ''
      logGrep.value = ''
      break
    case 'reset':
      resetMode.value = 'mixed'
      resetRef.value = ''
      break
    case 'clone':
      cloneUrl.value = ''
      cloneBranch.value = ''
      cloneDir.value = ''
      cloneDepth.value = 1
      cloneRecursive.value = true
      cloneSingleBranch.value = false
      break
    case 'merge':
      mergeBranch.value = ''
      mergeNoFf.value = false
      mergeSquash.value = false
      mergeMessage.value = ''
      break
    case 'stash':
      stashMessage.value = ''
      stashIndex.value = 0
      stashKeepIndex.value = false
      break
    case 'rebase':
      rebaseBranch.value = ''
      rebaseInteractive.value = true
      rebaseOnto.value = ''
      break
    case 'cherry-pick':
      cherryPickCommits.value = ''
      cherryPickNoCommit.value = false
      cherryPickEdit.value = false
      cherryPickSignoff.value = false
      cherryPickMainline.value = null
      break
    case 'tag':
      tagName.value = ''
      tagAnnotate.value = true
      tagMessage.value = ''
      tagRemote.value = 'origin'
      tagForce.value = false
      break
    case 'remote':
      remoteName.value = 'origin'
      remoteValue.value = ''
      break
    case 'revert':
      revertCommits.value = ''
      revertNoCommit.value = false
      revertNoEdit.value = true
      revertEdit.value = false
      revertMainline.value = null
      break
  }
}

/**
 * 旧项目支持“模板快速填充”，这里保留同样能力。
 * 模板主要用于给用户一个可立即复制或再二次调整的基线。
 */
function applyTemplate(templateCommand: string | null): void {
  if (!templateCommand) return
  commandOutput.value = templateCommand
  descriptionOutput.value = '已填入常用 Git 模板命令'
  warningOutput.value = '模板命令不会自动回写到场景表单，请按需复制或继续手动调整'
  errorOutput.value = ''
  emitSnapshot()
}

async function copyCommand(): Promise<void> {
  if (!commandOutput.value) return
  try {
    await navigator.clipboard.writeText(commandOutput.value)
    message.success('Git 命令已复制')
  } catch {
    message.error('当前环境无法直接写入剪贴板')
  }
}

watch(
  [
    scene,
    commitMessage,
    commitAll,
    commitAmend,
    commitNoVerify,
    branchAction,
    branchName,
    branchNewName,
    branchForce,
    branchRemote,
    branchTrack,
    logOneline,
    logGraph,
    logCount,
    logAuthor,
    logGrep,
    resetMode,
    resetRef,
    cloneUrl,
    cloneBranch,
    cloneDir,
    cloneDepth,
    cloneRecursive,
    cloneSingleBranch,
    mergeBranch,
    mergeNoFf,
    mergeSquash,
    mergeMessage,
    stashAction,
    stashMessage,
    stashIndex,
    stashKeepIndex,
    rebaseBranch,
    rebaseInteractive,
    rebaseOnto,
    cherryPickCommits,
    cherryPickNoCommit,
    cherryPickEdit,
    cherryPickSignoff,
    cherryPickMainline,
    tagAction,
    tagName,
    tagAnnotate,
    tagMessage,
    tagRemote,
    tagForce,
    remoteAction,
    remoteName,
    remoteValue,
    revertCommits,
    revertNoCommit,
    revertNoEdit,
    revertEdit,
    revertMainline
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
        <h3>Git 命令生成器</h3>
      </div>
      <NTag size="small" :bordered="false">{{ scene }}</NTag>
    </div>

    <p class="muted">
      这块补齐旧项目剩余的大型 Git
      可视化命令页。参数变化会实时刷新命令预览，方便直接复制到终端执行。
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
          placeholder="快速套用常用 Git 模板"
          :options="templateOptions"
          class="tool-command-template-select"
          @update:value="applyTemplate"
        />
        <NButton tertiary @click="clearCurrentScene">清空当前场景</NButton>
        <NButton secondary :disabled="!commandOutput" @click="copyCommand">复制命令</NButton>
      </div>
    </div>

    <template v-if="scene === 'commit'">
      <div class="tool-panel-grid">
        <NInput
          v-model:value="commitMessage"
          type="textarea"
          :autosize="{ minRows: 4, maxRows: 8 }"
          placeholder="feat: migrate command generator panels"
        />
        <div class="tool-form-stack">
          <NCheckbox v-model:checked="commitAll">自动暂存已跟踪文件 (-a)</NCheckbox>
          <NCheckbox v-model:checked="commitAmend">修改最近一次提交 (--amend)</NCheckbox>
          <NCheckbox v-model:checked="commitNoVerify">跳过 hooks (--no-verify)</NCheckbox>
        </div>
      </div>
    </template>

    <template v-else-if="scene === 'branch'">
      <div class="tool-panel-grid">
        <div class="tool-form-stack">
          <NSelect v-model:value="branchAction" :options="branchActionOptions" />
          <NInput v-model:value="branchName" placeholder="feature/command-migration" />
          <NInput
            v-if="branchAction === 'rename'"
            v-model:value="branchNewName"
            placeholder="feature/command-migration-v2"
          />
        </div>
        <div class="tool-form-stack">
          <NCheckbox v-model:checked="branchForce" :disabled="branchAction !== 'delete'">
            删除时强制执行 (-D)
          </NCheckbox>
          <NCheckbox v-model:checked="branchRemote" :disabled="branchAction !== 'list'">
            列出远程分支 (-r)
          </NCheckbox>
          <NCheckbox v-model:checked="branchTrack" :disabled="branchAction !== 'create'">
            创建时建立跟踪关系 (--track)
          </NCheckbox>
        </div>
      </div>
    </template>

    <template v-else-if="scene === 'log'">
      <div class="tool-panel-grid">
        <div class="tool-form-stack">
          <NCheckbox v-model:checked="logOneline">单行摘要 (--oneline)</NCheckbox>
          <NCheckbox v-model:checked="logGraph">显示分支图 (--graph)</NCheckbox>
          <NInputNumber v-model:value="logCount" clearable placeholder="20" />
        </div>
        <div class="tool-form-stack">
          <NInput v-model:value="logAuthor" placeholder="作者名 / 邮箱" />
          <NInput v-model:value="logGrep" placeholder="按提交消息关键词过滤" />
        </div>
      </div>
    </template>

    <template v-else-if="scene === 'reset'">
      <div class="tool-panel-grid">
        <NSelect v-model:value="resetMode" :options="resetModeOptions" />
        <NInput v-model:value="resetRef" placeholder="HEAD~1 / commit hash / tag" />
      </div>
    </template>

    <template v-else-if="scene === 'clone'">
      <div class="tool-panel-grid">
        <div class="tool-form-stack">
          <NInput v-model:value="cloneUrl" placeholder="https://github.com/user/repo.git" />
          <NInput v-model:value="cloneBranch" placeholder="main" />
          <NInput v-model:value="cloneDir" placeholder="repo-local-dir" />
          <NInputNumber v-model:value="cloneDepth" clearable placeholder="1" />
        </div>
        <div class="tool-form-stack">
          <NCheckbox v-model:checked="cloneRecursive">递归克隆子模块 (--recursive)</NCheckbox>
          <NCheckbox v-model:checked="cloneSingleBranch">只克隆单分支 (--single-branch)</NCheckbox>
        </div>
      </div>
    </template>

    <template v-else-if="scene === 'merge'">
      <div class="tool-panel-grid">
        <div class="tool-form-stack">
          <NInput v-model:value="mergeBranch" placeholder="feature/awesome-branch" />
          <NInput v-model:value="mergeMessage" placeholder="Merge branch feature/awesome-branch" />
        </div>
        <div class="tool-form-stack">
          <NCheckbox v-model:checked="mergeNoFf">禁用快进 (--no-ff)</NCheckbox>
          <NCheckbox v-model:checked="mergeSquash">压缩合并 (--squash)</NCheckbox>
        </div>
      </div>
    </template>

    <template v-else-if="scene === 'stash'">
      <div class="tool-panel-grid">
        <div class="tool-form-stack">
          <NSelect v-model:value="stashAction" :options="stashActionOptions" />
          <NInput v-model:value="stashMessage" placeholder="WIP: split advanced command panels" />
          <NInputNumber v-model:value="stashIndex" clearable placeholder="0" />
        </div>
        <div class="tool-form-stack">
          <NCheckbox v-model:checked="stashKeepIndex" :disabled="stashAction !== 'save'">
            save 时保留暂存区 (--keep-index)
          </NCheckbox>
        </div>
      </div>
    </template>

    <template v-else-if="scene === 'rebase'">
      <div class="tool-panel-grid">
        <div class="tool-form-stack">
          <NInput v-model:value="rebaseBranch" placeholder="main" />
          <NInput v-model:value="rebaseOnto" placeholder="release/2026.04 (可选)" />
        </div>
        <div class="tool-form-stack">
          <NCheckbox v-model:checked="rebaseInteractive">交互式变基 (-i)</NCheckbox>
        </div>
      </div>
    </template>

    <template v-else-if="scene === 'cherry-pick'">
      <div class="tool-panel-grid">
        <div class="tool-form-stack">
          <NInput
            v-model:value="cherryPickCommits"
            type="textarea"
            :autosize="{ minRows: 4, maxRows: 8 }"
            placeholder="abc1234 def5678"
          />
          <NInputNumber
            v-model:value="cherryPickMainline"
            clearable
            placeholder="mainline (merge commit 才需要)"
          />
        </div>
        <div class="tool-form-stack">
          <NCheckbox v-model:checked="cherryPickNoCommit">不自动提交 (-n)</NCheckbox>
          <NCheckbox v-model:checked="cherryPickEdit">编辑提交消息 (-e)</NCheckbox>
          <NCheckbox v-model:checked="cherryPickSignoff">添加 signoff (-s)</NCheckbox>
        </div>
      </div>
    </template>

    <template v-else-if="scene === 'tag'">
      <div class="tool-panel-grid">
        <div class="tool-form-stack">
          <NSelect v-model:value="tagAction" :options="tagActionOptions" />
          <NInput v-model:value="tagName" placeholder="v1.2.3" />
          <NInput v-model:value="tagMessage" placeholder="release: stable delivery" />
          <NInput v-model:value="tagRemote" placeholder="origin" />
        </div>
        <div class="tool-form-stack">
          <NCheckbox v-model:checked="tagAnnotate" :disabled="tagAction !== 'create'">
            创建附注标签 (-a)
          </NCheckbox>
          <NCheckbox v-model:checked="tagForce" :disabled="tagAction !== 'push'">
            推送时强制覆盖 (-f)
          </NCheckbox>
        </div>
      </div>
    </template>

    <template v-else-if="scene === 'remote'">
      <div class="tool-panel-grid">
        <NSelect v-model:value="remoteAction" :options="remoteActionOptions" />
        <div class="tool-form-stack">
          <NInput v-model:value="remoteName" placeholder="origin" />
          <NInput
            v-model:value="remoteValue"
            :placeholder="
              remoteAction === 'rename' ? 'new-origin' : 'https://github.com/user/repo.git'
            "
          />
        </div>
      </div>
    </template>

    <template v-else>
      <div class="tool-panel-grid">
        <div class="tool-form-stack">
          <NInput
            v-model:value="revertCommits"
            type="textarea"
            :autosize="{ minRows: 4, maxRows: 8 }"
            placeholder="abc1234 def5678"
          />
          <NInputNumber
            v-model:value="revertMainline"
            clearable
            placeholder="mainline (merge commit 才需要)"
          />
        </div>
        <div class="tool-form-stack">
          <NCheckbox v-model:checked="revertNoCommit">不自动提交 (-n)</NCheckbox>
          <NCheckbox v-model:checked="revertNoEdit">使用默认消息 (--no-edit)</NCheckbox>
          <NCheckbox v-model:checked="revertEdit" :disabled="revertNoEdit">编辑消息 (-e)</NCheckbox>
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
