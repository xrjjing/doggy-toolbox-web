<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  NButton,
  NCard,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NPopconfirm,
  NSpace,
  NTag,
  NText,
  useMessage
} from 'naive-ui'
import type { CredentialRecord } from '@shared/ipc-contract'
import { useCredentialsStore } from '@renderer/stores/credentials'

/**
 * 凭证管理页负责 renderer 侧的交互编排，不负责真正的密码存储策略。
 *
 * 真实链路：
 * UI -> credentialsStore -> window.doggy(preload)
 * -> ipcMain.handle('credentials:*') -> CredentialService -> secret codec / repository
 *
 * 这样分层的原因是：
 * - 页面可以专注于表单、遮罩显示和复制行为。
 * - store 统一负责刷新状态与调用主进程。
 * - preload / IPC 只暴露白名单方法，renderer 不直接碰 Electron 能力。
 * - CredentialService 作为安全边界，统一处理密码编码、解码和落盘。
 */
type CredentialFormState = {
  id?: string
  service: string
  url: string
  account: string
  password: string
  extraText: string
}

const message = useMessage()
const credentialsStore = useCredentialsStore()
const modalVisible = ref(false)
// 仅控制当前页面“是否展示明文密码”，不会写回 store，也不会修改持久化记录。
const revealedIds = ref(new Set<string>())
// 表单保持字符串态，提交时再映射为 CredentialSaveInput，便于与输入框交互保持一致。
const form = reactive<CredentialFormState>({
  id: '',
  service: '',
  url: '',
  account: '',
  password: '',
  extraText: ''
})

// 顶部统计与底部元信息都来自 store snapshot，页面不再维护第二份凭证数据。
const stats = computed(() => ({
  total: credentialsStore.credentials.length,
  visible: credentialsStore.visibleCredentials.length,
  secretEncoding:
    credentialsStore.secretEncoding === 'electron-safe-storage'
      ? 'Electron safeStorage'
      : '本机明文 JSON'
}))
const isEdit = computed(() => Boolean(form.id))

function formatUpdatedAt(value: string): string {
  if (!value) return '等待首次保存'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

// 仅用于界面遮罩展示；真实密码值仍保留在卡片数据里，复制动作直接使用原值。
function maskPassword(value: string): string {
  if (!value) return '未填写'
  return '•'.repeat(Math.min(Math.max(value.length, 6), 18))
}

function isRevealed(id: string): boolean {
  return revealedIds.value.has(id)
}

// Set 需要整体替换为新实例，才能稳定触发 Vue 对集合变更的响应式更新。
function toggleReveal(id: string): void {
  const next = new Set(revealedIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  revealedIds.value = next
}

// 复制账号/密码属于纯 renderer 行为：输入是当前卡片值，输出是系统剪贴板文本。
async function copyText(value: string, label: string): Promise<void> {
  if (!value) {
    message.warning(`${label} 为空`)
    return
  }

  try {
    await navigator.clipboard.writeText(value)
    message.success(`${label} 已复制`)
  } catch {
    message.error('当前环境无法直接写入剪贴板')
  }
}

// 新建凭证时清空所有敏感字段，避免编辑态残留带入新增流程。
function openCreateModal(): void {
  form.id = ''
  form.service = ''
  form.url = ''
  form.account = ''
  form.password = ''
  form.extraText = ''
  modalVisible.value = true
}

// 编辑时把持久化记录回填为 UI 表单态，其中 extra 数组转换为多行文本。
function openEditModal(credential: CredentialRecord): void {
  form.id = credential.id
  form.service = credential.service
  form.url = credential.url
  form.account = credential.account
  form.password = credential.password
  form.extraText = credential.extra.join('\n')
  modalVisible.value = true
}

// 页面层只做最小结构映射：extraText -> extra:string[]。
// 真正的 trim、空行清理、编码和排序都由 CredentialService 统一处理。
async function submitCredential(): Promise<void> {
  try {
    await credentialsStore.saveCredential({
      id: form.id || undefined,
      service: form.service,
      url: form.url,
      account: form.account,
      password: form.password,
      extra: form.extraText.split('\n')
    })
    modalVisible.value = false
    message.success(isEdit.value ? '凭证已更新' : '凭证已新增')
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

// 删除只传 credential id；删除结果与最新快照由 store 负责重新拉取。
async function deleteCredential(credentialId: string): Promise<void> {
  try {
    const ok = await credentialsStore.removeCredential(credentialId)
    if (ok) {
      message.success('凭证已删除')
    } else {
      message.warning('未找到要删除的凭证')
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

onMounted(() => {
  // 只在首次进入时拉取数据，避免页面回切时重复请求打断当前搜索和显示态。
  if (!credentialsStore.hasLoaded) {
    void credentialsStore.load()
  }
})
</script>

<template>
  <section class="page-heading">
    <p class="eyebrow">credentials repository</p>
    <h2>凭证管理</h2>
    <p>
      从旧项目的“密码管理”模块迁移而来。当前实现先覆盖核心增删改查、搜索、复制和本地落盘，
      批量导入、拖拽排序会在 P2 的导入助手与备份恢复阶段继续补齐。
    </p>
  </section>

  <section class="commands-summary-grid">
    <article class="progress-card">
      <div class="progress-head">
        <strong>凭证总数</strong>
        <span>{{ stats.total }}</span>
      </div>
      <p>字段沿用旧项目：服务、URL、账号、密码和附加信息。</p>
    </article>
    <article class="progress-card">
      <div class="progress-head">
        <strong>当前视图</strong>
        <span>{{ stats.visible }}</span>
      </div>
      <p>支持按服务名、URL、账号、密码和附加信息搜索。</p>
    </article>
    <article class="progress-card">
      <div class="progress-head">
        <strong>密码编码</strong>
        <span>{{ stats.secretEncoding }}</span>
      </div>
      <p>Electron 环境优先使用 safeStorage；不可用时降级为本机 JSON 明文。</p>
    </article>
  </section>

  <div class="credentials-shell">
    <NCard class="soft-card commands-toolbar" :bordered="false">
      <div class="commands-toolbar-row">
        <NInput
          :value="credentialsStore.search"
          clearable
          placeholder="搜索服务名、URL、账号、密码或附加信息"
          @update:value="credentialsStore.setSearch"
        />
        <NSpace>
          <!-- 刷新会重新获取主进程解码后的凭证快照，renderer 不自行缓存独立副本。 -->
          <NButton secondary :loading="credentialsStore.loading" @click="credentialsStore.load">
            刷新
          </NButton>
          <NButton type="primary" @click="openCreateModal">新增凭证</NButton>
        </NSpace>
      </div>
    </NCard>

    <div v-if="credentialsStore.visibleCredentials.length > 0" class="credentials-grid">
      <!-- 当前卡片列表是 store 基于搜索条件派生出的可见子集。 -->
      <NCard
        v-for="credential in credentialsStore.visibleCredentials"
        :key="credential.id"
        class="soft-card credential-card"
        :bordered="false"
      >
        <template #header>
          <div class="card-title-row">
            <div>
              <strong>{{ credential.service }}</strong>
              <p class="muted">{{ credential.url || '未填写 URL' }}</p>
            </div>
            <NTag size="small" :bordered="false">#{{ credential.order + 1 }}</NTag>
          </div>
        </template>

        <div class="credential-fields">
          <div>
            <NText depth="3">账号</NText>
            <strong>{{ credential.account || '未填写' }}</strong>
          </div>
          <div>
            <NText depth="3">密码</NText>
            <strong>{{
              isRevealed(credential.id)
                ? credential.password || '未填写'
                : maskPassword(credential.password)
            }}</strong>
          </div>
        </div>

        <div v-if="credential.extra.length > 0" class="chip-list credential-extra">
          <span v-for="line in credential.extra" :key="line" class="chip">{{ line }}</span>
        </div>

        <div class="action-row">
          <NButton size="small" secondary @click="copyText(credential.account, '账号')"
            >复制账号</NButton
          >
          <NButton size="small" secondary @click="copyText(credential.password, '密码')"
            >复制密码</NButton
          >
          <NButton size="small" secondary @click="toggleReveal(credential.id)">
            {{ isRevealed(credential.id) ? '隐藏' : '显示' }}
          </NButton>
          <NButton size="small" secondary @click="openEditModal(credential)">编辑</NButton>
          <NPopconfirm @positive-click="deleteCredential(credential.id)">
            <template #trigger>
              <NButton size="small" tertiary type="error">删除</NButton>
            </template>
            删除这条凭证记录后不会自动进入备份，确定继续？
          </NPopconfirm>
        </div>
      </NCard>
    </div>

    <NCard v-else class="soft-card command-empty-card" :bordered="false">
      <NEmpty description="当前筛选条件下还没有凭证">
        <template #extra>
          <NButton type="primary" @click="openCreateModal">先创建第一条凭证</NButton>
        </template>
      </NEmpty>
    </NCard>

    <NCard class="soft-card credentials-meta-card" :bordered="false">
      <template #header>本地文件</template>
      <p class="muted">{{ credentialsStore.storageFile || '等待初始化' }}</p>
      <p class="muted">最近更新：{{ formatUpdatedAt(credentialsStore.updatedAt) }}</p>
    </NCard>
  </div>

  <NModal
    v-model:show="modalVisible"
    preset="card"
    :title="isEdit ? '编辑凭证' : '新增凭证'"
    class="form-modal command-form-modal"
  >
    <NForm>
      <!-- 表单中的多行附加信息只是输入形态，提交后会被转换为合约里的字符串数组。 -->
      <NFormItem label="服务名称">
        <NInput
          v-model:value="form.service"
          placeholder="例如：GitHub / Jenkins / 数据库测试账号"
        />
      </NFormItem>
      <NFormItem label="URL">
        <NInput v-model:value="form.url" placeholder="例如：https://github.com" />
      </NFormItem>
      <NFormItem label="账号">
        <NInput v-model:value="form.account" placeholder="登录名、邮箱或账号" />
      </NFormItem>
      <NFormItem label="密码">
        <NInput
          v-model:value="form.password"
          type="password"
          show-password-on="click"
          placeholder="密码或 Token"
        />
      </NFormItem>
      <NFormItem label="附加信息">
        <NInput
          v-model:value="form.extraText"
          type="textarea"
          :autosize="{ minRows: 4, maxRows: 8 }"
          placeholder="一行一条，例如：二次验证说明、环境、备注"
        />
      </NFormItem>
      <div class="action-row modal-actions">
        <NButton secondary @click="modalVisible = false">取消</NButton>
        <NButton type="primary" :loading="credentialsStore.saving" @click="submitCredential">
          {{ isEdit ? '保存修改' : '创建凭证' }}
        </NButton>
      </div>
    </NForm>
  </NModal>
</template>
