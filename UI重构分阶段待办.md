# UI 重构分阶段待办

> 创建时间：2026-04-29 CST  
> 本轮目标：根据新截图反馈继续修复 UI/交互，并把新项目自身持久化切到 SQLite DB。  
> 执行规则：每个阶段先研判真实代码和页面，再修改，再实机点击自检，发现问题先修复，最后更新本文件。Electron 验证时同一时间只保留一个窗口；非主进程 / preload 变更优先 reload 当前页面，不额外启动第二个 Electron。

---

## 0. Grill-me 决策收束

### Q1：用户允许导入旧 DB 后，是否可以直接点击导入？

推荐答案：不能直接点。

- 当前新项目自身并没有 SQLite DB。
- 真实持久化仍在 `~/Library/Application Support/doggy-toolbox-web/storage/*.json`。
- 如果现在直接导入，只是把旧 SQLite 数据写入 JSON，不符合“所有东西都应该存在 DB 中”。
- 必须先把新项目持久化切到 SQLite，再导入旧 DB。

### Q2：新项目 SQLite DB 应该放在哪里？

推荐答案：放在 Electron 标准 userData 目录：

`~/Library/Application Support/doggy-toolbox-web/doggy_toolbox_web.db`

理由：

- 和当前 storage/backups/exports 同属于应用数据目录。
- 不污染项目源码目录。
- 后续备份、迁移、排查都更清晰。

### Q3：如何低风险把 JSON 存储切到 SQLite？

推荐答案：先做“文档型 SQLite repository”。

- 保持现有 service 的 read/write/update 业务边界。
- 用 SQLite 中的 `app_documents(module_key, payload_json, updated_at)` 保存模块状态。
- 首次读取时，如果 DB 没有该模块但旧 JSON 文件存在，就自动迁移进 DB。
- 后续再需要关系型查询时，再逐模块拆正规表。

### Q4：外观设置要保留还是删除？

推荐答案：保留，但必须真实联动。

- UI 缩放必须影响全应用，而不是只影响外观弹窗。
- 毛玻璃必须改变全局卡片/面板透明度、模糊和背景层次。
- 多主题如果保留，就让 Zen token 参与不同主题配色；如果做不到，就收敛主题数量。

---

## 1. 阶段计划

### Phase H：[x] SQLite 持久化与旧库导入落地

目标：让新项目自身使用 SQLite DB 保存所有核心模块，并把旧项目 DB 导入当前 DB。

范围：

- 当前项目 DB：`~/Library/Application Support/doggy-toolbox-web/doggy_toolbox_web.db`
- 命令、凭证、Prompt、HTTP、AI Chat 历史、AI 设置都必须保存到 DB。
- 旧库 `/Users/xrj/.dog_toolbox/doggy_toolbox.db` 导入后要写入当前项目 DB。
- 数据中心和各页面不要再展示无意义 JSON 路径块。

交付：

- 新增 SQLite 文档仓库。
- 各 service 从 JSON repository 切换到 SQLite repository。
- 旧 JSON 自动迁移进 DB。
- 执行旧库导入并实机检查数据可见。

自检记录：

- 发现的问题：当前 service 全部仍通过 `JsonFileRepository` 写入 `storage/*.json`，即使旧 DB 导入链路存在，导入结果也会落到 JSON。
- 修复结果：新增 `SqliteDocumentRepository`，统一写入 `doggy_toolbox_web.db` 的 `app_documents` 表；命令、凭证、Prompt、HTTP、AI Chat 历史、AI 设置已切换到当前 SQLite DB，并保留旧 JSON 首次读取自动迁移。
- 二次自检：在唯一 Electron 窗口中打开数据迁移中心，点击“分析 SQLite DB”，识别到旧库 `command_tabs=8`、`computer_commands=22`、`credentials=29`、`prompt_categories=5`、`prompt_templates=10`、`http_collections=3`、`http_environments=0`。
- 修复结果：首次点击“导入选中模块”时发现 Popconfirm 触发后 IPC 报 `An object could not be cloned.`；根因是 renderer 把 Vue 响应式数组直接传给 IPC，已在 `legacy-import` store 中改成普通数组。随后 reload 当前页面，重新分析并确认导入成功。
- DB 核验：当前项目 DB `~/Library/Application Support/doggy-toolbox-web/doggy_toolbox_web.db` 的 `app_documents` 已包含 `commands`、`credentials`、`prompts`、`httpCollections`、`aiChatSessions`、`aiSettings`；其中命令 8/22、凭证 29、Prompt 5/10、HTTP 集合/请求 2/2。
- 剩余风险：旧库 `http_collections` 表中 3 行导入后映射为 2 个集合和 2 个请求，属于新旧模型统计口径差异，需要后续按具体旧数据内容再做语义校对。

---

### Phase I：[x] AI Chat 会话与 Prompt 模板联动

目标：让 AI 灵感空间成为真正可管理的会话工作台，并和 Prompt 模板打通。

范围：

- [Image #2] Codex / Claude segmented 中间竖线去掉。
- AI Chat 增加会话历史列表，建议放左侧。
- 支持新建会话、手动切换会话。
- AI Chat 输入区增加 Prompt 模板选择入口。
- Prompt 模板可用于 AI Chat：选择模板、填写变量、填入输入框。
- 图片能力：先做附件 UI 和持久化记录；如当前 SDK 桥暂不支持图片发送，明确禁用真实发送并给提示。

交付：

- AI Chat 有左侧会话列表和新建按钮。
- 模板能填入 AI Chat 输入。
- 图片入口有明确 UI 状态。

自检记录：

- 发现的问题：AI Chat 页面只有单画布，`aiStore.sessions/loadSession` 未被左侧历史使用；Prompt 模板 store 已有 `useTemplate`，但聊天页没有入口；当前 SDK bridge 发送结构仍是纯文本 messages。
- 修复结果：AI Chat 增加左侧会话列表、新建会话按钮、手动切换会话；输入区增加 Prompt 模板选择入口，支持变量填写后填入输入框；图片入口已预留并明确提示当前不真实上传。
- 二次自检：在唯一 Electron 窗口中打开 AI Chat，确认左侧会话历史列表、新建会话按钮、会话切换入口可见；点击 Prompt 模板按钮后弹窗正常打开。
- 修复结果：模板“填入输入框”原先依赖主进程记录使用次数，失败时无反馈；已改为 renderer 先用模板规则填充输入框并关闭弹窗，再异步记录使用次数。实点验证后输入框真实变为“代码解释”模板内容，并出现“模板已填入 AI 输入框”提示。
- 剩余风险：图片真实多模态发送需要后续扩展 `AiStartChatInput` 和 provider bridge，目前只做 UI 入口与禁用说明。

---

### Phase J：[x] HTTP 环境变量与局部 UI 瘦身

目标：修掉 HTTP 环境变量缺入口、Prompt 大空白、无意义资料库展示和残留竖线。

范围：

- [Image #1] Prompt 详情标签区域空白过大，标签样式难看；删除或改成紧凑 iOS chip。
- [Image #3] HTTP 只有环境变量选择，没有创建/编辑入口；补环境变量管理弹窗。
- HTTP 环境变量必须保存到 DB。
- [Image #5] 命令管理本地资料库展示无意义，移除或改成紧凑 DB meta。
- [Image #6] 工具页 AI 复核 segmented 竖线去掉。

交付：

- Prompt 详情无大空白。
- HTTP 环境变量可创建、编辑、删除、保存。
- 命令页不展示大块无意义本地路径。
- 全局 segmented 无竖线。

自检记录：

- 发现的问题：HTTP 环境创建入口在右侧下方，不贴近顶部环境选择；环境变量编辑是文本域；命令/Prompt/凭证仍展示过大的本地路径块；Prompt 详情无标签时保留空白。
- 修复结果：环境选择旁新增“管理环境”入口；环境变量弹窗改成 key/value 表单行；命令和 Prompt 侧栏改为紧凑 SQLite 状态，凭证本地文件块改成小型 DB 状态；Prompt 标签区仅在有标签或系统模板时展示；全局 radio button 继续加固去竖线 CSS。
- 二次自检：在工具页和 AI Chat 页实机查看 Codex / Claude radio，蓝色竖线已消失；HTTP 页面点击“管理环境”后，新增环境弹窗正常打开，变量以 key/value 表单行展示，底部按钮没有突兀白条。
- 修复结果：继续加固 Naive radio 组 CSS 变量和伪元素覆盖，避免 active border 生成蓝色分隔线；数据中心导入卡片按钮一度显示成空白小块，也已通过 `.data-center-risk-card` 按钮样式修复。
- 剩余风险：未逐个创建/删除 HTTP 环境，只验证了弹窗入口、布局和表单行；保存链路仍由既有 HTTP store/DB 持久化承接。

---

### Phase K：[x] 外观设置真实联动

目标：让主题、毛玻璃、UI 缩放真正影响全应用。

范围：

- [Image #4] UI 缩放保存后要影响全项目页面、字体、间距和主要控件。
- 毛玻璃开关保存后要改变全局卡片/面板质感。
- 主题要有明确色彩差异，不能只变化吉祥物。
- 如果某些主题破坏 Zen-iOS 审美，则收敛为少量高质量主题。

交付：

- 外观设置弹窗内预览和关闭后全局效果一致。
- 主题、毛玻璃、缩放都有实机可见效果。

自检记录：

- 发现的问题：App.vue 已写入 `--ui-scale/--ui-font-scale/data-glass/data-theme`，但 `theme-refresh.css` 又用固定 13px 和 light/dark 基础 token 覆盖，导致主题、缩放、毛玻璃体感弱。
- 修复结果：字体 token 改为跟随 `--ui-font-scale`；Zen scale/density 提升到全局；cute/office/neon/cyberpunk/void 等主题补齐 Zen token；`data-glass=false` 明确关闭主面板 blur 并使用实底背景。
- 二次自检：在唯一 Electron 窗口打开外观设置，切换主题到 `Cute 棉花糖`，弹窗显示“有未保存修改”；点击保存后弹窗关闭，主界面左上吉祥物和页面整体色调都发生变化，证明主题不再只影响弹窗。
- 修复结果：主题、毛玻璃和缩放相关 token 已接入全局 `.app-frame`、主要页面容器和 Naive 基础组件；保存后关闭弹窗的外部页面能看到效果。
- 剩余风险：已验证主题保存和全局视觉变化；毛玻璃开关与 UI 缩放只做了代码联动和弹窗可见性验证，未逐档压力测试全部页面。

---

### Phase L：[x] 全量回归与中文提交

目标：完成 H-K 后全量验证并提交。

交付：

- `pnpm run typecheck` 通过。
- `pnpm run build` 通过。
- Electron 实机检查：DB 导入、命令、凭证、Prompt、HTTP、AI Chat、外观设置、工具页。
- 中文 commit。

自检记录：

- 发现的问题：实机验证过程中一度存在两个 Electron/renderer 端口，已按用户要求收敛为单实例；后续验证只使用 `pid 26934 / localhost:5173` 当前窗口。
- 修复结果：已关闭当前唯一 Electron，并确认 `5173/5174` 无监听；`pnpm run typecheck` 通过；`pnpm run build` 通过。
- 剩余风险：仍未对旧库 HTTP 3 行到新项目 2 集合/2 请求的语义映射做逐条人工核对；图片入口仍是占位提示，不是真实多模态发送。

---

## 2. 执行流水

### 2026-04-29

- 用户清空 A-G 后，基于新截图继续提出 DB、Prompt、AI Chat、HTTP、外观、命令页和工具页问题。
- Phase H 开始：先把当前项目自身持久化从 JSON 文件切到 SQLite DB，再执行旧 DB 导入。
- Phase H-K 代码修复第一轮完成：SQLite 文档仓库、AI Chat 会话/模板入口、HTTP 环境表单、局部 UI 瘦身、外观真实联动 CSS 已落地。
- 阶段验证：`pnpm run typecheck` 已通过；下一步执行 `pnpm run build`、启动 Electron 实机点击、确认 DB 导入。
- 单实例规则补充：用户明确要求不允许同时存在两个 Electron 窗口；后续若必须重启，先关闭旧 Electron；普通 renderer/CSS 变更优先 reload 当前页面。
- 实机点击结果：AI Chat 模板填入、数据中心旧 SQLite 分析与导入、HTTP 环境管理弹窗、工具页 radio 竖线、外观主题保存联动均已在当前 Electron 窗口验证。
- 收口验证：关闭 Electron 后确认 `5173/5174` 均无监听；`pnpm run typecheck` 和 `pnpm run build` 均通过；准备中文提交。
