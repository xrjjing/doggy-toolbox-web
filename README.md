# 狗狗百宝箱 Web

`doggy-toolbox-web` 是原 `doggy-toolbox` 的 Electron 重构版。

目标不是把旧的 `Python + PyWebView + 原生 HTML/CSS/JS` 原样搬过来，而是改成：

- Electron Vite 负责桌面壳和打包
- Vue 3 + TypeScript 负责前端工程
- Naive UI 负责组件体系
- Electron Main Process 负责本地文件、JSON repository、网络请求和 AI SDK bridge
- GitHub Actions 负责多平台构建和 Release

## 当前状态

```text
Phase 6：P0-P5 已完成或对齐，P6/P7/P8 持续推进中
├── Electron Vite + Vue + TypeScript 工程骨架
├── Naive UI 桌面工具台布局
├── IPC 合约与本机运行时检测
├── Codex / Claude Code SDK bridge 分层入口 + AI 会话历史 + AI runtime 按需安装
├── 开发工具中心 43 个入口（其中 12 个高级面板）
├── 全局搜索 / 收藏 / 最近使用 / 使用次数统计 / 工具直达
├── appData JSON repository
├── 命令管理页面与本地持久化
├── 凭证管理页面与本地持久化
├── Prompt 模板库与变量填充
├── HTTP 集合 / 请求编辑器 / 环境变量替换 / 基础请求发送 / 请求历史 / 批量测试
├── 统一备份恢复协议（含 httpCollections / aiSettings）
├── 旧数据导入助手（旧项目命令 / 凭证 / Prompt 导入）
├── 9 主题 + 毛玻璃 + UI 缩放 + 外观设置弹窗预览/保存/取消恢复
├── GitHub Actions 打包工作流
└── README / LICENSE / AGENTS / CLAUDE / 待办台账
```

更细的迁移排期看根目录：

- `重构功能待办.md`

如果现在要判断“旧项目哪些功能已经迁移、哪些还没有迁移、这个项目怎么运行”，优先看：

- `docs/README.md`
- `docs/06-旧项目功能迁移对照.md`
- `docs/07-运行与使用指南.md`

## AI 改造原则

旧项目的 AI 是：

```text
前端 -> pywebview.api -> Python api.py -> services/ai_providers.py -> 手写 HTTPS 请求
```

新项目不沿用这条路径。新项目默认走：

```text
Vue Renderer
  -> preload 安全桥
  -> Electron Main
  -> AiBridgeService（只做窗口事件桥）
  -> AiSessionService（会话生命周期与历史落盘）
  -> AiProviderRouter（按 provider 选择本地运行时）
  -> CodexSdkBridge / ClaudeAgentBridge
  -> 本机 SDK / 本机配置
```

首批目标：

- Codex：通过 `@openai/codex-sdk` 读取本机 `~/.codex` 配置和登录态。
- Claude：通过 `@anthropic-ai/claude-agent-sdk` 读取本机 Claude Code 配置。
- Codex / Claude SDK 不再放在主应用常驻依赖里；基础安装包只带轻量 runtime installer，用户到 AI 设置页点击安装后，才会把对应 SDK 安装到 `userData/ai-runtimes`。
- AI 设置页支持对 Codex / Claude runtime 执行安装、更新、卸载和状态刷新。
- 当前发布目标收窄为 `macOS arm64` 和 `Windows x64`：打包产物会分别携带 `resources/runtime-installers/darwin-arm64/pnpm` 与 `resources/runtime-installers/win32-x64/pnpm.exe`。
- 本机运行时检测会读取 `~/.codex/config.toml`、`~/.codex/auth.json`、`~/.claude.json`，并在总览页展示模型、base_url、service_tier、权限和沙箱等可见事实。
- Renderer 不保存 API Key，也不直接发 AI HTTPS 请求。
- UI 只消费统一的 `start / status / delta / thinking / tool / usage / session-ref / done / error` 事件协议。
- AI 会话历史会保存到本地资料库，验证台可回看最近会话输出、思考片段、工具事件、usage、provider session id 和运行时配置快照。
- AI 设置页当前走 SDK-only 路线：默认工作目录、默认系统提示、全局开关、模块级开关会持久化到 `storage/ai-settings.json`，并被 AI Bridge / 工具页 AI 复核统一消费。
- 工具页已接入 AI 结果复核：会把当前工具名、输入、result 和 extra 组织成 prompt，复用同一套本机 SDK bridge 进行解释和异常判断。

真实本机 SDK smoke test：

```bash
pnpm run smoke:ai
pnpm run smoke:ai -- codex
pnpm run smoke:ai -- claude
```

这条检查会实际调用已安装的 Codex / Claude runtime，并要求返回 `DOGGY_AI_SMOKE_OK`。它不是 mock 测试，会消耗本机已登录账号对应的模型额度。

Codex SDK 会写入 `~/.codex/sessions`，Claude Agent SDK 会读取本机 Claude Code 配置；如果在受限沙箱内执行，可能需要放开本机配置目录访问权限。

## 本地持久化原则

P2 阶段先不引入 native SQLite 依赖，避免 Electron 打包链路过早被原生模块阻塞。当前已落地：

- Main Process 统一管理 `app.getPath('userData')` 下的数据目录。
- `storage/commands.json` 使用 JSON repository 原子写入。
- `storage/credentials.json` 使用同一套 repository，Electron 可用时通过 `safeStorage` 编码密码字段。
- `storage/prompts.json` 保存 Prompt 分类、模板、收藏、变量和使用次数。
- `storage/http-collections.json` 保存 HTTP 集合、请求资料、环境变量和执行历史。
- `storage/ai-settings.json` 保存本机 SDK 路线的 AI 设置默认值和模块级开关。
- Renderer 业务数据默认通过 preload 暴露的 IPC API 进入 Main Process。
- 命令管理支持分组、新增、编辑、删除、搜索和复制。
- 凭证管理支持新增、编辑、删除、搜索、显示/隐藏、复制账号和复制密码。
- Prompt 模板支持分类、新增、编辑、删除、收藏、变量解析、变量填充和复制结果。
- HTTP 集合当前已覆盖集合、请求、环境变量三类资料的新增、编辑、删除、搜索和本地持久化；发送请求时支持 `{{变量名}}` 环境变量替换，由 Electron Main Process 统一执行 `http://` / `https://` 请求，并在页面展示状态、耗时、Headers、Body、已解析请求和未解析变量。
- HTTP 请求历史会在每次发送后自动记录，当前每个请求最多保留 50 条、全局最多保留 500 条，并随 `httpCollections` 一起参与统一备份恢复。
- HTTP 批量测试支持对当前集合按请求顺序串行执行，并复用单请求执行链路、环境变量和历史记录。
- HTTP 第三方格式转换已接入 cURL 导入、cURL 导出、HTTPie 导出，以及 Postman Collection v2.1、OpenAPI 3.x、Apifox JSON 的基础导入导出。
- 统一备份恢复当前覆盖命令、凭证、Prompt、HTTP 集合、AI 设置五块模块数据，并明确按所选模块执行覆盖恢复。
- 旧数据导入助手当前支持两类旧项目 JSON：旧项目总备份（命令 + 凭证）和旧 Prompt 模板导出（Prompt 分类 + 模板）。

## 开发

本仓库使用 pnpm，`package.json` 已通过 `packageManager` 锁定 pnpm 版本，并通过 `pnpm.onlyBuiltDependencies` 仅允许 `electron` 和 `esbuild` 执行安装期构建脚本。建议使用 Node.js 22 + Corepack：

```bash
corepack enable
pnpm install
pnpm run dev
```

常用检查：

```bash
pnpm run typecheck
pnpm run lint
pnpm run build
```

## 使用说明

启动桌面端后，左侧导航进入各模块：

- `开发工具`：当前工具中心共 43 个入口，其中 31 个是纯前端算法工具，12 个是高级面板；工具按旧项目分类组织，并支持 AI 复核。
- `全局搜索`：点击顶部“全局搜索”或按 `⌘K / Ctrl+K`，可搜索模块和工具，支持收藏、最近使用、使用次数排序，并能直达指定工具。
- `HTTP 集合`：管理集合、请求和环境变量；支持发送请求、请求历史、批量测试，以及 cURL / HTTPie / Postman / OpenAPI / Apifox 格式转换。旧 `tool-curl` 页的“解析 cURL 并生成 Fetch / Axios / Python / Node.js / PHP / Go 示例代码”已收敛到“导入 cURL”弹窗。
- `命令` / `凭证` / `Prompts`：使用本地 JSON repository 持久化常用资料。
- `备份恢复`：导出或覆盖恢复命令、凭证、Prompt、HTTP 集合和 AI 设置数据。
- `AI SDK Bridge`：页面内已包含 AI 设置区，可直接配置默认工作目录、系统提示、模块开关，并选择 Codex SDK 或 Claude Code SDK 发起本机会话、回看历史、usage、工具事件和 provider session id。
- `业务页 AI 辅助`：工具、命令、Prompt、节点和 HTTP 页面都通过同一套本机 SDK Bridge 发起 AI 说明 / 审查 / 分析，并受 AI 设置页的模块开关控制。
- `外观设置`：顶部快捷条保留即时生效入口，同时支持设置弹窗预览、保存和取消恢复。

截图约定：

- 截图后放到 `docs/screenshots/`。
- README 建议至少补 `dashboard.png`、`tools-ai-assist.png`、`http-collections.png`、`ai-bridge.png` 四张。
- 当前仓库先保留文字使用说明，不伪造截图文件。

## 打包

本机打包：

```bash
pnpm run build:mac
pnpm run build:win
pnpm run build:linux
```

GitHub 打包：

- 推送 `v*` tag 会触发 Release 构建。
- 也可以在 GitHub Actions 页面手动触发 `Build and Release`。
- Actions 使用 `corepack enable` + `pnpm install --frozen-lockfile`，并缓存 pnpm 依赖。
- Release notes 可按 `docs/release-notes-template.md` 填写；Actions 会上传 `macOS arm64` 和 `Windows x64` 平台产物。

## 目录结构

```text
doggy-toolbox-web/
├── src/main/             # Electron Main Process，本地能力与 AI bridge 分层
├── src/preload/          # 安全暴露给 Renderer 的 IPC API
├── src/renderer/         # Vue 3 + TypeScript + Naive UI 前端
├── src/shared/           # Main / Preload / Renderer 共享类型
├── tests/                # 工具算法与本地服务测试
├── resources/            # 图标与打包资源
├── .github/workflows/    # GitHub Actions 打包
├── AGENTS.md             # 从旧项目复制
├── CLAUDE.md             # 从旧项目复制
├── LICENSE               # MIT
└── 重构功能待办.md        # 迁移执行台账
```

## 迁移顺序

1. 新仓基线：工程、文档、Actions、首个提交。
2. 纯前端工具：Base64、URL、UUID、Hash、JSON、文本处理等。
3. 本地持久化：命令、凭证、Prompt、备份。
4. 网络工具：HTTP 集合、环境变量、历史记录、导入导出。
5. AI Bridge：Codex / Claude Code SDK、会话历史、工具页 AI 辅助。

## 许可证

MIT，详见 `LICENSE`。
