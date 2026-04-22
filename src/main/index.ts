import { app, BrowserWindow, ipcMain, safeStorage, shell } from 'electron'
import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { AiBridgeService } from './services/ai-bridge'
import { BackupService } from './services/backup-service'
import { CommandService } from './services/command-service'
import {
  CredentialService,
  plainCredentialSecretCodec,
  type CredentialSecretCodec
} from './services/credential-service'
import { PromptService } from './services/prompt-service'
import { getRuntimeInfo } from './utils/runtime'
import type {
  AiStartChatInput,
  BackupExportInput,
  BackupImportInput,
  CommandSaveInput,
  CommandTabSaveInput,
  CredentialSaveInput,
  PromptCategorySaveInput,
  PromptTemplateSaveInput,
  PromptTemplateUseInput
} from '../shared/ipc-contract'

let mainWindow: BrowserWindow | null = null
let aiBridge: AiBridgeService
let commandService: CommandService
let credentialService: CredentialService
let promptService: PromptService
let backupService: BackupService

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
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  aiBridge = new AiBridgeService(() => mainWindow)
  commandService = new CommandService(app.getPath('userData'))
  credentialService = new CredentialService(app.getPath('userData'), createCredentialSecretCodec())
  promptService = new PromptService(app.getPath('userData'))
  backupService = new BackupService({ commandService, credentialService, promptService })

  ipcMain.handle('runtime:get-info', () => getRuntimeInfo())
  ipcMain.handle('ai:start-chat', (_event, input: AiStartChatInput) => aiBridge.startChat(input))
  ipcMain.handle('ai:cancel-chat', (_event, sessionId: string) => aiBridge.cancelChat(sessionId))
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
  ipcMain.handle('credentials:get-state', () => credentialService.getState())
  ipcMain.handle('credentials:save', (_event, input: CredentialSaveInput) =>
    credentialService.saveCredential(input)
  )
  ipcMain.handle('credentials:delete', (_event, credentialId: string) =>
    credentialService.deleteCredential(credentialId)
  )
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
  ipcMain.handle('backup:export', (_event, input?: BackupExportInput) =>
    backupService.exportBackup(input)
  )
  ipcMain.handle('backup:import', (_event, input: BackupImportInput) =>
    backupService.importBackup(input)
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
