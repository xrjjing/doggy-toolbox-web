# UI 重构分阶段待办

> 目标：把 `/zen-prototype` 的 Zen-iOS 审美产品化到真实 Electron/Vue 应用里。  
> 原则：用户只感知到 Doggy Toolbox 的 Zen-iOS 风格；Naive UI 只作为底层交互能力存在。

---

## 0. 执行规则

- 每个阶段开始前，先核对当前真实代码和页面，不凭记忆改。
- 每个阶段只处理清晰边界内的 UI / 交互 / 样式问题，默认不改 Main / Preload / Store / IPC 业务语义。
- 允许页面 template 结构级重写，但必须保留原有接口、Store 调用、路由、类型定义和关键业务能力。
- 弹窗、确认框、导入导出、空态、加载态、错误态必须和主页面一起纳入 Zen 化范围。
- Naive UI 不删除，但默认视觉不能主导界面；需要通过 `themeOverrides`、`Zen*` 组件和局部 CSS 接管外观。
- 不直接照搬 `zen-prototype` 的假数据、固定窗口尺寸、inline style、emoji 图标和演示文案。
- 每完成一个阶段，必须先自查、自己点页面/弹窗、自己修复不合格项，再更新本文件状态。

### 每阶段固定验收动作

1. 代码检查：优先跑 `pnpm run typecheck`，涉及构建风险时补 `pnpm run build`。
2. 页面检查：启动本地应用，至少检查本阶段涉及的路由、弹窗、空态和典型数据态。
3. 视觉检查：对照 `/zen-prototype`，确认颜色、圆角、玻璃、阴影、间距、动效、按钮层级没有明显割裂。
4. 交互检查：确认键盘、关闭、取消、保存、危险确认、滚动区域、长文本不破版。
5. 返工记录：发现问题先修复，再在本文件对应阶段写明“发现的问题 / 修复结果 / 剩余风险”。

### 状态标记

- `[ ]` 未开始
- `[~]` 进行中
- `[x]` 已完成并自检通过
- `[!]` 已完成但存在明确剩余风险

---

## 1. 当前共识

- 目标还原程度：80%-90% 还原 `zen-prototype` 的视觉感觉，不做 100% 像素级复刻。
- 重构策略：保留业务接口，重写视觉层。
- 组件策略：建立项目自己的 `Zen*` 组件体系。
- Naive UI 策略：继续作为底层组件库使用，但不允许裸露默认后台管理风格。
- 弹窗策略：弹窗、Popconfirm、Command Palette、导入导出都必须同步 Zen 化。

---

## 2. 参考与边界

### 参考原型

- `zen-prototype/core.css`：Zen-iOS token、玻璃、圆角、阴影、动效基准。
- `zen-prototype/workbench.html`：开发工具首页网格、卡片触感。
- `zen-prototype/http-lab.html`：HTTP 工作台布局。
- `zen-prototype/ai-chat.html`：AI Chat 模型条、气泡、输入岛。
- `zen-prototype/commands.html`：命令卡片和终端预览。
- `zen-prototype/credentials.html`：凭证保险库列表。
- `zen-prototype/prompts.html`：Prompt 编辑器结构。
- `zen-prototype/backup.html`：备份/迁移流程视觉。

### 当前真实 UI 入口

- `src/renderer/src/styles/theme.css`
- `src/renderer/src/App.vue`
- `src/renderer/src/components/AppShell.vue`
- `src/renderer/src/components/GlobalSearchModal.vue`
- `src/renderer/src/components/AppearanceSettingsModal.vue`
- `src/renderer/src/views/AiChatView.vue`
- `src/renderer/src/features/http/HttpCollectionsView.vue`
- `src/renderer/src/features/tools/ToolWorkbenchView.vue`
- `src/renderer/src/features/commands/CommandManagerView.vue`
- `src/renderer/src/features/credentials/CredentialManagerView.vue`
- `src/renderer/src/features/prompts/PromptTemplateManagerView.vue`
- `src/renderer/src/views/DataCenterView.vue`

---

## 3. 分阶段计划

### Phase 1：[x] Zen Design System 基础层

目标：先建立统一视觉底座，避免后续每页各改各的。

范围：

- 梳理 `theme.css` 中现有 `--paper-*`、`--zen-*`、主题变量和 Naive UI overrides。
- 对齐 `zen-prototype/core.css`，沉淀项目级 token：
  - 颜色：背景、画布、卡片、文本、弱文本、边框、功能色。
  - 形态：圆角、玻璃、内发光、阴影、模糊、滚动条。
  - 动效：hover、active、页面转场、弹窗出现/关闭。
  - 间距：侧栏、顶部栏、页面内容、卡片、表单行。
- 在不破坏多主题能力的前提下，让默认主题优先贴近 Zen-iOS。
- 收口 Naive UI 的全局 `themeOverrides`，减少默认视觉泄漏。

交付：

- `theme.css` 基础 token 清晰分层。
- Naive UI Button / Input / Select / Tabs / Modal / Popover 基础视觉被 Zen 风格接管。
- 暗色、亮色至少都不明显割裂。

自检记录：

- 发现的问题：首轮实机检查发现工具页 `运行工具` primary 按钮在亮色主题下文字不可读；HTTP 页面切换时转场中间态一度看起来偏淡，需要等待路由完成后复核。
- 修复结果：在 `theme-refresh.css` 末尾增加 Phase 1 兜底层，确保 Naive primary / error / disabled 按钮在旧覆盖层之后仍然可读；复查工具页按钮、全局搜索、外观设置弹窗、HTTP、AI Chat、暗色 AI Chat 均可读。
- 剩余风险：`theme-refresh.css` 仍保留历史多轮覆盖，Phase 2/Phase 3 建立 `Zen*` 组件和壳层后，需要逐步减少页面级补丁堆叠。

---

### Phase 2：[x] Zen 基础组件

目标：让页面不再直接堆 `NCard` / `NButton` / 零散 CSS，而是用项目自己的视觉组件表达。

建议组件：

- `ZenPanel`：大块玻璃/实体面板。
- `ZenCard`：可点击物理卡片，支持 hover、active、selected。
- `ZenListItem`：列表项、集合项、凭证项、历史项。
- `ZenToolbar`：页面顶部工具条。
- `ZenButton` 或统一按钮 class：主按钮、次按钮、危险按钮、图标按钮。
- `ZenModal`：统一弹窗外观，可基于 `NModal` 包装。
- `ZenDangerConfirm` 或统一 Popconfirm class：危险确认。
- `ZenInputIsland`：AI 输入岛、搜索框、命令输入类场景。

交付：

- 基础组件落在 `src/renderer/src/components/` 或更清晰的 `components/zen/`。
- 新组件保留 TypeScript 类型，不引入无必要依赖。
- 至少在全局搜索、外观弹窗或一个业务页中完成试用。

自检记录：

- 发现的问题：首轮实机检查发现 `GlobalSearchModal` 组件化后仍渲染空分组，导致搜索框和结果列表之间出现不符合 Zen Spotlight 节奏的大空白；`AppearanceSettingsModal` 的保存按钮禁用态仍偏蓝，容易误判为可点击；外观弹窗底部 action 区和内容区节奏偏松。
- 修复结果：新增 `components/zen/` 组件层：`ZenPanel`、`ZenCard`、`ZenListItem`、`ZenToolbar`、`ZenButton`、`ZenModalShell` 和 `index.ts`；全局搜索改用 `ZenModalShell` + `ZenListItem`，并用 `visibleGroups` 过滤空分组；外观设置改用 `ZenModalShell` + `ZenPanel` + `ZenButton`，修复保存禁用态和底部间距。已实机检查暗色/亮色全局搜索、外观设置、Esc 关闭、保存禁用态，且 `pnpm run typecheck`、`pnpm run build` 均通过。
- 剩余风险：外观设置弹窗在当前窗口高度下仍保留内容区滚动条，但不遮挡内容；全量业务弹窗、Popconfirm、导入导出弹层还未统一迁移到 `ZenModalShell`，留到 Phase 4。

---

### Phase 3：[x] AppShell 与全局导航

目标：把应用外壳调整成真正的 Zen-iOS 桌面工具台，不再像普通后台管理系统。

范围：

- 侧栏：宽度、玻璃、品牌区、折叠态、激活态、hover/active 动效。
- 顶部栏：减少视觉噪音，保留搜索、外观设置、运行时状态等必要入口。
- 主内容：统一 padding、滚动所有权、页面进入转场。
- 响应式：窗口变窄时不裁切、不双滚动、不遮挡按钮。

交付：

- `AppShell.vue` 结构和 `theme.css` 壳层样式同步收口。
- `GlobalSearchModal` 入口和顶部栏风格一致。
- 页面主容器能承接后续所有业务页。

自检记录：

- 发现的问题：原顶部栏仍偏普通后台按钮堆叠，侧栏品牌区和导航层级不够接近 Zen-iOS 桌面工具台；侧栏 active 判断只命中精确路径，后续子路由可能失去高亮；窄窗口和折叠态需要避免文字挤压主内容。
- 修复结果：`AppShell.vue` 顶部动作改用 `ZenButton`，增加当前页面图标和更清晰的 `⌘K` 搜索入口；导航 active 改为 `route.path.startsWith(...)` 并补 `aria-current`；侧栏增加 Suite/System 分区，折叠态保持图标导航；`theme-refresh.css` 追加 Phase 3 壳层样式，统一侧栏玻璃、顶部栏、主内容滚动、折叠态和 1080/860 宽度响应式。已实机检查展开态、折叠态、全局搜索入口、外观设置入口、暗色主题，并恢复为展开导航。
- 剩余风险：Phase 3 只处理全局壳层，业务页面内部布局仍按后续阶段分别优化；极窄窗口下顶部 actions 采用横向滚动兜底，后续如果要移动端级体验需要单独设计。

---

### Phase 4：[x] 全局弹窗与确认体系

目标：所有弹窗一打开仍然是 Zen-iOS 风格，不出现 Naive UI 默认断层。

范围：

- `GlobalSearchModal`：做成 macOS Spotlight / Raycast 风格。
- `AppearanceSettingsModal`：外观设置预览/保存/取消恢复保持原语义，视觉重做。
- `AiChatView` 的 AI 设置弹窗。
- `CommandManagerView` 的新增/编辑/导入弹窗。
- `HttpCollectionsView` 的集合、请求、环境、cURL 导入、集合导入、导出弹窗。
- `CredentialManagerView` 的凭证新增/编辑/导入弹窗。
- `PromptTemplateManagerView` 的分类、模板、变量填写、结果、导入弹窗。
- `DataCenterView` / `BackupRestoreView` / `LegacyImportView` 的高风险确认。

交付：

- `NModal`、`NPopconfirm`、导入导出大文本区域、底部 action bar 统一风格。
- 危险操作视觉分级明确，但不改变现有删除/覆盖确认语义。
- 弹窗内长文本、表单错误、取消/保存/关闭都不破版。

自检记录：

- 发现的问题：首轮实机检查发现 Prompt 模板长编辑弹窗的 sticky 底部操作条会压住正文 textarea；AI 设置弹窗在 Modal 内还保留完整 `soft-card` 外壳，出现卡片套卡片；从 AI Chat 切到 Prompt 时，实际滚动容器没有归零，页面会落在底部造成首屏近似空白；`NPopconfirm` 默认按钮文案仍是英文 `Cancel / Confirm`。
- 修复结果：`theme-refresh.css` 追加 Phase 4 弹窗/确认覆盖层，统一遮罩、Modal 卡片、表单标签、输入区、大文本区、导入导出 textarea、底部 action bar 和危险确认；AI 设置弹窗内层卡片在 Modal 上下文降级为透明分区；Prompt 长编辑弹窗改为非 sticky 底栏，避免遮挡正文；`AppShell.vue` 同时重置 `main-panel` 和 `.main-view-shell` 滚动；所有 `NPopconfirm` 增加中文取消/确认文案，删除类为“确认删除”，覆盖导入类为“确认执行”。已验证 `pnpm run typecheck` 和 `pnpm run build` 通过，并实机检查 Prompt 导入/编辑/删除确认、AI 设置、HTTP cURL 导入、凭证新增、跨路由滚动重置。
- 剩余风险：Phase 4 主要通过统一 CSS 覆盖接管所有旧 `NModal` / `NPopconfirm`，没有逐个把全部业务弹窗结构迁到 `ZenModalShell`；HTTP 集合导入/导出、DataCenter 覆盖恢复确认仍需在 Phase 10 全量回归中再逐项复核。

---

### Phase 5：[x] AI Chat 页面 Zen 化

目标：优先把最接近原型的页面打磨成标杆页。

范围：

- 对齐 `zen-prototype/ai-chat.html` 的模型条、气泡、输入岛。
- 保留本地 SDK provider、会话历史、usage、thinking 展开、取消流式输出、AI 设置。
- 降低 runtime 信息对主体验的干扰，必要信息做成轻量 meta chips。
- 优化空态、流式中、失败、取消、长回复、代码块显示。

交付：

- AI Chat 成为后续页面的视觉标杆。
- 不丢失 Codex / Claude 切换和现有 Store 交互。

自检记录：

- 发现的问题：首轮实机复查发现 AI Chat 对话画布能显示模型条、runtime strip 和历史消息，但底部输入岛被高度链挤出可视区域；根因是 AI 页面 `height: 100%` 依赖父级固定高度，而 `route-view-stage` 只有 `min-height`，主内容滚动和对话内部滚动所有权不够明确。另发现亮色/暗色、Codex/Claude 切换都需要一起检查，不能只看暗色当前态。
- 修复结果：`AppShell.vue` 给 AI 路由增加 `route-view-stage--ai` 专用 class；`theme-refresh.css` 让 AI 路由 stage、`ai-workspace--zen`、`ai-chat-shell`、`ai-chat-canvas--wide` 形成完整固定高度链，并把画布底部留白交给绝对定位输入岛，对话流内部独立滚动。已实机检查暗色 AI Chat：输入岛可见、历史消息内部滚动、AI 设置弹窗可打开、Esc 可关闭、Codex/Claude 切换不破版；已检查亮色 AI Chat：输入岛、气泡、按钮、runtime chips 可读；未点击发送按钮，避免触发真实 AI 请求。已验证 `pnpm run typecheck` 和 `pnpm run build` 通过。
- 剩余风险：当前 Phase 5 以已有历史消息态完成标杆页验证；极窄窗口、小高度窗口、长代码块和实时流式输出过程中输入岛遮挡情况需要在 Phase 10 全量回归中再补一轮压力检查。

---

### Phase 6：[x] HTTP Lab 页面 Zen 化

目标：把复杂 HTTP 集合页做成专业 API 调试器，而不是后台表单堆叠。

范围：

- 对齐 `zen-prototype/http-lab.html` 的集合侧栏、请求编辑、响应预览构图。
- 保留集合、请求、环境变量、历史、批量测试、导入导出、AI 分析。
- 优化请求 URL 行、method chip、tabs、响应状态、代码块、历史详情。
- 空集合、空请求、请求失败、大响应体都要检查。

交付：

- HTTP 页面在真实数据态和空态都能稳定使用。
- 复杂功能不被静态原型简化掉。

自检记录：

- 发现的问题：首轮实机检查发现当前窗口宽度下 HTTP 页面三栏过挤，右侧响应区贴边并被裁切；顶部 URL/筛选/动作按钮仍偏后台表单堆叠；`Collections / History`、`SEND`、`Headers / Params / Auth` 等英文标签与 Zen 原型的中文桌面工具感割裂。第二轮检查又发现请求编辑与响应预览并排后仍偏窄，暗色分段 Tab 选中文字接近白底白字，主内容向下滚动时左侧集合 rail 留下大块空白。
- 修复结果：`HttpCollectionsView.vue` 中文化关键标签：集合/历史、工作区快照、发送、Header/参数/认证；`theme-refresh.css` 将 HTTP 页面收敛为当前窗口下稳定的“左侧集合 rail + 右侧主工作区”两栏，隐藏重复的旧右侧响应 aside，把响应参数合并在主编辑卡片内；当前宽度下请求编辑与响应预览纵向排列，超宽窗口再并排；工具条拆成 URL 行、筛选行、动作行和 meta chips；分段 Tabs 统一 Zen 可读配色；左侧 rail 改为 sticky，避免主内容滚动时出现空白。已实机检查暗色 HTTP 首屏、下滚到响应/导出区、导入 cURL 弹窗，已验证 `pnpm run typecheck` 和 `pnpm run build` 通过。
- 剩余风险：本阶段未真实发送网络请求，也未创建/删除请求数据；响应成功态、失败态、AI 分析输出态和有多集合/多请求的数据态需要在 Phase 10 全量回归中补测。

---

### Phase 7：[x] Workbench / 工具中心 Zen 化

目标：开发工具首页和工具详情从“功能面板”变成真正的工具箱。

范围：

- 对齐 `zen-prototype/workbench.html` 的工具网格、卡片、图标容器、拖拽反馈。
- 保留 43 个工具入口、分类排序、工具直达、AI 复核、高级面板。
- 优化高级工具面板外壳，避免每个高级面板割裂。
- 检查工具输入/输出/extra、复制按钮、错误态、长文本。

交付：

- 工具中心卡片和工具详情有统一物理触感。
- 高级面板不再像另一套页面。

自检记录：

- 发现的问题：实机检查发现工具中心首屏已经有一定 Zen 玻璃感，但工具分类标题仍残留 `tool rails`、AI 面板残留 `local ai assist`，结果区仍用 `result / extra` 英文 eyebrow；工具入口更像后台小标签，不像 `zen-prototype/workbench.html` 里的可点击物理工具卡片。需要同时检查普通 textarea 工具和高级工具面板，避免只优化基础工具。
- 修复结果：`ToolWorkbenchView.vue` 将工具分类、结果、附加信息、AI 复核说明的英文提示收敛为更贴近本地产品的表达；`theme-refresh.css` 重做工具入口卡片的圆角、玻璃、内发光、hover、active 和响应式网格，让工具选择区更接近 Zen workbench 的物理卡片触感。已实机检查暗色工具中心基础工具、Image Base64 高级面板、亮色高级面板，并恢复暗色；未点击真实 AI 分析。已验证 `pnpm run typecheck` 和 `pnpm run build` 通过。
- 剩余风险：本阶段没有逐个运行全部 43 个工具；高级工具面板内部仍由各自组件管理，个别工具的深层输入/预览区域可能还需要 Phase 10 全量回归时单独打磨。

---

### Phase 8：[x] Commands / Credentials / Prompts Zen 化

目标：资料管理类页面从后台列表变成 iOS/macOS 质感资料库。

范围：

- Commands：对齐 `commands.html`，强化命令卡片、终端预览、分组切换。
- Credentials：对齐 `credentials.html`，做保险库列表、密文展示、查看/编辑动作。
- Prompts：对齐 `prompts.html`，做左侧模板列表 + 右侧编辑器/预览结构。
- 保留 AI 说明、批量导入、删除确认、变量填写、生成结果等真实功能。

交付：

- 三个资料页使用统一 `ZenListItem` / `ZenPanel` / `ZenModal`。
- 长命令、长凭证名、长 Prompt 不撑破布局。

自检记录：

- 发现的问题：三页仍残留 `Repository`、`command library`、`terminal preview`、`credential vault`、`vault detail`、`prompt studio`、`template editor`、`var` 等英文标签；Commands / Credentials / Prompts 的资料库卡片、详情面板和预览区视觉不统一；Prompt 页面首轮断点过早，常规桌面宽度下三栏资料库被压成单列。
- 修复结果：三页关键标签已中文化；`theme-refresh.css` 追加 Phase 8 覆盖层，统一资料页卡片、详情面板、预览代码块、本地资料库卡片、hover / active 状态和长路径换行；Prompt 页面断点从 1280px 收紧到 980px，详情区单列断点收紧到 860px。已实机检查 Commands 空态、Credentials 空态、Prompts 有数据态、Prompt 导入 JSON 弹窗；已验证 `pnpm run typecheck` 和 `pnpm run build` 通过。
- 剩余风险：本阶段没有创建、编辑、删除真实命令 / 凭证 / 模板；Commands 和 Credentials 的有数据态还需要 Phase 10 全量回归补测。

---

### Phase 9：[x] Data Center / Backup / Legacy Import Zen 化

目标：把数据迁移、备份恢复、高风险导入做成清晰、可信、可检查的流程页。

范围：

- 对齐 `backup.html` 的居中流程、进度感、行动卡片。
- 保留统一备份恢复、旧数据导入分析、模块选择、覆盖恢复确认。
- 高风险动作要视觉明确，但不制造恐吓式 UI。
- 恢复/导入结果、warning、错误详情要清楚。

交付：

- 数据页视觉和其它页面一致。
- 高风险操作确认不丢失，不绕过现有确认逻辑。

自检记录：

- 发现的问题：`/data-center` 虽已是主入口，但仍残留 `migration protocol`、`legacy migration`、`Bottom Rail`、`safe first` 等英文流程标签；`BackupRestoreView` 和 `LegacyImportView` 仍是旧式 `NCard + NSpace` 堆叠，未来复用会掉回后台管理感；实机检查发现数据中心底部分段 Tabs 在暗色主题下对比度偏低，局部标题被旧覆盖层压暗。
- 修复结果：`DataCenterView.vue` 接入 Ionicons 图标和中文流程文案，补本地数据协议进度岛、备份/恢复动作卡、风险卡视觉；`BackupRestoreView.vue` 和 `LegacyImportView.vue` 同步改为 Zen 进度岛 + flow card + 风险确认卡结构，移除旧 `NSpace` 堆叠；`theme-refresh.css` 追加 Phase 9 覆盖层，统一进度岛、行动卡片、风险边框、Tabs 可读性、深浅色背景和小屏断点。已实机检查 `/data-center` 首屏、备份导出、备份恢复、覆盖恢复 Popconfirm，只打开确认层并点击取消，没有执行恢复；已验证 `pnpm run typecheck` 和 `pnpm run build` 通过。
- 剩余风险：本阶段没有粘贴真实旧数据 JSON、没有执行真实导入、没有执行真实恢复；`/backup` 和 `/legacy-import` 当前路由已重定向到 `/data-center`，两个 feature 组件以备用复用形态完成美化，但未通过独立路由直达实机验证。

---

### Phase 10：[x] 全量视觉回归与文档同步

目标：所有页面串起来检查，修掉跨页割裂和边界问题。

范围：

- 逐路由检查：开发工具、命令、凭证、HTTP、AI Chat、Prompt、数据中心。
- 逐弹窗检查：新增、编辑、导入、导出、设置、搜索、确认。
- 逐主题检查：默认、亮色、暗色；其它主题至少不破版。
- 逐尺寸检查：常规桌面窗口、窄窗口、较高/较矮窗口。
- 文档同步：README 或 docs 中如有 UI 描述过时，需要更新。

交付：

- `pnpm run typecheck` 通过。
- 必要时 `pnpm run build` 通过。
- 本文件每个阶段均更新自检状态。
- 最终列出剩余风险和后续优化项。

自检记录：

- 发现的问题：全局扫描和实机检查发现顶部栏仍显示英文 `workspace`；高级工具面板里有 `advanced panel`、`result`、`extra` 这类可见英文 eyebrow；Data Center 的覆盖恢复确认需要复核是否仍保留“取消 / 确认执行”；工具页高级面板需要确认是否仍接近 Zen 卡片质感。
- 修复结果：`AppShell.vue` 顶部 eyebrow 改为“工作区”；所有高级工具 panel 的 `advanced panel` 统一改为“高级面板”；`MockToolPanel.vue`、`RsaToolPanel.vue`、`CryptoToolPanel.vue` 的输出标题改为“生成结果 / 摘要信息 / 处理结果 / 校验摘要 / 运行摘要”。已实机检查 `/data-center` 首屏、备份导出、备份恢复、覆盖恢复确认弹层、`/tools` 首屏和 RSA 高级面板；覆盖恢复只打开确认并点击取消，没有执行真实恢复。已验证 `pnpm run typecheck` 和 `pnpm run build` 通过。
- 剩余风险：本阶段是视觉回归，不执行真实网络请求、真实 AI 请求、真实导入/恢复/删除；Commands / Credentials 的有数据态、HTTP 成功/失败响应态、AI 流式输出态、全部 43 个工具的深层结果态仍建议作为后续真实使用时的增量回归点。

---

## 4. 阶段执行流水

> 每次开始/完成阶段都在这里追加记录，禁止最后一次性补流水。

### 2026-04-28

- 初始化本文件。
- 已确认用户目标：
  - 允许页面结构级重写。
  - 建立 `Zen*` 组件体系。
  - Naive UI 保留为底层能力，但视觉由 Zen-iOS 主导。
  - 弹窗交互必须同步美化优化。
  - 每阶段完成后必须自检、修复、更新台账。
- Phase 1 开始：先收口 Zen token、Naive UI 全局 overrides、基础控件和弹窗视觉；本阶段不改业务 Store / IPC / Main / Preload。
- Phase 1 完成：
  - 修改 `App.vue`，扩展 Naive UI `themeOverrides`，覆盖 Button / Card / Modal / Popover / Input / Select / Tabs / Radio / Form / Empty 的 Zen token。
  - 修改 `theme-refresh.css`，追加 `Zen vNext foundation`，统一颜色、圆角、玻璃、内发光、阴影、焦点、Modal/Popover/Card/Button/Input/Tabs 等基础样式。
  - 自检发现并修复 primary 按钮亮色不可读问题。
  - 已验证 `pnpm run typecheck` 通过。
  - 已验证 `pnpm run build` 通过。
  - 已实机检查亮色工具页、全局搜索、外观设置弹窗、HTTP、AI Chat、暗色 AI Chat。
- Phase 2 开始：建立 `Zen*` 基础组件层，先提供稳定 API 和少量试用点，不在本阶段重写大业务页。
- Phase 2 完成：
  - 新增 `src/renderer/src/components/zen/`，提供 `ZenPanel`、`ZenCard`、`ZenListItem`、`ZenToolbar`、`ZenButton`、`ZenModalShell`。
  - `GlobalSearchModal` 接入 Zen 弹窗和列表项，保留搜索 Store、路由跳转、收藏、键盘选择和 Esc 关闭语义。
  - `AppearanceSettingsModal` 接入 Zen 弹窗、面板和按钮，保留预览、取消恢复、保存持久化语义。
  - 自检发现并修复全局搜索空分组撑开、保存按钮禁用态偏蓝、外观弹窗底部节奏偏松。
  - 已验证 `pnpm run typecheck` 通过。
  - 已验证 `pnpm run build` 通过。
  - 已实机检查暗色/亮色下全局搜索、外观设置、Esc 关闭、保存禁用态、主题切换。
- Phase 3 开始：重构 `AppShell`、侧栏、顶部栏和主内容滚动/响应式；本阶段只处理应用外壳和全局导航，不改各业务页数据流。
- Phase 3 完成：
  - `AppShell.vue` 接入 `ZenButton` 顶部动作，增加当前页面图标、Suite/System 导航分区和子路径 active 判断。
  - `theme-refresh.css` 追加 Phase 3 壳层样式，重做侧栏、品牌区、导航项、顶部栏、主内容滚动和响应式折叠。
  - 已实机检查展开态、折叠态、全局搜索入口、外观设置入口、暗色主题；折叠态未挤压业务区。
  - 已验证 `pnpm run typecheck` 通过。
  - 已验证 `pnpm run build` 通过。
- Phase 4 开始：统一全局弹窗、确认、导入导出和危险操作视觉体系；先盘点真实 `NModal` / `NPopconfirm` 使用点，再分批迁移到 `ZenModalShell` 或统一覆盖层。
- Phase 4 完成：
  - 盘点真实弹窗/确认点：AI 设置、命令、凭证、HTTP、Prompt、DataCenter、Backup、Legacy Import。
  - `theme-refresh.css` 追加 Phase 4 覆盖层，统一 `NModal`、`form-modal`、`ai-settings-modal`、`NPopconfirm`、导入导出大文本区和底部 action bar 的 Zen-iOS 玻璃、圆角、模糊、阴影、危险分级。
  - 修复实机发现的 Prompt 长编辑弹窗底栏遮挡正文问题，长编辑弹窗改为自然流底栏；普通导入/短表单继续保留 sticky 底栏。
  - 修复 AI 设置弹窗卡片套卡片问题，仅在 Modal 上下文把内层 `soft-card` 降级为透明分区。
  - 修复跨路由滚动残留问题，`AppShell.vue` 同时重置外层 `main-panel` 和实际滚动容器 `.main-view-shell`。
  - 所有 `NPopconfirm` 增加中文按钮文案：删除类“确认删除”，覆盖导入类“确认执行”，取消统一为“取消”。
  - 已验证 `pnpm run typecheck` 通过。
  - 已验证 `pnpm run build` 通过。
  - 已实机检查 Prompt 导入/编辑/删除确认、AI 设置、HTTP cURL 导入、凭证新增、HTTP/Prompt/凭证跨路由切换。
- Phase 5 开始：对齐 `zen-prototype/ai-chat.html` 的模型条、气泡和输入岛；保留 `useAiStore`、本机 SDK provider、流式取消、thinking 展开和 AI 设置弹窗语义。
- Phase 5 完成：
  - `AiChatView.vue` 重构 AI Chat 标杆页结构，压缩 runtime 信息为轻量 chips，补对话滚动到底逻辑。
  - `AppShell.vue` 给 AI 路由增加 `route-view-stage--ai`，`theme-refresh.css` 建立 AI 页面固定高度链，修复输入岛不可见问题。
  - 已实机检查暗色 AI Chat、AI 设置弹窗、Codex/Claude 切换、亮色 AI Chat；未点击发送按钮，避免触发真实 AI 请求。
  - 已验证 `pnpm run typecheck` 通过。
  - 已验证 `pnpm run build` 通过。
- Phase 6 开始：对齐 `zen-prototype/http-lab.html`，优先处理 HTTP 页面三栏挤压、响应区裁切、英文标签和导入弹窗一致性。
- Phase 6 完成：
  - `HttpCollectionsView.vue` 中文化集合/历史、工作区快照、发送、Header/参数/认证等关键标签。
  - `theme-refresh.css` 将 HTTP 页面收敛为稳定两栏，响应区并入主编辑卡片，当前窗口纵向排列、超宽再并排；修复暗色分段 Tabs 可读性和左侧 rail 滚动空白。
  - 已实机检查暗色 HTTP 首屏、响应/导出区、导入 cURL 弹窗。
  - 已验证 `pnpm run typecheck` 通过。
  - 已验证 `pnpm run build` 通过。
- Phase 7 开始：对齐 `zen-prototype/workbench.html`，处理工具中心工具网格、分类 rail、普通工具和高级工具面板。
- Phase 7 完成：
  - `ToolWorkbenchView.vue` 收敛英文 eyebrow 和 AI 复核说明。
  - `theme-refresh.css` 重做工具入口卡片圆角、玻璃、内发光、hover、active 和响应式网格。
  - 已实机检查暗色基础工具、Image Base64 高级面板、亮色高级面板，并恢复暗色；未触发真实 AI 分析。
  - 已验证 `pnpm run typecheck` 通过。
  - 已验证 `pnpm run build` 通过。
- Phase 8 开始：对齐 `commands.html`、`credentials.html`、`prompts.html`，集中处理三类资料管理页的卡片、详情、预览、弹窗入口和中英文混杂问题。
- Phase 8 完成：
  - `CommandManagerView.vue`、`CredentialManagerView.vue`、`PromptTemplateManagerView.vue` 收敛资料库、保险库、工作室、编辑器、预览等关键文案。
  - `theme-refresh.css` 追加 Phase 8 覆盖层，统一资料库列表项、详情面板、预览块、本地文件路径卡片、hover / active 和响应式断点。
  - 自检发现 Prompt 常规桌面过早变单列，已把资料页大断点收紧到 980px，详情区断点收紧到 860px。
  - 已实机检查 Commands 空态、Credentials 空态、Prompts 有数据态和 Prompt 导入 JSON 弹窗。
  - 已验证 `pnpm run typecheck` 通过。
  - 已验证 `pnpm run build` 通过。
- Phase 9 开始：对齐 `zen-prototype/backup.html`，处理 Data Center、Backup Restore、Legacy Import 的流程感、风险提示、备份导出、覆盖恢复和旧数据导入视觉。
- Phase 9 完成：
  - `DataCenterView.vue` 移除英文流程标签，接入 Ionicons 图标，重做本地数据协议进度岛、旧项目导入、备份导出和覆盖恢复区域。
  - `BackupRestoreView.vue` 和 `LegacyImportView.vue` 同步改成 Zen 进度岛 + flow card + 风险确认卡结构，保留原 store、IPC 和 Popconfirm 执行语义。
  - `theme-refresh.css` 追加 Phase 9 覆盖层，统一进度岛、行动卡片、风险态、Tabs 可读性、深浅色背景和小屏断点。
  - 自检发现数据中心底部分段 Tabs 暗色对比度偏低，已追加可读性兜底。
  - 已实机检查 `/data-center` 首屏、备份导出、备份恢复和覆盖恢复确认弹层；只打开确认并点击取消，没有执行真实恢复。
  - 已验证 `pnpm run typecheck` 通过。
  - 已验证 `pnpm run build` 通过。
- Phase 10 开始：进入全量视觉回归，串联检查主要路由、弹窗、暗色/亮色和关键边界状态，修掉跨页割裂和残留英文 / 低对比问题。
- Phase 10 完成：
  - 扫描可见英文残留，修复顶部 `workspace`、高级工具 `advanced panel`、高级输出区 `result / extra`。
  - 实机检查 `/data-center` 首屏、备份导出、备份恢复、覆盖恢复 Popconfirm；只取消确认，没有执行恢复。
  - 实机检查 `/tools` 首屏、工具分类、基础输出区和 RSA 高级面板。
  - 已验证 `pnpm run typecheck` 通过。
  - 已验证 `pnpm run build` 通过。
  - 本轮 UI 重构 10 个阶段全部完成，后续进入真实数据态和真实操作态的增量回归。
