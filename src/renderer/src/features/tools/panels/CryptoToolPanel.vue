<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  NButton,
  NCheckbox,
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
  decryptWithSymmetricCrypto,
  describeCryptoKey,
  encryptWithSymmetricCrypto,
  type AesKeySize,
  type CryptoCipherFormat,
  type CryptoCipherInputFormat,
  type SymmetricCryptoAlgorithm
} from '../utils/core-crypto'

const emit = defineEmits<{
  snapshot: [snapshot: ToolPanelSnapshot]
}>()

const message = useMessage()
const mode = ref<'encrypt' | 'decrypt'>('encrypt')
const algorithm = ref<SymmetricCryptoAlgorithm>('aes')
const aesKeySize = ref<AesKeySize>(128)
const autoAdjustKey = ref(true)
const outputFormat = ref<CryptoCipherFormat>('base64')
const inputFormat = ref<CryptoCipherInputFormat>('auto')
const keyText = ref('')
const input = ref('')
const output = ref('')
const extra = ref('')

const algorithmOptions = [
  { label: 'AES', value: 'aes' },
  { label: 'DES', value: 'des' }
]

const aesKeySizeOptions = [
  { label: '128', value: 128 },
  { label: '256', value: 256 }
]

const outputFormatOptions = [
  { label: 'Base64', value: 'base64' },
  { label: 'Hex', value: 'hex' }
]

const inputFormatOptions = [
  { label: '自动识别', value: 'auto' },
  { label: 'Base64', value: 'base64' },
  { label: 'Hex', value: 'hex' }
]

const keyInfo = computed(() =>
  describeCryptoKey(algorithm.value, aesKeySize.value, keyText.value, autoAdjustKey.value)
)

function emitSnapshot(): void {
  emit('snapshot', {
    input: [
      `模式: ${mode.value}`,
      `算法: ${algorithm.value}`,
      `输入:`,
      input.value,
      `key:`,
      keyText.value
    ].join('\n'),
    output: output.value,
    extra: extra.value
  })
}

function runCrypto(): void {
  try {
    if (!input.value.trim()) {
      throw new Error(mode.value === 'encrypt' ? '请输入要加密的明文' : '请输入要解密的密文')
    }

    if (mode.value === 'encrypt') {
      const result = encryptWithSymmetricCrypto({
        algorithm: algorithm.value,
        aesKeySize: aesKeySize.value,
        autoAdjustKey: autoAdjustKey.value,
        keyText: keyText.value,
        plainText: input.value,
        outputFormat: outputFormat.value
      })
      output.value = result.output
      extra.value = [
        `模式: 加密`,
        `算法: ${algorithm.value.toUpperCase()}-ECB-PKCS7`,
        `输出格式: ${result.format}`,
        `明文字节: ${result.inputBytes}`,
        `密文字节: ${result.outputBytes}`,
        `key 字节: ${result.keyLength}`,
        keyInfo.value.hint
      ].join('\n')
    } else {
      const result = decryptWithSymmetricCrypto({
        algorithm: algorithm.value,
        aesKeySize: aesKeySize.value,
        autoAdjustKey: autoAdjustKey.value,
        keyText: keyText.value,
        cipherText: input.value,
        inputFormat: inputFormat.value
      })
      output.value = result.output
      extra.value = [
        `模式: 解密`,
        `算法: ${algorithm.value.toUpperCase()}-ECB-PKCS7`,
        `输入格式: ${result.resolvedInputFormat}`,
        `密文字节: ${result.inputBytes}`,
        `明文字节: ${result.outputBytes}`,
        `key 字节: ${result.keyLength}`,
        keyInfo.value.hint
      ].join('\n')
    }
    emitSnapshot()
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

function clearPanel(): void {
  input.value = ''
  output.value = ''
  extra.value = ''
  keyText.value = ''
  emitSnapshot()
}

function fillExample(): void {
  mode.value = 'encrypt'
  algorithm.value = 'aes'
  aesKeySize.value = 128
  autoAdjustKey.value = true
  keyText.value = '1234567890abcdef'
  input.value = 'doggy-toolbox'
  outputFormat.value = 'base64'
  runCrypto()
}

async function copyOutput(): Promise<void> {
  if (!output.value) return
  try {
    await navigator.clipboard.writeText(output.value)
    message.success('加解密输出已复制')
  } catch {
    message.error('当前环境无法直接写入剪贴板')
  }
}
</script>

<template>
  <section class="tool-panel-shell">
    <div class="tool-panel-header">
      <div>
        <p class="eyebrow">高级面板</p>
        <h3>对称加密（AES / DES）</h3>
      </div>
      <NTag size="small" :bordered="false">ECB / PKCS7</NTag>
    </div>

    <p class="muted">
      这块直接迁旧项目的浏览器端 AES / DES ECB + PKCS7 实现，保留 Base64 / Hex、自动 key
      长度处理，以及解密时的输入格式自动识别。
    </p>

    <div class="tool-panel-actions tool-panel-actions--wrap">
      <NRadioGroup v-model:value="mode">
        <NRadioButton value="encrypt">加密</NRadioButton>
        <NRadioButton value="decrypt">解密</NRadioButton>
      </NRadioGroup>
      <NSelect v-model:value="algorithm" :options="algorithmOptions" class="tool-inline-select" />
      <NSelect
        v-if="algorithm === 'aes'"
        v-model:value="aesKeySize"
        :options="aesKeySizeOptions"
        class="tool-inline-select"
      />
      <NButton secondary @click="fillExample">填充示例</NButton>
      <NButton tertiary @click="clearPanel">清空</NButton>
    </div>

    <div class="tool-panel-actions tool-panel-actions--wrap">
      <NCheckbox v-model:checked="autoAdjustKey">自动调整 key 长度</NCheckbox>
      <NSelect
        v-if="mode === 'encrypt'"
        v-model:value="outputFormat"
        :options="outputFormatOptions"
        class="tool-inline-select"
      />
      <NSelect
        v-else
        v-model:value="inputFormat"
        :options="inputFormatOptions"
        class="tool-inline-select"
      />
    </div>

    <NInput v-model:value="keyText" placeholder="输入 key（UTF-8）" />

    <div class="chip-list">
      <span class="chip">算法：{{ algorithm.toUpperCase() }}</span>
      <span class="chip">目标 key：{{ keyInfo.targetLength }} 字节</span>
      <span class="chip">当前 key：{{ keyInfo.inputLength }} 字节</span>
    </div>

    <p class="muted">{{ keyInfo.hint }}</p>

    <NInput
      v-model:value="input"
      type="textarea"
      :autosize="{ minRows: 5, maxRows: 10 }"
      :placeholder="mode === 'encrypt' ? '输入明文（UTF-8）...' : '输入密文（Base64 / Hex）...'"
    />

    <NSpace>
      <NButton type="primary" @click="runCrypto">执行</NButton>
      <NButton secondary :disabled="!output" @click="copyOutput">复制输出</NButton>
    </NSpace>

    <div class="tool-output-grid">
      <section>
        <p class="eyebrow">处理结果</p>
        <pre class="stream-output">{{ output || '等待执行结果...' }}</pre>
      </section>
      <section>
        <p class="eyebrow">运行摘要</p>
        <pre class="stream-output">{{
          extra || '这里显示模式、算法、格式、字节数和 key 处理摘要。'
        }}</pre>
      </section>
    </div>
  </section>
</template>
