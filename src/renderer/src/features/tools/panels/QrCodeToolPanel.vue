<script setup lang="ts">
import { ref } from 'vue'
import { NButton, NInput, NSelect, NSpace, NStatistic, NTag, useMessage } from 'naive-ui'
import type { ToolPanelSnapshot } from '../types'
import {
  createQrSvgDataUrl,
  generateQrCode,
  getQrByteLength,
  type QrErrorLevel
} from '../utils/core-qrcode'

/**
 * 二维码高级面板。
 *
 * 这类工具已经不适合塞进统一 textarea：
 * 1. 输入区之外还有尺寸、容错等级、前景色、背景色等配置。
 * 2. 需要实时预览图片，而不是只展示文本结果。
 * 3. 工作台 AI 复核仍然需要拿到“输入 / 输出 / extra”三段上下文。
 *
 * 因此这里采用独立 panel，并通过 `emitSnapshot()` 向工作台回传最小快照。
 */
const emit = defineEmits<{
  snapshot: [snapshot: ToolPanelSnapshot]
}>()

const message = useMessage()
// 输入源文本，对应旧项目里的二维码内容输入框。
const input = ref('')
// SVG 源码保留在内存里，既用于 AI 复核，也用于复制 SVG 源码。
const svgMarkup = ref('')
// 预览使用 Data URL，避免 renderer 里额外写文件。
const previewUrl = ref('')
// extra 统一承载字节数、模块数、尺寸等摘要，给 AI 复核复用。
const extra = ref('')
const byteLength = ref(0)
const actualSize = ref(256)
const size = ref(256)
const errorLevel = ref<QrErrorLevel>('M')
const darkColor = ref('#000000')
const lightColor = ref('#ffffff')

const errorLevelOptions = [
  { label: '低 (7%)', value: 'L' },
  { label: '中 (15%)', value: 'M' },
  { label: '较高 (25%)', value: 'Q' },
  { label: '高 (30%)', value: 'H' }
]

const sizeOptions = [
  { label: '128 × 128', value: 128 },
  { label: '256 × 256', value: 256 },
  { label: '512 × 512', value: 512 },
  { label: '1024 × 1024', value: 1024 }
]

/**
 * 复杂面板不直接暴露内部 ref 给工作台。
 * 统一回传快照后，外层工作台就能沿用同一套 AI prompt 组织方式。
 */
function emitSnapshot(): void {
  emit('snapshot', {
    input: input.value,
    output: svgMarkup.value,
    extra: extra.value
  })
}

/**
 * 真正执行二维码生成的入口。
 * 这里把所有用户输入先整理成纯函数参数，再交给 utils 层完成 SVG 生成和容量计算。
 */
function runQrCode(): void {
  try {
    const result = generateQrCode(input.value, {
      size: size.value,
      errorCorrectionLevel: errorLevel.value,
      darkColor: darkColor.value,
      lightColor: lightColor.value
    })

    byteLength.value = getQrByteLength(input.value)
    actualSize.value = result.actualSize
    svgMarkup.value = result.svg
    previewUrl.value = createQrSvgDataUrl(result.svg)
    extra.value = [
      `字节数: ${result.byteLength}`,
      `模块数: ${result.moduleCount}`,
      `实际尺寸: ${result.actualSize}px`,
      `容量参考(byte): ${result.capacity.byte}`
    ].join('\n')
    emitSnapshot()
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

/**
 * 示例按钮的目的不是写测试数据，而是帮助用户快速看到颜色、尺寸和导出链路是否可用。
 */
function fillExample(): void {
  input.value = 'https://github.com/xrjjing/doggy-toolbox-web'
  runQrCode()
}

/**
 * 清空时要同时清 preview、SVG 源码和统计信息，避免旧结果残留误导用户。
 */
function clearPanel(): void {
  input.value = ''
  svgMarkup.value = ''
  previewUrl.value = ''
  extra.value = ''
  byteLength.value = 0
  actualSize.value = size.value
  emitSnapshot()
}

/**
 * 复制 SVG 源码而不是复制 Data URL，是为了让用户后续能继续编辑或落到文档里。
 */
async function copySvgMarkup(): Promise<void> {
  if (!svgMarkup.value) return
  try {
    await navigator.clipboard.writeText(svgMarkup.value)
    message.success('SVG 源码已复制')
  } catch {
    message.error('当前环境无法直接写入剪贴板')
  }
}

/**
 * 复制图片依赖浏览器剪贴板图片能力。
 * Electron renderer 在不同平台/权限下不一定稳定，因此这里保留失败提示而不静默吞掉。
 */
async function copyImage(): Promise<void> {
  if (!previewUrl.value || typeof ClipboardItem === 'undefined') {
    message.warning('当前环境暂不支持直接复制图片，可先复制 SVG 源码')
    return
  }

  try {
    const blob = await fetch(previewUrl.value).then((response) => response.blob())
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
    message.success('二维码图片已复制到剪贴板')
  } catch {
    message.error('复制图片失败，请改用下载或复制 SVG')
  }
}

/**
 * 当前版本先下载 SVG。
 * 这是有意的轻量替代：SVG 导出稳定、无额外位图编码成本，后续如需 PNG 可再补 rasterize 步骤。
 */
function downloadSvg(): void {
  if (!previewUrl.value) return
  const link = document.createElement('a')
  link.href = previewUrl.value
  link.download = 'qrcode.svg'
  link.click()
}
</script>

<template>
  <section class="tool-panel-shell">
    <div class="tool-panel-header">
      <div>
        <p class="eyebrow">advanced panel</p>
        <h3>二维码生成</h3>
      </div>
      <NTag size="small" :bordered="false">SVG / PNG</NTag>
    </div>

    <p class="muted">
      这块沿用旧项目的浏览器端生成思路，但新仓先以 SVG 作为主预览格式，桌面端更稳定。
    </p>

    <NInput
      v-model:value="input"
      type="textarea"
      :autosize="{ minRows: 5, maxRows: 10 }"
      placeholder="输入文本、URL 或其他二维码内容"
    />

    <div class="tool-panel-grid">
      <NSelect v-model:value="size" :options="sizeOptions" />
      <NSelect v-model:value="errorLevel" :options="errorLevelOptions" />
    </div>

    <div class="tool-panel-grid tool-panel-grid--colors">
      <label class="tool-color-field">
        <span>前景色</span>
        <input v-model="darkColor" type="color" />
      </label>
      <label class="tool-color-field">
        <span>背景色</span>
        <input v-model="lightColor" type="color" />
      </label>
    </div>

    <div class="tool-panel-actions">
      <NButton type="primary" @click="runQrCode">生成二维码</NButton>
      <NButton secondary @click="fillExample">填充示例</NButton>
      <NButton tertiary @click="clearPanel">清空</NButton>
    </div>

    <div class="tool-panel-stats">
      <NStatistic label="字节数" :value="byteLength" />
      <NStatistic label="当前尺寸" :value="`${actualSize}px`" />
    </div>

    <div class="tool-preview-frame tool-preview-frame--center">
      <img v-if="previewUrl" :src="previewUrl" alt="二维码预览" class="tool-preview-image" />
      <div v-else class="tool-preview-placeholder">生成后在这里预览二维码</div>
    </div>

    <NSpace>
      <NButton secondary :disabled="!previewUrl" @click="downloadSvg">下载 SVG</NButton>
      <NButton secondary :disabled="!svgMarkup" @click="copySvgMarkup">复制 SVG</NButton>
      <NButton secondary :disabled="!previewUrl" @click="copyImage">复制图片</NButton>
    </NSpace>

    <pre class="stream-output">{{ extra || '这里显示二维码尺寸、容量和生成结果摘要。' }}</pre>
  </section>
</template>
