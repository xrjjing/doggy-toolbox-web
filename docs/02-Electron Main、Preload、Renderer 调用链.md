# Electron Main、Preload、Renderer 调用链

## 1. 总体分层图

这个项目最重要的是理解三层边界：

```text
Vue 页面 / Pinia Store
  -> window.doggy
  -> preload/index.ts
  -> ipcRenderer.invoke / on
  -> ipcMain.handle / webContents.send
  -> main/services/*
  -> 本地文件 / 本机 SDK / HTTP / safeStorage
```

你可以把它理解成：

- Renderer 负责“我要做什么”
- Preload 负责“我允许你调用什么”
- Main 负责“真正执行什么”

## 2. 启动链路

### 2.1 Electron Main 启动

入口文件：

- `src/main/index.ts`

启动顺序：

1. `app.whenReady()`
2. `registerIpc()`
3. `createWindow()`
4. `mainWindow.loadURL(...)` 或 `mainWindow.loadFile(...)`

其中 `createWindow()` 主要做的事情：

- 创建 `BrowserWindow`
- 指定 `preload: ../preload/index.js`
- 开启 `contextIsolation: true`
- 关闭 `nodeIntegration`
- 设置窗口标题、尺寸、背景色、图标

这意味着 Renderer 不能直接拿 Electron 和 Node API，必须经过 Preload。

### 2.2 Renderer 启动

入口文件：

- `src/renderer/src/main.ts`

顺序很简单：

1. `createApp(App)`
2. `.use(createPinia())`
3. `.use(router)`
4. `.mount('#app')`

### 2.3 App 外壳

入口文件：

- `src/renderer/src/App.vue`
- `src/renderer/src/components/AppShell.vue`

`App.vue` 负责：

- 根据 `appStore.isDark` 选择 Naive UI 的 `lightTheme / darkTheme`

`AppShell.vue` 负责：

- 左侧导航
- 顶部栏
- `RouterView`
- 启动时执行 `appStore.loadRuntimeInfo()`

## 3. Preload 层做了什么

文件：

- `src/preload/index.ts`

它做了两件事：

### 3.1 暴露 API

通过：

```ts
contextBridge.exposeInMainWorld('doggy', api)
```

把能力挂到：

```ts
window.doggy
```

### 3.2 统一 IPC

Preload 把所有调用统一包装成：

- `ipcRenderer.invoke(...)`
- `ipcRenderer.on(...)`

例如：

```ts
getCommandsState: () => ipcRenderer.invoke('commands:get-state')
saveCommand: (input) => ipcRenderer.invoke('commands:save-command', input)
```

AI 流式事件比较特殊：

```ts
onAiStreamEvent: (handler) => {
  ipcRenderer.on('ai:stream-event', listener)
  return () => ipcRenderer.removeListener('ai:stream-event', listener)
}
```

也就是说：

- 普通查询 / 保存走 `invoke`
- AI 流式输出走 `send + on`

## 4. Shared IPC 合约的作用

文件：

- `src/shared/ipc-contract.ts`

这是整个项目的“协议中心”。

它定义了：

- RuntimeInfo
- AiStreamEvent
- 命令 / 凭证 / Prompt / 节点 / HTTP / 备份 / 导入的 state 与 input
- `BridgeApi`

### 4.1 为什么它重要

因为三层都依赖它：

- Main 返回什么
- Preload 暴露什么
- Renderer 接收什么

如果你后续新增一个功能，最稳妥的顺序通常是：

1. 先改 `ipc-contract.ts`
2. 再改 `preload/index.ts`
3. 再改 `main/index.ts`
4. 再改 store 和页面

## 5. Main IPC 注册总入口

文件：

- `src/main/index.ts`

`registerIpc()` 里会初始化所有服务，然后注册所有 IPC 通道。

当前大类包括：

- `runtime:*`
- `ai:*`
- `commands:*`
- `credentials:*`
- `nodes:*`
- `http-collections:*`
- `prompts:*`
- `backup:*`
- `legacy:*`

你可以把 `registerIpc()` 看成主进程的“路由表”。

## 6. 一个完整的普通数据调用例子

以“命令管理加载数据”为例：

```text
CommandManagerView.vue onMounted
  -> commandsStore.load()
  -> window.doggy.getCommandsState()
  -> preload ipcRenderer.invoke('commands:get-state')
  -> main ipcMain.handle('commands:get-state')
  -> commandService.getState()
  -> JsonFileRepository.read()
  -> 返回 CommandModuleState
  -> store.hydrateState(...)
  -> 页面渲染
```

以“保存命令”为例：

```text
点击“保存命令”
  -> submitCommand()
  -> commandsStore.saveCommand(input)
  -> window.doggy.saveCommand(input)
  -> preload invoke('commands:save-command', input)
  -> ipcMain.handle('commands:save-command')
  -> commandService.saveCommand(input)
  -> repository.update(...)
  -> commandsStore.load()
  -> 页面刷新
```

## 7. 一个完整的 AI 流式调用例子

以 AI 页面发送消息为例：

```text
AiChatView 点击“发送”
  -> aiStore.startChat()
  -> window.doggy.onAiStreamEvent(handleStreamEvent)
  -> window.doggy.aiStartChat(input)
  -> preload invoke('ai:start-chat', input)
  -> ipcMain.handle('ai:start-chat')
  -> aiBridge.startChat(input)
  -> aiSessionService.startChat(input)
  -> historyService.createSession(...)
  -> providerRouter.getRuntime(...)
  -> emit(start/status)
  -> providerRouter.run(...)
  -> CodexSdkBridge / ClaudeAgentBridge
  -> 事件不断 emit 到 AiSessionService
  -> AiBridgeService.emit(...)
  -> webContents.send('ai:stream-event', event)
  -> preload onAiStreamEvent
  -> aiStore.handleStreamEvent(event)
  -> 页面实时更新
```

这条链路与普通 CRUD 最大的区别是：

- CRUD 是单次 request / response
- AI 是一次启动，多次流式事件回推

## 8. 为什么 Renderer 不直接做这些事

Renderer 没有直接做以下事情：

- 读写本地文件
- 读取 `~/.codex` 或 `~/.claude.json`
- 调用 `safeStorage`
- 真实发送 HTTP 请求
- 直接实例化 AI SDK

原因很明确：

- 安全边界更清晰
- 打包后桌面端行为更稳定
- 前端逻辑不需要知道太多本机细节
- 更方便后续替换底层实现

## 9. 接手时最该优先看的 6 个文件

如果你想最快把这条链读懂，建议先看：

1. `src/shared/ipc-contract.ts`
2. `src/preload/index.ts`
3. `src/main/index.ts`
4. `src/renderer/src/stores/ai.ts`
5. `src/main/services/ai-session-service.ts`
6. `src/renderer/src/features/http/HttpCollectionsView.vue`

这 6 个文件基本能把项目的主要风格和边界看明白。
