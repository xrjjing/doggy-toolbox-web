<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { NButton, NCard, NCheckbox, NInput, NSpace, NTag, useMessage } from 'naive-ui'
import type { AiFeatureModuleId } from '@shared/ipc-contract'
import { useAiStore } from '@renderer/stores/ai'
import { useAiSettingsStore } from '@renderer/stores/ai-settings'
import { useAppStore } from '@renderer/stores/app'

/**
 * 旧项目的 ai-settings 里，一半是 Provider CRUD，一半是工具 AI 开关。
 * 新仓已经改为“只走本机 Codex / Claude SDK”，所以这里不再做 HTTPS Provider 管理，
 * 而是保留真正还对用户有价值的两类控制：
 * 1. 本机 SDK 运行时事实查看。
 * 2. 工具级 AI 开关与默认工作目录/提示词配置。
 */
const message = useMessage()
const aiStore = useAiStore()
const aiSettingsStore = useAiSettingsStore()
const appStore = useAppStore()

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
    label: '网络与节点',
    items: [
      { id: 'http', label: 'HTTP 集合请求分析' },
      { id: 'nodes', label: '节点资料解释' }
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

function toggleAllTools(value: boolean): void {
  aiSettingsStore.setDraft('globalEnabled', value)
  featureGroups
    .flatMap((group) => group.items)
    .forEach((tool) => {
      aiSettingsStore.setFeature(tool.id, value)
    })
}

async function saveSettings(): Promise<void> {
  try {
    await aiSettingsStore.save()
    message.success(
      'AI 设置已保存到本地资料库。新仓仍坚持本机 SDK 路线，不创建额外 HTTPS Provider。'
    )
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
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
          <NTag size="small" :bordered="false">SDK Only</NTag>
        </div>
      </template>

      <p class="muted">
        新仓不再维护旧项目那套第三方 HTTPS Provider 列表，这里只保留本机 Codex / Claude SDK
        的真实可用配置和模块级开关，并把默认配置持久化到本地资料库。
      </p>

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
        <section>
          <p class="eyebrow">codex</p>
          <div class="chip-list">
            <span v-for="fact in codexFacts" :key="`codex-${fact.label}`" class="chip">
              {{ fact.label }}={{ fact.value }}
            </span>
            <span v-if="codexFacts.length === 0" class="chip">未检测到更多配置事实</span>
          </div>
        </section>
        <section>
          <p class="eyebrow">claude</p>
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
