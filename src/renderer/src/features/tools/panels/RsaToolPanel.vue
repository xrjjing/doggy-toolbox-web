<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  NButton,
  NInput,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSpace,
  NTag,
  useMessage
} from 'naive-ui'
import type { ToolPanelSnapshot } from '../types'
import {
  decryptWithRsa,
  encryptWithRsa,
  generateRsaKeyPair,
  validatePrivateKeyPem,
  validatePublicKeyPem,
  type RsaCipherFormat
} from '../utils/core-rsa'

/**
 * RSA 高级面板。
 *
 * 和简单工具不同，这里同时维护：
 * 1. 加密/解密模式。
 * 2. 公钥/私钥两套输入。
 * 3. 输出格式、密钥生成、PEM 校验等状态。
 *
 * 因此它必须独立成高级面板，并通过 snapshot 接口把关键信息回传给工作台。
 */
const emit = defineEmits<{
  snapshot: [snapshot: ToolPanelSnapshot]
}>()

const message = useMessage()
const mode = ref<'encrypt' | 'decrypt'>('encrypt')
const keySize = ref(2048)
const cipherFormat = ref<RsaCipherFormat>('base64')
const publicKey = ref('')
const privateKey = ref('')
const input = ref('')
const output = ref('')
const extra = ref('')

const keySizeOptions = [
  { label: '2048 位', value: 2048 },
  { label: '4096 位', value: 4096 }
]

const formatOptions = [
  { label: 'Base64', value: 'base64' },
  { label: 'Hex', value: 'hex' }
]

// 实时校验 PEM 的目的，是让用户在点执行前就知道密钥文本形态是否正确。
const publicKeyState = computed(() => validatePublicKeyPem(publicKey.value))
const privateKeyState = computed(() => validatePrivateKeyPem(privateKey.value))

/**
 * 这里的 input 不只包含正文，还会把模式和密钥片段一起交给 AI 复核。
 * 这样工具页 AI 才能解释“为什么当前解密失败/为什么 PEM 形态不对”。
 */
function emitSnapshot(): void {
  emit('snapshot', {
    input: [mode.value, input.value, publicKey.value, privateKey.value]
      .filter(Boolean)
      .join('\n---\n'),
    output: output.value,
    extra: extra.value
  })
}

/**
 * 密钥生成和加解密分开处理：
 * - createKeyPair 只负责生成并回填密钥文本。
 * - runRsa 才负责真正的业务运算。
 */
async function createKeyPair(): Promise<void> {
  try {
    const result = await generateRsaKeyPair(keySize.value)
    publicKey.value = result.publicKey
    privateKey.value = result.privateKey
    extra.value = `已生成 ${keySize.value} 位 RSA-OAEP (SHA-256) 密钥对`
    emitSnapshot()
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

/**
 * 执行入口会根据模式选择公钥加密或私钥解密。
 * 同时把当前密钥校验摘要写进 extra，方便用户和 AI 一起排查失败原因。
 */
async function runRsa(): Promise<void> {
  try {
    if (!input.value.trim()) {
      throw new Error(mode.value === 'encrypt' ? '请输入要加密的明文' : '请输入要解密的密文')
    }

    if (mode.value === 'encrypt') {
      if (!publicKey.value.trim()) {
        throw new Error('请输入公钥')
      }
      output.value = await encryptWithRsa(input.value, publicKey.value, cipherFormat.value)
    } else {
      if (!privateKey.value.trim()) {
        throw new Error('请输入私钥')
      }
      output.value = await decryptWithRsa(input.value, privateKey.value, cipherFormat.value)
    }

    extra.value = [
      `模式: ${mode.value === 'encrypt' ? '加密' : '解密'}`,
      `格式: ${cipherFormat.value}`,
      `公钥校验: ${publicKeyState.value.valid ? '通过' : publicKeyState.value.error || '未填写'}`,
      `私钥校验: ${privateKeyState.value.valid ? '通过' : privateKeyState.value.error || '未填写'}`
    ].join('\n')
    emitSnapshot()
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

/**
 * RSA 面板的“清空”语义是彻底回到初始态。
 * 旧输出、旧密钥、旧校验摘要都不保留，避免误把历史密钥继续用于下一轮操作。
 */
function clearPanel(): void {
  input.value = ''
  output.value = ''
  extra.value = ''
  publicKey.value = ''
  privateKey.value = ''
  emitSnapshot()
}

/**
 * 输出通常用于二次复制到接口测试或其他系统，因此直接提供复制按钮。
 */
async function copyOutput(): Promise<void> {
  if (!output.value) return
  try {
    await navigator.clipboard.writeText(output.value)
    message.success('RSA 输出已复制')
  } catch {
    message.error('当前环境无法直接写入剪贴板')
  }
}
</script>

<template>
  <section class="tool-panel-shell">
    <div class="tool-panel-header">
      <div>
        <p class="eyebrow">advanced panel</p>
        <h3>RSA 加解密</h3>
      </div>
      <NTag size="small" :bordered="false">RSA-OAEP</NTag>
    </div>

    <p class="muted">
      新仓沿用旧项目的浏览器端 RSA 路线，使用 Web Crypto API 做 RSA-OAEP(SHA-256) 密钥生成和加解密。
    </p>

    <div class="tool-panel-actions tool-panel-actions--wrap">
      <NRadioGroup v-model:value="mode">
        <NRadioButton value="encrypt">加密</NRadioButton>
        <NRadioButton value="decrypt">解密</NRadioButton>
      </NRadioGroup>
      <NSelect v-model:value="keySize" :options="keySizeOptions" class="tool-inline-select" />
      <NSelect v-model:value="cipherFormat" :options="formatOptions" class="tool-inline-select" />
      <NButton secondary @click="createKeyPair">生成密钥对</NButton>
      <NButton tertiary @click="clearPanel">清空</NButton>
    </div>

    <div class="tool-panel-grid">
      <NInput
        v-model:value="publicKey"
        type="textarea"
        :autosize="{ minRows: 6, maxRows: 12 }"
        placeholder="-----BEGIN PUBLIC KEY-----"
      />
      <NInput
        v-model:value="privateKey"
        type="textarea"
        :autosize="{ minRows: 6, maxRows: 12 }"
        placeholder="-----BEGIN PRIVATE KEY-----"
      />
    </div>

    <div class="chip-list">
      <span class="chip"
        >公钥：{{ publicKeyState.valid ? '有效' : publicKeyState.error || '未填写' }}</span
      >
      <span class="chip"
        >私钥：{{ privateKeyState.valid ? '有效' : privateKeyState.error || '未填写' }}</span
      >
    </div>

    <NInput
      v-model:value="input"
      type="textarea"
      :autosize="{ minRows: 5, maxRows: 10 }"
      :placeholder="mode === 'encrypt' ? '输入明文...' : '输入 Base64/Hex 密文...'"
    />

    <NSpace>
      <NButton type="primary" @click="runRsa">执行</NButton>
      <NButton secondary :disabled="!output" @click="copyOutput">复制输出</NButton>
    </NSpace>

    <div class="tool-output-grid">
      <section>
        <p class="eyebrow">result</p>
        <pre class="stream-output">{{ output || '等待执行结果...' }}</pre>
      </section>
      <section>
        <p class="eyebrow">extra</p>
        <pre class="stream-output">{{ extra || '这里显示密钥校验和当前模式摘要。' }}</pre>
      </section>
    </div>
  </section>
</template>
