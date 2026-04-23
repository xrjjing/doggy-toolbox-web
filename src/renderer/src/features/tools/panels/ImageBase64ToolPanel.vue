<script setup lang="ts">
import { ref } from 'vue'
import { NButton, NCheckbox, NInput, NTag, useMessage } from 'naive-ui'
import type { ToolPanelSnapshot } from '../types'
import {
  ensureImageDataUri,
  formatImageFileSize,
  getImageExtensionFromMimeType,
  getImageMimeTypeFromFilename,
  getOriginalImageSizeFromBase64,
  isSupportedImageMimeType
} from '../utils/core-image-base64'

type LocalImageInfo = {
  name: string
  mimeType: string
  width: number
  height: number
  sizeLabel: string
}

/**
 * 图片 Base64 高级面板。
 *
 * 这个面板承接旧项目里“图片 <-> Base64/Data URI”双向转换的复杂交互：
 * 1. 支持从本地文件读取。
 * 2. 支持直接粘贴 Base64 / Data URI。
 * 3. 支持实时预览、复制结果和重新下载图片。
 *
 * 因为有文件输入、预览和模式切换，所以不再适合放进统一 textarea 工作台。
 */
const emit = defineEmits<{
  snapshot: [snapshot: ToolPanelSnapshot]
}>()

const message = useMessage()
// includePrefix 用来切换输出是“纯 Base64”还是“完整 Data URI”。
const includePrefix = ref(true)
const outputText = ref('')
const base64Input = ref('')
const previewUrl = ref('')
const imageInfo = ref<LocalImageInfo | null>(null)
// currentDataUri 始终保存当前图片的完整 Data URI，便于在不同输出模式之间切换。
const currentDataUri = ref('')

/**
 * 回传给工作台的 input/output/extra 只保留 AI 复核真正关心的字段，
 * 不把 Image 对象或 File 对象这类不可序列化状态暴露出去。
 */
function emitSnapshot(): void {
  emit('snapshot', {
    input:
      base64Input.value ||
      (imageInfo.value ? `${imageInfo.value.name}\n${imageInfo.value.mimeType}` : ''),
    output: outputText.value,
    extra: imageInfo.value
      ? `${imageInfo.value.width}x${imageInfo.value.height}\n${imageInfo.value.sizeLabel}\n${imageInfo.value.mimeType}`
      : ''
  })
}

/**
 * 统一填充预览区元信息。
 * 无论数据来源是本地文件还是用户粘贴 Base64，最后都走到这一层，避免两套尺寸/大小计算逻辑分叉。
 */
async function setPreviewInfo(dataUri: string, name: string, mimeType: string): Promise<void> {
  const image = new Image()
  const base64 = ensureImageDataUri(dataUri).base64
  const size = getOriginalImageSizeFromBase64(base64)

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('图片预览失败'))
    image.src = dataUri
  })

  previewUrl.value = dataUri
  imageInfo.value = {
    name,
    mimeType,
    width: image.naturalWidth,
    height: image.naturalHeight,
    sizeLabel: formatImageFileSize(size)
  }
}

/**
 * 文件选择链路只负责三件事：
 * 1. 校验类型和大小。
 * 2. 用 FileReader 读取成 Data URI。
 * 3. 更新统一预览状态。
 */
async function handleFileChange(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (!file) return

  try {
    const mimeType = file.type || getImageMimeTypeFromFilename(file.name) || ''
    if (!isSupportedImageMimeType(mimeType)) {
      throw new Error('不支持的图片格式，请选择 PNG/JPG/GIF/WebP/SVG/BMP/ICO')
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error(`图片过大（${formatImageFileSize(file.size)}），最大支持 5MB`)
    }

    const dataUri = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('文件读取失败'))
      reader.readAsDataURL(file)
    })

    currentDataUri.value = dataUri
    outputText.value = includePrefix.value ? dataUri : ensureImageDataUri(dataUri).base64
    base64Input.value = ''
    await setPreviewInfo(dataUri, file.name, mimeType)
    emitSnapshot()
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

/**
 * 手工粘贴 Base64 / Data URI 时，先归一化成完整 Data URI，再复用预览链路。
 */
async function renderBase64Preview(): Promise<void> {
  try {
    const resolved = ensureImageDataUri(base64Input.value)
    currentDataUri.value = resolved.dataUri
    outputText.value = includePrefix.value ? resolved.dataUri : resolved.base64
    await setPreviewInfo(
      resolved.dataUri,
      `image.${getImageExtensionFromMimeType(resolved.mimeType)}`,
      resolved.mimeType
    )
    emitSnapshot()
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

/**
 * 清空时必须同时丢掉原始 Data URI，否则切换输出模式时可能重新把旧图写回结果框。
 */
function clearPanel(): void {
  outputText.value = ''
  base64Input.value = ''
  previewUrl.value = ''
  imageInfo.value = null
  currentDataUri.value = ''
  emitSnapshot()
}

/**
 * 切换输出模式时不重新读取文件，而是基于 currentDataUri 做纯文本变换。
 * 这样可以避免每次勾选都重新触发图片解码。
 */
function syncOutputMode(value: boolean): void {
  includePrefix.value = value
  if (!currentDataUri.value) return
  const resolved = ensureImageDataUri(currentDataUri.value)
  outputText.value = value ? resolved.dataUri : resolved.base64
  emitSnapshot()
}

/**
 * 图片转换类工具最常见的下一步就是贴到接口文档或 HTML/CSS 里，所以复制文本是默认动作。
 */
async function copyOutput(): Promise<void> {
  if (!outputText.value) return
  try {
    await navigator.clipboard.writeText(outputText.value)
    message.success('输出内容已复制')
  } catch {
    message.error('当前环境无法直接写入剪贴板')
  }
}

/**
 * 下载时直接复用当前预览 URL。
 * 这样即使输入源来自粘贴的 Base64，也能重新落回图片文件。
 */
function downloadImage(): void {
  if (!previewUrl.value || !imageInfo.value) return
  const link = document.createElement('a')
  link.href = previewUrl.value
  link.download = imageInfo.value.name
  link.click()
}
</script>

<template>
  <section class="tool-panel-shell">
    <div class="tool-panel-header">
      <div>
        <p class="eyebrow">advanced panel</p>
        <h3>图片 Base64</h3>
      </div>
      <NTag size="small" :bordered="false">Data URI</NTag>
    </div>

    <p class="muted">
      这块把旧项目的图片转 Base64 和 Base64 反向预览合并到一个面板里，支持选择文件和直接粘贴文本。
    </p>

    <div class="tool-panel-actions tool-panel-actions--wrap">
      <label class="tool-file-trigger">
        <input type="file" accept="image/*" class="tool-file-input" @change="handleFileChange" />
        <span>选择图片</span>
      </label>
      <NCheckbox :checked="includePrefix" @update:checked="syncOutputMode">
        输出保留 `data:image/...;base64,` 前缀
      </NCheckbox>
      <NButton tertiary @click="clearPanel">清空</NButton>
    </div>

    <NInput
      v-model:value="base64Input"
      type="textarea"
      :autosize="{ minRows: 5, maxRows: 10 }"
      placeholder="粘贴图片 Base64 或完整 Data URI，点击“预览 Base64”"
    />

    <div class="tool-panel-actions">
      <NButton type="primary" @click="renderBase64Preview">预览 Base64</NButton>
      <NButton secondary :disabled="!outputText" @click="copyOutput">复制输出</NButton>
      <NButton secondary :disabled="!previewUrl" @click="downloadImage">下载图片</NButton>
    </div>

    <div class="tool-preview-frame">
      <img v-if="previewUrl" :src="previewUrl" alt="图片预览" class="tool-preview-image" />
      <div v-else class="tool-preview-placeholder">选择图片或输入 Base64 后在这里预览</div>
    </div>

    <div v-if="imageInfo" class="chip-list">
      <span class="chip">{{ imageInfo.width }} × {{ imageInfo.height }}</span>
      <span class="chip">{{ imageInfo.sizeLabel }}</span>
      <span class="chip">{{ imageInfo.mimeType }}</span>
    </div>

    <NInput
      :value="outputText"
      type="textarea"
      readonly
      :autosize="{ minRows: 6, maxRows: 12 }"
      placeholder="这里显示 Base64 或 Data URI 输出"
    />
  </section>
</template>
