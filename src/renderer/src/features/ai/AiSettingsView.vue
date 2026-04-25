<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NButton, NCard, NCheckbox, NInput, NSpace, NTag, useMessage } from 'naive-ui'
import type { AiFeatureModuleId, AiProviderKind, AiSdkRuntimeState } from '@shared/ipc-contract'
import { useAiStore } from '@renderer/stores/ai'
import { useAiSettingsStore } from '@renderer/stores/ai-settings'
import { describeRuntimeHealth, useAppStore } from '@renderer/stores/app'

/**
 * 旧项目的 ai-settings 里，一半是 Provider CRUD，一半是工具 AI 开关。
 * 新仓现在进一步收口成两部分：
 * 1. AI 模块开关与默认提示词。
 * 2. Codex / Claude SDK runtime 的按需安装、更新、卸载。
 */
const message = useMessage()
const aiStore = useAiStore()
const aiSettingsStore = useAiSettingsStore()
const appStore = useAppStore()
const sdkRuntimeState = ref<AiSdkRuntimeState | null>(null)
const runtimeBusyMap = ref<Record<AiProviderKind, boolean>>({
  codex: false,
  'claude-code': false
})

type FeatureGroup = {
  key: 'tooling' | 'workspace' | 'network'
  label: string
  items: Array<{
    id: AiFeatureModuleId
    label: string
  }>
}

const featureGroups: FeatureGroup[] = [
  {
    key: 'tooling',
    label: '工具面板',
    items: [
      { id: 'tools', label: '工具工作台 AI 复核' },
      { id: 'ai-chat', label: 'AI Bridge 主对话台' }
    ]
  },
  {
    key: 'workspace',
    label: '本地资料模块',
    items: [
      { id: 'commands', label: '命令管理说明生成' },
      { id: 'prompts', label: 'Prompt 模板润色' }
    ]
  },
  {
    key: 'network',
    label: '网络模块',
    items: [
      { id: 'http', label: 'HTTP 集合请求分析' }
    ]
  }
]

const groupedTools = computed(() => {
  return featureGroups.map((group) => ({
    key: group.key,
    label: group.label,
    items: group.items.map((item) => ({
      ...item,
      enabled: aiSettingsStore.draft.features[item.id]
    }))
  }))
})

const codexFacts = computed(() => appStore.runtimeInfo?.codex.facts ?? [])
const claudeFacts = computed(() => appStore.runtimeInfo?.claude.facts ?? [])
const codexStatus = computed(() => appStore.runtimeInfo?.codex ?? null)
const claudeStatus = computed(() => appStore.runtimeInfo?.claude ?? null)
const codexHealth = computed(() => describeRuntimeHealth('Codex', codexStatus.value))
const claudeHealth = computed(() => describeRuntimeHealth('Claude', claudeStatus.value))
const sdkRuntimes = computed(() => {
  const state = sdkRuntimeState.value
  return state ? [state.runtimes.codex, state.runtimes['claude-code']] : []
})

function toggleAllTools(value: boolean): void {
  aiSettingsStore.setDraft('globalEnabled', value)
  featureGroups
    .flatMap((group) => group.items)
    .forEach((tool) => {
      aiSettingsStore.setFeature(tool.id, value)
    })
}

function formatBytes(value?: number): string {
  if (!value) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = value
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

async function saveSettings(): Promise<void> {
  try {
    await aiSettingsStore.save()
    message.success('AI 设置已保存到本地资料库。')
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

async function loadSdkRuntimeState(): Promise<void> {
  sdkRuntimeState.value = await window.doggy.getAiSdkRuntimeState()
}

async function runRuntimeOperation(
  provider: AiProviderKind,
  action: 'install' | 'update' | 'uninstall'
): Promise<void> {
  runtimeBusyMap.value[provider] = true
  try {
    const result =
      action === 'install'
        ? await window.doggy.installAiSdkRuntime(provider)
        : action === 'update'
          ? await window.doggy.updateAiSdkRuntime(provider)
          : await window.doggy.uninstallAiSdkRuntime(provider)
    await loadSdkRuntimeState()
    const actionLabel = action === 'install' ? '安装' : action === 'update' ? '更新' : '卸载'
    message.success(`${result.status.label}${actionLabel}完成`)
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  } finally {
    runtimeBusyMap.value[provider] = false
  }
}

async function sendSmokePrompt(provider: 'codex' | 'claude-code'): Promise<void> {
  try {
    await aiStore.startChat({
      provider,
      moduleId: 'ai-chat',
      title: provider === 'codex' ? 'Codex 设置验证' : 'Claude 设置验证',
      workingDirectory: aiSettingsStore.draft.workingDirectory.trim() || undefined,
      prompt:
        '请用两句话确认当前 AI 设置页已经接入本机 SDK，并说明当前默认工作目录与模块开关会参与会话。'
    })
    message.success('测试会话已发送，请到右侧历史查看流式结果。')
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

onMounted(async () => {
  if (!aiSettingsStore.hasLoaded) {
    await aiSettingsStore.load()
  } else {
    aiSettingsStore.applyLoadedSettings()
  }
  await loadSdkRuntimeState()
})
</script>

<template>
  <div class="ai-settings-shell">
    <NCard class="soft-card" :bordered="false">
      <template #header>
        <div class="card-title-row">
          <div>
            <p class="eyebrow">local sdk settings</p>
            <h3>AI 设置</h3>
          </div>
          <NTag size="small" :bordered="false">SDK On Demand</NTag>
        </div>
      </template>

      <p class="muted">
        新仓默认不把 Codex / Claude SDK 打进基础安装包。GitHub
        用户下载桌面端后，只有在这里点击安装， 才会把对应 provider 的 runtime 放到本机用户数据目录。
      </p>

      <section class="ai-settings-section">
        <div class="card-title-row">
          <span>AI SDK Runtime</span>
          <NButton tertiary size="small" @click="loadSdkRuntimeState">刷新状态</NButton>
        </div>

        <div class="ai-runtime-grid">
          <article v-for="runtime in sdkRuntimes" :key="runtime.provider" class="ai-runtime-card">
            <div class="card-title-row">
              <strong>{{ runtime.label }}</strong>
              <NTag :type="runtime.installed ? 'success' : 'warning'" size="small">
                {{ runtime.installed ? '已安装' : '未安装' }}
              </NTag>
            </div>
            <p class="muted">{{ runtime.packageName }}@{{ runtime.desiredVersion }}</p>
            <div class="commands-meta">
              <strong>当前版本</strong>
              <span>{{ runtime.installedVersion || '未安装' }}</span>
              <strong>占用空间</strong>
              <span>{{ formatBytes(runtime.sizeBytes) }}</span>
              <strong>安装目录</strong>
              <span>{{ runtime.installPath }}</span>
              <strong>安装方式</strong>
              <span>{{ runtime.packageManager || '未检测' }}</span>
            </div>
            <p v-if="runtime.lastError" class="muted ai-runtime-warning">{{ runtime.lastError }}</p>
            <NSpace>
              <NButton
                size="small"
                type="primary"
                :disabled="runtime.installed"
                :loading="runtimeBusyMap[runtime.provider]"
                @click="runRuntimeOperation(runtime.provider, 'install')"
              >
                安装
              </NButton>
              <NButton
                size="small"
                secondary
                :disabled="!runtime.installed"
                :loading="runtimeBusyMap[runtime.provider]"
                @click="runRuntimeOperation(runtime.provider, 'update')"
              >
                更新
              </NButton>
              <NButton
                size="small"
                tertiary
                :disabled="!runtime.installed"
                :loading="runtimeBusyMap[runtime.provider]"
                @click="runRuntimeOperation(runtime.provider, 'uninstall')"
              >
                卸载
              </NButton>
            </NSpace>
          </article>
        </div>
      </section>

      <section class="ai-settings-section">
        <label class="appearance-modal-label">默认工作目录</label>
        <NInput
          :value="aiSettingsStore.draft.workingDirectory"
          placeholder="为空时使用当前项目目录"
          @update:value="(value) => aiSettingsStore.setDraft('workingDirectory', value)"
        />
      </section>

      <section class="ai-settings-section">
        <label class="appearance-modal-label">默认系统提示</label>
        <NInput
          :value="aiSettingsStore.draft.systemPrompt"
          type="textarea"
          :autosize="{ minRows: 4, maxRows: 8 }"
          @update:value="(value) => aiSettingsStore.setDraft('systemPrompt', value)"
        />
      </section>

      <section class="ai-settings-section">
        <div class="appearance-modal-inline">
          <label class="appearance-modal-label">全局 AI 功能</label>
          <NCheckbox
            :checked="aiSettingsStore.draft.globalEnabled"
            @update:checked="toggleAllTools"
          >
            启用所有模块的 AI 入口
          </NCheckbox>
        </div>
      </section>

      <section class="ai-settings-section">
        <div class="card-title-row">
          <span>工具级开关</span>
          <NSpace>
            <NButton tertiary @click="toggleAllTools(true)">全部启用</NButton>
            <NButton tertiary @click="toggleAllTools(false)">全部禁用</NButton>
          </NSpace>
        </div>

        <div class="ai-settings-groups">
          <article v-for="group in groupedTools" :key="group.key" class="ai-settings-group-card">
            <strong>{{ group.label }}</strong>
            <label v-for="tool in group.items" :key="tool.id" class="ai-settings-toggle-item">
              <NCheckbox
                :checked="tool.enabled"
                :disabled="!aiSettingsStore.draft.globalEnabled"
                @update:checked="(value) => aiSettingsStore.setFeature(tool.id, value)"
              />
              <span>{{ tool.label }}</span>
            </label>
          </article>
        </div>
      </section>

      <div class="commands-meta">
        <strong>Settings File</strong>
        <span>{{ aiSettingsStore.storageFile || '等待初始化' }}</span>
        <strong>最近更新</strong>
        <span>{{ aiSettingsStore.updatedAt || '尚未保存' }}</span>
      </div>

      <NSpace justify="end">
        <NButton secondary @click="sendSmokePrompt('codex')">测试 Codex</NButton>
        <NButton secondary @click="sendSmokePrompt('claude-code')">测试 Claude</NButton>
        <NButton type="primary" :loading="aiSettingsStore.saving" @click="saveSettings"
          >保存设置</NButton
        >
      </NSpace>
    </NCard>

    <NCard class="soft-card" :bordered="false">
      <template #header>
        <div class="card-title-row">
          <span>本机运行时事实</span>
          <NTag size="small" :bordered="false">runtime</NTag>
        </div>
      </template>

      <div class="ai-settings-runtime-grid">
        <section class="runtime-status-card">
          <div class="card-title-row">
            <p class="eyebrow">codex</p>
            <NTag :type="codexHealth.tone" size="small" :bordered="false">
              {{ codexHealth.headline }}
            </NTag>
          </div>
          <div class="runtime-status-copy">
            <strong>{{ codexHealth.summary }}</strong>
            <span class="muted">{{ codexStatus?.probe.message || '等待检测' }}</span>
          </div>
          <div class="commands-meta">
            <strong>本机配置</strong>
            <span>{{ codexStatus?.configDetected ? '已检测' : '未检测' }}</span>
            <strong>应用 runtime</strong>
            <span>{{ codexStatus?.runtimeInstalled ? '已安装' : '未安装' }}</span>
            <strong>最终可用</strong>
            <span>{{ codexStatus?.available ? '是' : '否' }}</span>
          </div>
          <div class="chip-list">
            <span v-for="chip in codexHealth.chips" :key="`codex-chip-${chip}`" class="chip">
              {{ chip }}
            </span>
          </div>
          <div class="chip-list">
            <span v-for="fact in codexFacts" :key="`codex-${fact.label}`" class="chip">
              {{ fact.label }}={{ fact.value }}
            </span>
            <span v-if="codexFacts.length === 0" class="chip">未检测到更多配置事实</span>
          </div>
        </section>
        <section class="runtime-status-card">
          <div class="card-title-row">
            <p class="eyebrow">claude</p>
            <NTag :type="claudeHealth.tone" size="small" :bordered="false">
              {{ claudeHealth.headline }}
            </NTag>
          </div>
          <div class="runtime-status-copy">
            <strong>{{ claudeHealth.summary }}</strong>
            <span class="muted">{{ claudeStatus?.probe.message || '等待检测' }}</span>
          </div>
          <div class="commands-meta">
            <strong>本机配置</strong>
            <span>{{ claudeStatus?.configDetected ? '已检测' : '未检测' }}</span>
            <strong>应用 runtime</strong>
            <span>{{ claudeStatus?.runtimeInstalled ? '已安装' : '未安装' }}</span>
            <strong>最终可用</strong>
            <span>{{ claudeStatus?.available ? '是' : '否' }}</span>
          </div>
          <div class="chip-list">
            <span v-for="chip in claudeHealth.chips" :key="`claude-chip-${chip}`" class="chip">
              {{ chip }}
            </span>
          </div>
          <div class="chip-list">
            <span v-for="fact in claudeFacts" :key="`claude-${fact.label}`" class="chip">
              {{ fact.label }}={{ fact.value }}
            </span>
            <span v-if="claudeFacts.length === 0" class="chip">未检测到更多配置事实</span>
          </div>
        </section>
      </div>
    </NCard>
  </div>
</template>
