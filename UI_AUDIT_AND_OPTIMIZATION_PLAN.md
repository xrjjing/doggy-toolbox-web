# UI 审计与全方位优化方案 (Zen-iOS Hybrid)

本报告针对当前项目的 UI 布局、页面、主题及交互体验进行了深度检查，并结合 `zen-prototype` 的设计标准，总结了不合理之处及优化建议。

---

## 1. 核心问题审计 (Audit Results)

### 1.1 CSS 架构：过度依赖“手术式”覆盖 (Patchwork CSS)
- **现状**: 目前主要依靠 `theme-refresh.css` 对 Naive UI 进行全局 `!important` 覆盖。
- **不合理处**: 这种做法导致样式难以维护，且 Naive UI 的底层 DOM 结构与 Zen 设计语言的“物理质感”（如内阴影、多层边框）存在天然冲突。
- **表现**: 样式优先级混乱，部分组件在暗色模式下边缘模糊，缺乏“玻璃切面”的锐利感。

### 1.2 物理触感：缺失的容器细节 (Missing Tactile Details)
- **现状**: 使用了 `backdrop-filter`，但缺乏 `zen-prototype` 中的核心物理特性。
- **不合理处**:
    - **内发光 (Inner Glow)**: 缺少 `inset 0 0 0 1px var(--inner-glow)`，导致卡片看起来像是贴在背景上，而不是悬浮或嵌入。
    - **图标容器 (Icon Box)**: 很多地方直接使用了图标，缺少像原型中那样的“凹陷/喷砂”质感容器。
    - **呼吸感**: 页面边距（Padding）在小屏幕或窗口缩放时表现不一致，没有强制执行 Zen 标准的大间距（p-6/p-8）。

### 1.3 逻辑结构：单体式视图 (Monolithic Views)
- **现状**: `ToolWorkbenchView.vue` 承担了 50 多个工具的渲染逻辑、状态管理和 AI 逻辑。
- **不合理处**: 一个文件近 600 行，违反了组件化原则。工具的配置逻辑与渲染布局高度耦合，导致 UI 扩展困难。

### 1.4 交互反馈：缺乏动态深度 (Lack of Dynamic Depth)
- **现状**: 点击有 `scale(0.95)`，但缺乏 iOS 级别的动效。
- **不合理处**: 悬停（Hover）状态过于死板。原型中的 `translateY(-6px)` 和图标旋转旋转没有在主应用中充分体现。

---

## 2. 待优化项 (Optimization Backlog)

### A. 视觉层 (Visual Layer)
1. **统一调色盘**: 废弃 `theme.css` 中的陈旧变量，完全对齐 `zen-prototype/core.css` 的 iOS 系统级灰（#F2F2F7）。
2. **物理边框系统**: 为所有 `.zen-card` 和 `.n-card` 引入“双层物理描边”：内描边捕捉光线，外描边定义轮廓。
3. **模糊度分级**: 
    - 背景层 (Background): `blur-none`
    - 侧边栏 (Sidebar): `blur-[40px]`
    - 模态框 (Modal): `blur-[60px]`

### B. 组件层 (Component Layer)
1. **重构图标容器**: 封装 `ZenIconBox` 组件，提供统一的阴影深度和圆角。
2. **Naive UI 彻底覆盖**: 通过 `NConfigProvider` 的 `theme-overrides` 注入 Zen 变量，减少 CSS 文件的 `!important` 数量。
3. **按钮分级**: 
    - 主按钮: 深空黑 [#1C1C1E]，白字，高投影。
    - 次级按钮: 纯白/半透明玻璃感。

### C. 架构层 (Architectural Layer)
1. **工具逻辑解耦**: 将 50 多个工具的 `runTool` 逻辑抽离到独立的 `useToolLogic.ts` 或各个工具的配置文件中。
2. **动画增强**: 引入 `framer-motion` 式的页面转场（已部分实现，需增强物理回弹感）。

---

## 3. 修复指令 (Instructions for Codex)

**以下是 Codex 进行下一步修复的步骤指南：**

### 第一步：CSS 清洗与变量对齐
- 将 `zen-prototype/core.css` 中的变量定义迁移至 `src/renderer/src/styles/theme-refresh.css` 的根部。
- 确保 `--bg-base`, `--bg-canvas`, `--inner-glow`, `--shadow-soft` 等变量在全应用范围内可用。

### 第二步：物理容器组件化
- 在 `src/renderer/src/components/` 下新建 `ZenCard.vue`。
- 实现具有 `inner-glow` 和 `shadow-soft` 的容器，并替换 `ToolWorkbenchView.vue` 中的普通 `NCard`。

### 第三步：导航与布局微调
- 修改 `AppShell.vue`，使侧边栏和主面板的 `backdrop-filter` 分层更明显。
- 增加侧边栏激活项的“物理回弹”反馈：`active:scale-[0.98]`。

### 第四步：工具页重构 (核心任务)
- 将 `ToolWorkbenchView.vue` 中的 50 多个 `case` 逻辑拆分为独立的工具函数。
- 为工具列表添加 Grid 动画，支持 Hover 时的 `translateY` 效果。

---

## 4. 结论 (Conclusion)

当前 UI 已具备“禅意”雏形，但细节上的“塑料感”依然存在。通过强制对齐 **Zen-iOS Hybrid** 的物理变量和重构单体视图，可以将其提升至专业级生产力工具的质感。

**请 Codex 优先处理 CSS 变量对齐和单体视图的逻辑拆分。**
