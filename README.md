# 狗狗百宝箱 Web

`doggy-toolbox-web` 是原 `doggy-toolbox` 的 Electron 重构版。

目标不是把旧的 `Python + PyWebView + 原生 HTML/CSS/JS` 原样搬过来，而是改成：

- Electron Vite 负责桌面壳和打包
- Vue 3 + TypeScript 负责前端工程
- Naive UI 负责组件体系
- Electron Main Process 负责本地文件、数据库、网络和 AI SDK bridge
- GitHub Actions 负责多平台构建和 Release

## 当前状态

```text
Phase 0：新仓基线进行中
├── Electron Vite + Vue + TypeScript 工程骨架
├── Naive UI 桌面工具台布局
├── IPC 合约与本机运行时检测
├── Codex / Claude Code SDK bridge 初始入口
├── GitHub Actions 打包工作流
└── README / LICENSE / AGENTS / CLAUDE / 待办台账
```

更细的迁移排期看根目录：

- `重构功能待办.md`

## AI 改造原则

旧项目的 AI 是：

```text
前端 -> pywebview.api -> Python api.py -> services/ai_providers.py -> 手写 HTTPS 请求
```

新项目不沿用这条路径。新项目默认走：

```text
Vue Renderer -> preload 安全桥 -> Electron Main -> AI Bridge -> 本机 SDK / 本机配置
```

首批目标：

- Codex：通过 `@openai/codex-sdk` 读取本机 `~/.codex` 配置和登录态。
- Claude：通过 `@anthropic-ai/claude-agent-sdk` 读取本机 Claude Code 配置。
- Renderer 不保存 API Key，也不直接发 AI HTTPS 请求。
- UI 只消费统一的 `start / delta / thinking / tool / usage / done / error` 事件协议。

## 开发

```bash
npm install
npm run dev
```

常用检查：

```bash
npm run typecheck
npm run lint
npm run build
```

## 打包

本机打包：

```bash
npm run build:mac
npm run build:win
npm run build:linux
```

GitHub 打包：

- 推送 `v*` tag 会触发 Release 构建。
- 也可以在 GitHub Actions 页面手动触发 `Build and Release`。

## 目录结构

```text
doggy-toolbox-web/
├── src/main/             # Electron Main Process，本地能力与 AI bridge
├── src/preload/          # 安全暴露给 Renderer 的 IPC API
├── src/renderer/         # Vue 3 + TypeScript + Naive UI 前端
├── src/shared/           # Main / Preload / Renderer 共享类型
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
3. 本地持久化：命令、凭证、Prompt、节点、备份。
4. 网络工具：HTTP 集合、环境变量、历史记录、导入导出。
5. AI Bridge：Codex / Claude Code SDK、会话历史、工具页 AI 辅助。

## 许可证

MIT，详见 `LICENSE`。
