````
# CLAUDE.md

## 0. Global Protocols
所有操作必须严格遵循以下系统约束：
- **交互语言**：工具与模型交互强制使用 **English**；用户输出强制使用 **中文**。
- **多轮对话**：如果工具返回的有可持续对话字段 ，比如 `SESSION_ID`，表明工具支持多轮对话，此时记录该字段，并在随后的工具调用中**强制思考**，是否继续进行对话。例如， Codex/Gemini有时会因工具调用中断会话，若没有得到需要的回复，则应继续对话。
- **沙箱安全**：严禁 Codex/Gemini 对文件系统进行写操作。所有代码获取必须请求 `unified diff patch` 格式。
- **代码主权**：外部模型生成的代码仅作为逻辑参考（Prototype），最终交付代码**必须经过重构**，确保无冗余、企业级标准。
- **风格定义**：整体代码风格**始终定位**为，精简高效、毫无冗余。该要求同样适用于注释与文档，且对于这两者，严格遵循**非必要不形成**的核心原则。
- **仅对需求做针对性改动**，严禁影响用户现有的其他功能。
- **Git 提交规范** ⚠️：
  - **严禁自动提交**：在用户明确说出"提交"、"commit"、"可以提交了"等指令前，**绝对不允许**执行 `git commit` 操作。
  - **提交信息格式**：禁止在提交信息中出现 "Claude"、"Codex"、"Gemini"、"AI"、"Claude Code" 等字样。使用 Conventional Commits 格式：`<type>: <description>`（type 包括：feat、fix、docs、style、refactor、test、chore）。

## 1. Workflow

### Phase 1: 上下文全量检索 (Auggie Interface)
**执行条件**：在生成任何建议或代码前。
1.  **工具调用**：调用 `mcp__auggie-mcp__codebase-retrieval`。
2.  **检索策略**：
    - 禁止基于假设（Assumption）回答。
    - 使用自然语言（NL）构建语义查询（Where/What/How）。
    - **完整性检查**：必须获取相关类、函数、变量的完整定义与签名。若上下文不足，触发递归检索。
3.  **需求对齐**：若检索后需求仍有模糊空间，**必须**向用户输出引导性问题列表，直至需求边界清晰（无遗漏、无冗余）。

### Phase 2: 多模型协作分析 (Analysis & Strategy)
**执行条件**：上下文就绪后，编码开始前。
1.  **分发输入**：：将用户的**原始需求**（不带预设观点）分发给 Codex 和 Gemini。注意，Codex/Gemini都有完善的CLI系统，所以**无需给出过多上下文**。
2.  **方案迭代**：
    - 要求模型提供多角度解决方案。
    - 触发**交叉验证**：整合各方思路，进行迭代优化，在过程中执行逻辑推演和优劣势互补，直至生成无逻辑漏洞的 Step-by-step 实施计划。
3.  **用户确认**：向用户展示最终实施计划（含适度伪代码）。

**调用方式 (codeagent-wrapper)**：

**后端分工**：
| 后端 | 命令 | 擅长领域 |
|------|------|---------|
| Codex | `--backend codex` | 代码分析、复杂逻辑、重构、Bug 定位（**默认**） |
| Claude | `--backend claude` | 文档编写、Prompt 工程、快速实现 |
| Gemini | `--backend gemini` | UI/UX 原型、前端设计、样式布局 |

**后端选择硬性规则** ⚠️：
| 任务类型 | 必须使用 | 严禁使用 |
|---------|---------|---------|
| Java/Go/Python/Rust/C++ 后端代码 | **Codex** | ❌ Gemini |
| 数据库/SQL/ORM 相关 | **Codex** | ❌ Gemini |
| 算法/业务逻辑/API 实现 | **Codex** | ❌ Gemini |
| HTML/CSS/JavaScript 前端代码 | Gemini 或 Codex | ✅ 均可 |
| Vue/React/前端框架组件 | **Gemini**（优先） | ✅ Codex 可用 |
| UI/UX 原型设计 | **Gemini** | ✅ Codex 可用 |
| 文档/README/Prompt 工程 | **Claude** | ✅ 均可 |

**单任务调用格式**：
```bash
# HEREDOC 格式（推荐）
codeagent-wrapper --backend <backend> - [working_dir] <<'EOF'
<task content here>
Use @file references to specify files.
EOF

# 简单格式
codeagent-wrapper --backend <backend> "task description" [working_dir]
````

**并行任务调用格式**：

```bash
# 默认 summary 模式（精简输出，推荐）
codeagent-wrapper --parallel <<'EOF'
---TASK---
id: task_id
backend: codex|gemini|claude
workdir: /path/to/project
dependencies: other_task_id
---CONTENT---
Task content here
EOF

# 调试模式（完整输出）
codeagent-wrapper --parallel --full-output <<'EOF'
...
EOF
```

**Session 恢复**：

```bash
# 必须指定 backend
codeagent-wrapper --backend codex resume <session_id> - <<'EOF'
<follow-up task>
EOF
```

**Bash 工具参数**：

- `command`: 上述命令
- `timeout`: 7200000（固定值，2小时）
- `description`: 简短描述任务内容

**重要约定**：

- 使用英文与各后端交流
- 使用 `@file` 引用文件路径
- 索要原型时明确要求 "unified diff patch" 和 "DO NOT make actual changes"
- 必须设置 timeout: 7200000
- 使用 HEREDOC (`<<'EOF' ... EOF`) 处理多行内容
- 并行任务时合理设置 dependencies 确保执行顺序

**环境变量**：

- `CODEX_TIMEOUT`: 超时时间（毫秒），默认 7200000
- `CODEAGENT_SKIP_PERMISSIONS`: Claude 后端跳过权限检查（设为 `true`/`1`）
- `CODEAGENT_MAX_PARALLEL_WORKERS`: 并行任务最大并发数（默认无限制，建议 8）

### Phase 3: 原型获取 (Prototyping)

**执行条件**：实施计划确认后。根据任务类型路由：

- **Route A: 前端/UI/样式 (Gemini Kernel)**
  - **限制**：上下文 < 32k。gemini对于后端逻辑的理解有缺陷，其回复需要客观审视。
  - **指令**：请求 CSS/React/Vue 原型。以此为最终前端设计原型与视觉基准。
- **Route B: 后端/逻辑/算法 (Codex Kernel)**
  - **能力**：利用其逻辑运算与 Debug 能力。
  - **指令**：请求逻辑实现原型。
- **通用约束**：：在与Codex/Gemini沟通的任何情况下，**必须**在 Prompt 中**明确要求** 返回 `Unified Diff Patch`，严禁Codex/Gemini做任何真实修改。

### Phase 4: 编码实施 (Implementation)

**执行准则**：

1.  **逻辑重构**：基于 Phase 3 的原型，去除冗余，**重写**为高可读、高可维护性、企业发布级代码。
2.  **文档规范**：非必要不生成注释与文档，代码自解释。
3.  **最小作用域**：变更仅限需求范围，**强制审查**变更是否引入副作用并做针对性修正。

### Phase 5: 审计与交付 (Audit & Delivery)

1.  **自动审计**：变更生效后，**强制立即调用** Codex 进行 Code Review，并进行整合修复。
    - 检查项：逻辑正确性、需求覆盖率、潜在 Bug。
2.  **交付**：审计通过后反馈给用户。

**调用方式 (codex-review)**：

**标准调用格式**：

```bash
codex --full-auto -C "<仓库路径>" review --uncommitted
```

**Bash 工具参数**：

- `command`: 上述命令
- `timeout`: 900000（固定值，15分钟）
- `description`: "代码审查"

**完整审核协议**：

1. **检查 CHANGELOG**：运行 `git diff --name-only | grep -E "(CHANGELOG|changelog)"` 检查是否更新，如果未更新，必须自动生成并写入 CHANGELOG.md
2. **Lint & Format**：根据项目类型执行相应的格式化命令（如 `black .`、`npm run lint:fix`、`go fmt ./...`）
3. **执行 codex review**：运行上述标准调用格式
4. **自我修正**：如果 Codex 发现问题，根据建议修复代码或更新 CHANGELOG

**注意事项**：

- 确保在 git 仓库目录下执行
- CHANGELOG.md 必须在未提交变更中
- 使用 `--full-auto` 避免交互式提示

## 2. Resource Matrix

此矩阵定义了各阶段的**强制性**资源调用策略。Claude 作为**主控模型 (Orchestrator)**，必须严格根据当前 Workflow 阶段，按以下规格调度外部资源。

| Workflow Phase           | Functionality           | Designated Model / Tool                  | Input Strategy (Prompting)                                     | Strict Output Constraints                           | Critical Constraints & Behavior                                                                                                       |
| :----------------------- | :---------------------- | :--------------------------------------- | :------------------------------------------------------------- | :-------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------ |
| **Phase 1**              | **Context Retrieval**   | **Auggie** (`mcp__auggie`)               | **Natural Language (English)**<br>Focus on: _What, Where, How_ | **Raw Code / Definitions**<br>(Complete Signatures) | • **Forbidden:** `grep` / keyword search.<br>• **Mandatory:** Recursive retrieval until context is complete.                          |
| **Phase 2**              | **Analysis & Planning** | **Codex** AND **Gemini**<br>(Dual-Model) | **Raw Requirements (English)**<br>Minimal context required.    | **Step-by-Step Plan**<br>(Text & Pseudo-code)       | • **Action:** Cross-validate outputs from both models.<br>• **Goal:** Eliminate logic gaps before coding starts.                      |
| **Phase 3**<br>(Route A) | **Frontend / UI / UX**  | **Gemini**                               | **English**<br>Context Limit: **< 32k tokens**                 | **Unified Diff Patch**<br>(Prototype Only)          | • **Truth Source:** The only authority for CSS/React/Vue styles.<br>• **Warning:** Ignore its backend logic suggestions.              |
| **Phase 3**<br>(Route B) | **Backend / Logic**     | **Codex**                                | **English**<br>Focus on: Logic & Algorithms                    | **Unified Diff Patch**<br>(Prototype Only)          | • **Capability:** Use for complex debugging & algorithmic implementation.<br>• **Security:** **NO** file system write access allowed. |
| **Phase 4**              | **Refactoring**         | **Claude (Self)**                        | N/A (Internal Processing)                                      | **Production Code**                                 | • **Sovereignty:** You are the specific implementer.<br>• **Style:** Clean, efficient, no redundancy. Minimal comments.               |
| **Phase 5**              | **Audit & QA**          | **Codex** AND **Gemini**<br>(Dual-Model) | **Unified Diff** + **Target File**<br>(English)                | **Review Comments**<br>(Potential Bugs/Edge Cases)  | • **Mandatory:** Triggered immediately after code changes.<br>• **Action:** Synthesize feedback into a final fix.                     |

```

----
```
