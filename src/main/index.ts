import { app, BrowserWindow, ipcMain, safeStorage, shell } from 'electron'
import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { AiBridgeService } from './services/ai-bridge'
import { AiChatHistoryService } from './services/ai-chat-history-service'
import { AiProviderRouter } from './services/ai-provider-router'
import { AiSdkRuntimeManager } from './services/ai-sdk-runtime-manager'
import { AiSettingsService } from './services/ai-settings-service'
import { AiSessionService } from './services/ai-session-service'
import { BackupService } from './services/backup-service'
import { ClaudeAgentBridge } from './services/claude-agent-bridge'
import { CommandService } from './services/command-service'
import { CodexSdkBridge } from './services/codex-sdk-bridge'
import {
  CredentialService,
  plainCredentialSecretCodec,
  type CredentialSecretCodec
} from './services/credential-service'
import { HttpCollectionService } from './services/http-collection-service'
import { LocalAiRuntimeService } from './services/local-ai-runtime-service'
import { PromptService } from './services/prompt-service'
import { LegacyImportService } from './services/legacy-import-service'
import { getRuntimeInfo } from './utils/runtime'
import type {
  AppAppearance,
  AiSettingsSaveInput,
  AiProviderKind,
  AiStartChatInput,
  BackupExportInput,
  BackupImportInput,
  CommandImportInput,
  CommandMoveInput,
  CommandReorderInput,
  CommandSaveInput,
  CommandTabSaveInput,
  CredentialImportInput,
  CredentialSaveInput,
  HttpBatchExecuteInput,
  HttpClearHistoryInput,
  HttpCollectionSaveInput,
  HttpEnvironmentSaveInput,
  HttpExecuteRequestInput,
  HttpRequestSaveInput,
  LegacyImportInput,
  PromptExportInput,
  PromptImportInput,
  PromptCategorySaveInput,
  PromptSaveAsTemplateInput,
  PromptTemplateReorderInput,
  PromptTemplateSaveInput,
  PromptTemplateUseInput
} from '../shared/ipc-contract'

let mainWindow: BrowserWindow | null = null
let aiBridge: AiBridgeService
let aiChatHistoryService: AiChatHistoryService
let aiSettingsService: AiSettingsService
let aiSessionService: AiSessionService
let aiRuntimeService: LocalAiRuntimeService
let aiSdkRuntimeManager: AiSdkRuntimeManager
let commandService: CommandService
let credentialService: CredentialService
let httpCollectionService: HttpCollectionService
let promptService: PromptService
let backupService: BackupService
let legacyImportService: LegacyImportService
let currentAppearance: AppAppearance | null = null

const DEFAULT_WINDOW_APPEARANCE: AppAppearance = {
  theme: 'dark',
  glassMode: false,
  glassOpacity: 60,
  uiScale: 55,
  titlebarMode: 'fixed'
}

function normalizeAppearance(input?: Partial<AppAppearance> | null): AppAppearance {
  const themes = new Set([
    'light',
    'cute',
    'office',
    'neon-light',
    'cyberpunk-light',
    'dark',
    'neon',
    'cyberpunk',
    'void'
  ])
  return {
    theme: input?.theme && themes.has(input.theme) ? input.theme : DEFAULT_WINDOW_APPEARANCE.theme,
    glassMode: Boolean(input?.glassMode),
    glassOpacity: Number.isFinite(input?.glassOpacity)
      ? Math.max(45, Math.min(95, Number(input?.glassOpacity)))
      : DEFAULT_WINDOW_APPEARANCE.glassOpacity,
    uiScale: Number.isFinite(input?.uiScale)
      ? Math.max(40, Math.min(100, Number(input?.uiScale)))
      : DEFAULT_WINDOW_APPEARANCE.uiScale,
    titlebarMode:
      input?.titlebarMode === 'minimal' ? 'minimal' : DEFAULT_WINDOW_APPEARANCE.titlebarMode
  }
}

function resolveWindowBackground(theme: AppAppearance['theme']): string {
  if (theme === 'light' || theme === 'office') return '#f5f7fb'
  if (theme === 'cute') return '#fff1f7'
  if (theme === 'neon-light') return '#ecfeff'
  if (theme === 'cyberpunk-light') return '#faf5ff'
  if (theme === 'void') return '#090805'
  if (theme === 'neon') return '#07111f'
  if (theme === 'cyberpunk') return '#13051f'
  return '#111827'
}

function applyWindowAppearance(window: BrowserWindow, appearance: AppAppearance): void {
  window.setBackgroundColor(resolveWindowBackground(appearance.theme))
  /**
   * 页面缩放改回 renderer 侧统一控制。
   * 主进程这里始终保持 1，避免 BrowserWindow 级缩放直接造成可视区留白。
   */
  window.webContents.setZoomFactor(1)

  if (process.platform === 'darwin') {
    try {
      if (appearance.glassMode) {
        window.setVibrancy(appearance.titlebarMode === 'minimal' ? 'menu' : 'under-window')
      } else {
        window.setVibrancy(null)
      }
    } catch {
      // 某些 Electron / macOS 组合对 vibrancy 支持有限，不让 UI 因此中断。
    }
    try {
      window.setWindowButtonPosition(
        appearance.titlebarMode === 'minimal' ? { x: 14, y: 10 } : { x: 16, y: 16 }
      )
    } catch {
      // 仅在支持该 API 的平台生效。
    }
  }
}

/**
 * 凭证只允许在主进程内做加解密。
 * 这里根据 Electron `safeStorage` 能力动态选择编码器，renderer 永远拿不到系统加密入口。
 */
function createCredentialSecretCodec(): CredentialSecretCodec {
  if (!safeStorage.isEncryptionAvailable()) {
    return plainCredentialSecretCodec
  }

  return {
    encoding: 'electron-safe-storage',
    encode: (value: string) => safeStorage.encryptString(value).toString('base64'),
    decode: (value: string) => safeStorage.decryptString(Buffer.from(value, 'base64'))
  }
}

/**
 * 主窗口只承载 renderer。
 * 真正的系统能力一律通过 preload + IPC 进入主进程 service，避免页面层直接接触 Node 权限。
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: '狗狗百宝箱 Web',
    backgroundColor: '#f4efe5',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    icon,
    webPreferences: {
      // 只暴露 preload 白名单 API，renderer 本身没有 Node/Electron 直连能力。
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  currentAppearance = normalizeAppearance(currentAppearance ?? DEFAULT_WINDOW_APPEARANCE)
  applyWindowAppearance(mainWindow, currentAppearance)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    if (is.dev) {
      mainWindow?.webContents.openDevTools({ mode: 'detach', activate: false })
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    // 外链统一交给系统浏览器，减少在应用内打开未知网页的安全面。
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('before-input-event', (event, input) => {
    const key = input.key.toLowerCase()
    const commandOrControl = input.meta || input.control
    const shouldToggleDevTools =
      input.type === 'keyDown' &&
      (key === 'f12' || (commandOrControl && input.shift && key === 'i'))
    const shouldReload =
      input.type === 'keyDown' && (key === 'f5' || (commandOrControl && key === 'r'))

    if (shouldToggleDevTools) {
      event.preventDefault()
      if (mainWindow?.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools()
      } else {
        mainWindow?.webContents.openDevTools({ mode: 'detach', activate: false })
      }
    }

    if (shouldReload) {
      event.preventDefault()
      mainWindow?.webContents.reloadIgnoringCache()
    }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * 主进程统一装配业务能力和 IPC 通道。
 *
 * 调用链固定为：
 * Renderer -> preload 白名单 API -> ipcMain.handle -> service -> 本地 JSON / 本机 SDK / fetch
 *
 * 这样分层的目的：
 * 1. renderer 只消费显式合约，不可任意拼 channel。
 * 2. service 可以独立做输入归一化、异常处理和持久化。
 * 3. 所有跨进程入口集中在一个文件里，方便核对真实调用链。
 */
function registerIpc(): void {
  aiChatHistoryService = new AiChatHistoryService(app.getPath('userData'))
  aiSettingsService = new AiSettingsService(app.getPath('userData'))
  aiSdkRuntimeManager = new AiSdkRuntimeManager(app.getPath('userData'))
  aiRuntimeService = new LocalAiRuntimeService(aiSdkRuntimeManager)
  const providerRouter = new AiProviderRouter(
    {
      codex: new CodexSdkBridge(aiRuntimeService, aiSdkRuntimeManager),
      'claude-code': new ClaudeAgentBridge(aiRuntimeService, aiSdkRuntimeManager)
    },
    aiRuntimeService
  )
  let bridgeEmitter: AiBridgeService | null = null
  aiSessionService = new AiSessionService(aiChatHistoryService, providerRouter, (event) =>
    bridgeEmitter?.emit(event)
  )
  aiBridge = new AiBridgeService(() => mainWindow, aiSessionService)
  bridgeEmitter = aiBridge
  commandService = new CommandService(app.getPath('userData'))
  credentialService = new CredentialService(app.getPath('userData'), createCredentialSecretCodec())
  httpCollectionService = new HttpCollectionService(app.getPath('userData'))
  promptService = new PromptService(app.getPath('userData'))
  backupService = new BackupService({
    aiSettingsService,
    commandService,
    credentialService,
    httpCollectionService,
    promptService
  })
  legacyImportService = new LegacyImportService({
    commandService,
    credentialService,
    promptService
  })

  // Runtime / AI
  ipcMain.handle('runtime:get-info', () => getRuntimeInfo())
  ipcMain.handle('appearance:apply', (_event, input: AppAppearance) => {
    currentAppearance = normalizeAppearance(input)
    if (mainWindow) {
      applyWindowAppearance(mainWindow, currentAppearance)
    }
    return { ok: true }
  })
  ipcMain.handle('ai:get-history-state', () => aiChatHistoryService.getState())
  ipcMain.handle('ai:get-session', (_event, sessionId: string) =>
    aiChatHistoryService.getSession(sessionId)
  )
  ipcMain.handle('ai:get-settings-state', () => aiSettingsService.getState())
  ipcMain.handle('ai:save-settings', (_event, input: AiSettingsSaveInput) =>
    aiSettingsService.saveSettings(input)
  )
  ipcMain.handle('ai-sdk-runtime:get-state', () => aiSdkRuntimeManager.getState())
  ipcMain.handle('ai-sdk-runtime:install', (_event, provider: AiProviderKind) =>
    aiSdkRuntimeManager.install(provider)
  )
  ipcMain.handle('ai-sdk-runtime:update', (_event, provider: AiProviderKind) =>
    aiSdkRuntimeManager.update(provider)
  )
  ipcMain.handle('ai-sdk-runtime:uninstall', (_event, provider: AiProviderKind) =>
    aiSdkRuntimeManager.uninstall(provider)
  )
  ipcMain.handle('ai:start-chat', (_event, input: AiStartChatInput) => aiBridge.startChat(input))
  ipcMain.handle('ai:cancel-chat', (_event, sessionId: string) => aiBridge.cancelChat(sessionId))

  // Commands
  ipcMain.handle('commands:get-state', () => commandService.getState())
  ipcMain.handle('commands:save-tab', (_event, input: CommandTabSaveInput) =>
    commandService.saveTab(input)
  )
  ipcMain.handle('commands:save-command', (_event, input: CommandSaveInput) =>
    commandService.saveCommand(input)
  )
  ipcMain.handle('commands:import', (_event, input: CommandImportInput) =>
    commandService.importCommands(input)
  )
  ipcMain.handle('commands:reorder-tabs', (_event, tabIds: string[]) =>
    commandService.reorderTabs(tabIds)
  )
  ipcMain.handle('commands:move', (_event, input: CommandMoveInput) =>
    commandService.moveCommandToTab(input)
  )
  ipcMain.handle('commands:reorder', (_event, input: CommandReorderInput) =>
    commandService.reorderCommands(input)
  )
  ipcMain.handle('commands:delete-command', (_event, commandId: string) =>
    commandService.deleteCommand(commandId)
  )

  // Credentials
  ipcMain.handle('credentials:get-state', () => credentialService.getState())
  ipcMain.handle('credentials:save', (_event, input: CredentialSaveInput) =>
    credentialService.saveCredential(input)
  )
  ipcMain.handle('credentials:import', (_event, input: CredentialImportInput) =>
    credentialService.importCredentials(input)
  )
  ipcMain.handle('credentials:reorder', (_event, credentialIds: string[]) =>
    credentialService.reorderCredentials(credentialIds)
  )
  ipcMain.handle('credentials:delete', (_event, credentialId: string) =>
    credentialService.deleteCredential(credentialId)
  )

  // HTTP collections
  ipcMain.handle('http-collections:get-state', () => httpCollectionService.getState())
  ipcMain.handle('http-collections:save-collection', (_event, input: HttpCollectionSaveInput) =>
    httpCollectionService.saveCollection(input)
  )
  ipcMain.handle('http-collections:save-request', (_event, input: HttpRequestSaveInput) =>
    httpCollectionService.saveRequest(input)
  )
  ipcMain.handle('http-collections:delete-request', (_event, requestId: string) =>
    httpCollectionService.deleteRequest(requestId)
  )
  ipcMain.handle('http-collections:save-environment', (_event, input: HttpEnvironmentSaveInput) =>
    httpCollectionService.saveEnvironment(input)
  )
  ipcMain.handle('http-collections:delete-environment', (_event, environmentId: string) =>
    httpCollectionService.deleteEnvironment(environmentId)
  )
  ipcMain.handle('http-collections:execute-request', (_event, input: HttpExecuteRequestInput) =>
    httpCollectionService.executeRequest(input)
  )
  ipcMain.handle('http-collections:execute-batch', (_event, input: HttpBatchExecuteInput) =>
    httpCollectionService.executeBatch(input)
  )
  ipcMain.handle('http-collections:clear-history', (_event, input?: HttpClearHistoryInput) =>
    httpCollectionService.clearHistory(input)
  )

  // Prompt templates
  ipcMain.handle('prompts:get-state', () => promptService.getState())
  ipcMain.handle('prompts:save-category', (_event, input: PromptCategorySaveInput) =>
    promptService.saveCategory(input)
  )
  ipcMain.handle('prompts:reorder-categories', (_event, categoryIds: string[]) =>
    promptService.reorderCategories(categoryIds)
  )
  ipcMain.handle('prompts:delete-category', (_event, categoryId: string) =>
    promptService.deleteCategory(categoryId)
  )
  ipcMain.handle('prompts:save-template', (_event, input: PromptTemplateSaveInput) =>
    promptService.saveTemplate(input)
  )
  ipcMain.handle('prompts:save-as-template', (_event, input: PromptSaveAsTemplateInput) =>
    promptService.saveAsTemplate(input)
  )
  ipcMain.handle('prompts:reorder-templates', (_event, input: PromptTemplateReorderInput) =>
    promptService.reorderTemplates(input)
  )
  ipcMain.handle('prompts:delete-template', (_event, templateId: string) =>
    promptService.deleteTemplate(templateId)
  )
  ipcMain.handle('prompts:toggle-favorite', (_event, templateId: string) =>
    promptService.toggleFavorite(templateId)
  )
  ipcMain.handle('prompts:use-template', (_event, input: PromptTemplateUseInput) =>
    promptService.useTemplate(input)
  )
  ipcMain.handle('prompts:parse-variables', (_event, content: string) =>
    promptService.parseVariables(content)
  )
  ipcMain.handle('prompts:export', (_event, input?: PromptExportInput) =>
    promptService.exportTemplates(input)
  )
  ipcMain.handle('prompts:import', (_event, input: PromptImportInput) =>
    promptService.importTemplates(input)
  )

  // Backup / legacy import
  ipcMain.handle('backup:export', (_event, input?: BackupExportInput) =>
    backupService.exportBackup(input)
  )
  ipcMain.handle('backup:import', (_event, input: BackupImportInput) =>
    backupService.importBackup(input)
  )
  ipcMain.handle('legacy:analyze-import', (_event, json: string) =>
    legacyImportService.analyze(json)
  )
  ipcMain.handle('legacy:import', (_event, input: LegacyImportInput) =>
    legacyImportService.import(input)
  )
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.xrjjing.doggy-toolbox-web')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
