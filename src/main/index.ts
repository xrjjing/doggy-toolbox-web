import { app, BrowserWindow, ipcMain, safeStorage, shell } from 'electron'
import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { AiBridgeService } from './services/ai-bridge'
import { AiChatHistoryService } from './services/ai-chat-history-service'
import { AiProviderRouter } from './services/ai-provider-router'
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
import { NodeService } from './services/node-service'
import { PromptService } from './services/prompt-service'
import { LegacyImportService } from './services/legacy-import-service'
import { getRuntimeInfo } from './utils/runtime'
import type {
  AiSettingsSaveInput,
  AiStartChatInput,
  BackupExportInput,
  BackupImportInput,
  CommandSaveInput,
  CommandTabSaveInput,
  CredentialSaveInput,
  HttpBatchExecuteInput,
  HttpClearHistoryInput,
  HttpCollectionSaveInput,
  HttpEnvironmentSaveInput,
  HttpExecuteRequestInput,
  HttpRequestSaveInput,
  LegacyImportInput,
  NodeSaveInput,
  PromptCategorySaveInput,
  PromptTemplateSaveInput,
  PromptTemplateUseInput
} from '../shared/ipc-contract'

let mainWindow: BrowserWindow | null = null
let aiBridge: AiBridgeService
let aiChatHistoryService: AiChatHistoryService
let aiSettingsService: AiSettingsService
let aiSessionService: AiSessionService
let aiRuntimeService: LocalAiRuntimeService
let commandService: CommandService
let credentialService: CredentialService
let httpCollectionService: HttpCollectionService
let promptService: PromptService
let backupService: BackupService
let legacyImportService: LegacyImportService
let nodeService: NodeService

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
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    // 外链统一交给系统浏览器，减少在应用内打开未知网页的安全面。
    void shell.openExternal(details.url)
    return { action: 'deny' }
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
  aiRuntimeService = new LocalAiRuntimeService()
  const providerRouter = new AiProviderRouter(
    {
      codex: new CodexSdkBridge(aiRuntimeService),
      'claude-code': new ClaudeAgentBridge(aiRuntimeService)
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
  nodeService = new NodeService(app.getPath('userData'))
  promptService = new PromptService(app.getPath('userData'))
  backupService = new BackupService({
    aiSettingsService,
    commandService,
    credentialService,
    httpCollectionService,
    nodeService,
    promptService
  })
  legacyImportService = new LegacyImportService({
    commandService,
    credentialService,
    nodeService,
    promptService
  })

  // Runtime / AI
  ipcMain.handle('runtime:get-info', () => getRuntimeInfo())
  ipcMain.handle('ai:get-history-state', () => aiChatHistoryService.getState())
  ipcMain.handle('ai:get-session', (_event, sessionId: string) =>
    aiChatHistoryService.getSession(sessionId)
  )
  ipcMain.handle('ai:get-settings-state', () => aiSettingsService.getState())
  ipcMain.handle('ai:save-settings', (_event, input: AiSettingsSaveInput) =>
    aiSettingsService.saveSettings(input)
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
  ipcMain.handle('commands:delete-command', (_event, commandId: string) =>
    commandService.deleteCommand(commandId)
  )

  // Credentials
  ipcMain.handle('credentials:get-state', () => credentialService.getState())
  ipcMain.handle('credentials:save', (_event, input: CredentialSaveInput) =>
    credentialService.saveCredential(input)
  )
  ipcMain.handle('credentials:delete', (_event, credentialId: string) =>
    credentialService.deleteCredential(credentialId)
  )

  // Nodes
  ipcMain.handle('nodes:get-state', () => nodeService.getState())
  ipcMain.handle('nodes:save', (_event, input: NodeSaveInput) => nodeService.saveNode(input))
  ipcMain.handle('nodes:delete', (_event, nodeId: string) => nodeService.deleteNode(nodeId))

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
  ipcMain.handle('prompts:delete-category', (_event, categoryId: string) =>
    promptService.deleteCategory(categoryId)
  )
  ipcMain.handle('prompts:save-template', (_event, input: PromptTemplateSaveInput) =>
    promptService.saveTemplate(input)
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
