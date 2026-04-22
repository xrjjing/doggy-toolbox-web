import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { AiBridgeService } from './services/ai-bridge'
import { getRuntimeInfo } from './utils/runtime'
import type { AiStartChatInput } from '../shared/ipc-contract'

let mainWindow: BrowserWindow | null = null
let aiBridge: AiBridgeService

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

  ipcMain.handle('runtime:get-info', () => getRuntimeInfo())
  ipcMain.handle('ai:start-chat', (_event, input: AiStartChatInput) => aiBridge.startChat(input))
  ipcMain.handle('ai:cancel-chat', (_event, sessionId: string) => aiBridge.cancelChat(sessionId))
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
