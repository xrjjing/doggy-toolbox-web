# 本地持久化与 AI SDK Bridge

## 1. 本地持久化为什么这样设计

当前项目的持久化没有直接上 SQLite，而是先走 JSON repository。

原因：

- 先保证 Electron 基线稳定。
- 避免原生模块影响多平台打包。
- 先把模块边界、IPC 协议、页面闭环跑通。

当前存储策略是：

```text
app.getPath('userData')
  ├── storage/
  ├── exports/
  ├── backups/
  └── ai-sessions/
```

定义文件：

- `src/main/services/app-data.ts`

## 2. appData 目录布局

`resolveAppDataPaths()` 会生成这些关键文件：

- `storage/commands.json`
- `storage/credentials.json`
- `storage/prompts.json`
- `storage/nodes.json`
- `storage/http-collections.json`
- `storage/ai-chat-sessions.json`
- `storage/ai-settings.json`

`ensureAppDataLayout()` 会确保这些目录存在。

## 3. JSON Repository 的实现方式

文件：

- `src/main/services/json-repository.ts`

核心能力：

- `read()`
- `write()`
- `update()`

实现重点：

- 自动创建父目录
- 文件不存在时自动写入默认值
- 原子写入：
  先写 `.tmp` 文件，再 `rename`
- 串行写队列：
  避免并发写坏文件

这意味着后续如果你新增本地模块，推荐继续复用这套仓储模式。

## 4. 各模块落盘位置

### 4.1 命令管理

- 文件：`storage/commands.json`
- Main 服务：`CommandService`
- Store：`useCommandsStore`

### 4.2 凭证管理

- 文件：`storage/credentials.json`
- Main 服务：`CredentialService`
- Store：`useCredentialsStore`

特殊点：

- Electron 可用时优先使用 `safeStorage`
- 不可用时回退明文

在主进程里是通过 `createCredentialSecretCodec()` 决定的。

### 4.3 Prompt 模板

- 文件：`storage/prompts.json`
- Main 服务：`PromptService`
- Store：`usePromptsStore`

特殊点：

- 内置默认分类与默认模板
- 模板变量通过 `{{name}}` 语法解析

### 4.4 节点列表

- 文件：`storage/nodes.json`
- Main 服务：`NodeService`
- Store：`useNodesStore`

特殊点：

- 分享链接导入在 Renderer 解析
- 真正保存仍然走 Main

### 4.5 HTTP 集合

- 文件：`storage/http-collections.json`
- Main 服务：`HttpCollectionService`
- Store：`useHttpCollectionsStore`

里面同时保存：

- collections
- requests
- environments
- history

### 4.6 AI 会话历史

- 文件：`storage/ai-chat-sessions.json`
- Main 服务：`AiChatHistoryService`
- Store：`useAiStore`

这里会保留：

- 消息
- 输出
- thinking
- tool 事件
- runtime 快照
- usage
- provider session id

### 4.7 AI 设置

- 文件：`storage/ai-settings.json`
- Main 服务：`AiSettingsService`
- Store：`useAiSettingsStore`

这里会保留：

- 默认工作目录
- 默认系统提示
- 全局 AI 开关
- `ai-chat/tools/http/commands/prompts/nodes` 六个模块开关

这份配置不保存旧项目那种第三方 HTTPS provider 列表，也不直接落 API Key。
它只保存本机 SDK 路线真正会消费的默认值。

## 5. 统一备份恢复

文件：

- `src/main/services/backup-service.ts`
- `src/renderer/src/stores/backup.ts`
- `src/renderer/src/features/backup/BackupRestoreView.vue`

当前支持的 section：

- `commands`
- `credentials`
- `prompts`
- `nodes`
- `httpCollections`
- `aiSettings`

备份文档会写：

- `version`
- `app`
- `exportedAt`
- `sections`
- `summary`
- `data`

导入时是按所选模块覆盖恢复，不是增量 merge。

## 6. 旧数据导入助手

文件：

- `src/main/services/legacy-import-service.ts`

当前支持两类旧数据：

- 旧项目总备份 JSON
- 旧项目 Prompt 模板导出 JSON

### 6.1 旧总备份导入

可导入：

- commands
- credentials
- nodes

### 6.2 旧 Prompt 导入

可导入：

- prompts

导入策略不是直接粗暴覆盖同名模板，而是：

- 分类按名称合并
- 模板按标题跳过重复

## 7. AI SDK Bridge 设计目标

旧项目 AI 路线是：

```text
前端 -> pywebview.api -> Python api.py -> services/ai_providers.py -> 手写 HTTPS
```

新项目 AI 路线是：

```text
Renderer
  -> preload
  -> ipcMain
  -> AiBridgeService
  -> AiSessionService
  -> AiProviderRouter
  -> CodexSdkBridge / ClaudeAgentBridge
  -> 本机 SDK
```

设计目标：

- Renderer 不保存 API Key
- Renderer 不直接请求 AI HTTPS
- 尽量复用本机 Codex / Claude 登录态和配置
- 统一流式事件协议
- 把 AI 历史也纳入本地资料库
- 把 AI 默认工作目录、系统提示和模块级开关纳入本地资料库与统一备份

## 8. AI 关键服务拆分

### 8.1 `LocalAiRuntimeService`

职责：

- 读取 `~/.codex/config.toml`
- 读取 `~/.codex/auth.json`
- 读取 `~/.claude.json`
- 输出 RuntimeInfo 和状态快照

### 8.2 `AiProviderRouter`

职责：

- 按 provider 选择具体 bridge
- 统一 `getRuntime()`
- 统一 `run()`

### 8.3 `AiSessionService`

职责：

- 创建会话
- 管理 `AbortController`
- 管理运行中会话 map
- 把事件写入历史
- 把事件继续推给窗口

### 8.4 `AiBridgeService`

职责非常薄：

- `startChat`
- `cancelChat`
- `emit(event)` 到渲染层

它只是窗口事件桥，不做业务编排。

### 8.5 `AiChatHistoryService`

职责：

- 创建会话记录
- 应用流式事件
- 获取历史列表
- 获取单个会话详情

### 8.6 `CodexSdkBridge`

职责：

- 读取 Codex runtime
- 实例化 `@openai/codex-sdk`
- 把 SDK 事件映射成统一 `AiStreamEvent`

映射的事件大致包括：

- `thread.started` -> `session-ref`
- `turn.started` -> `status`
- `agent_message` -> `delta`
- `reasoning` -> `thinking`
- `command_execution` -> `tool`
- `mcp_tool_call` -> `tool`
- `turn.completed` -> `usage`

### 8.7 `ClaudeAgentBridge`

职责：

- 调用 `@anthropic-ai/claude-agent-sdk`
- 把 Claude stream 转成统一事件

映射的事件大致包括：

- `system:init` -> `session-ref` + `status`
- `session_state_changed` -> `status`
- `text_delta` -> `delta`
- `thinking_delta` -> `thinking`
- `tool_progress` -> `tool`
- `tool_use_summary` -> `tool`
- `result` -> `delta` + `usage`

## 9. AI 会话生命周期

`AiSessionService.startChat()` 的顺序很关键：

1. 生成 `sessionId`
2. 创建 `AbortController`
3. 先写入历史记录 `createSession()`
4. 获取 runtime 快照
5. 发出 `start`
6. 发出 `status(starting)`
7. 异步执行 provider `run()`
8. Provider 持续上报流式事件
9. 完成后 `finishSession(done)`
10. 失败则 `finishSession(error)`
11. 取消则 `finishSession(cancelled)`

## 10. 接手 AI 相关问题时先看什么

建议按这个顺序看：

1. `src/shared/ipc-contract.ts`
2. `src/main/services/local-ai-runtime-service.ts`
3. `src/main/services/ai-provider-router.ts`
4. `src/main/services/ai-session-service.ts`
5. `src/main/services/codex-sdk-bridge.ts`
6. `src/main/services/claude-agent-bridge.ts`
7. `src/renderer/src/stores/ai.ts`
8. `src/renderer/src/views/AiChatView.vue`
9. `src/renderer/src/features/tools/tool-ai-assist.ts`

## 11. 当前 AI 边界

当前已经完成：

- 本机配置检测
- 两套 SDK 接入
- 历史会话保存
- thinking / tool / usage / session-ref 保留
- 工具页 AI 分析复用同一链路

当前还没有做的部分：

- 更复杂的多轮会话管理
- 可配置 system prompt 面板
- 页面级 AI 全量嵌入
- 旧项目 `ai-settings` 页面体验完整迁移
