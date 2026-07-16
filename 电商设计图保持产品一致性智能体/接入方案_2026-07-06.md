# 电商设计图产品一致性智能体 — 外部 Agent 安全接入方案

> 角色：电商设计图产品一致性智能体接入工程师  
> 任务：只做项目理解和接入设计，不写代码  
> 日期：2026-07-06

---

## 一、项目架构摘要

### 1.1 当前系统是什么

这是一个**电商产品图全自动生成系统**（顶级版 v5），输入产品图 → 全自动生成 10 张情绪化上架图 + 排版 + 多平台尺寸 + A/B 测试 + 反馈学习。系统已进化到 **Multi-Agent 3.0 架构**。

### 1.2 已有哪些 Agent

| Agent | 文件 | 职责 | 状态 |
|-------|------|------|------|
| **Observer** | `agents/observer.py` | 理解用户意图、派发任务、监督验证、任务复盘、回复用户 | 稳定 |
| **OrchestratorBrain** | `agents/orchestrator.py` | LLM 编排器（意图识别 + 多步任务分解 + 子 Agent 路由） | 稳定 |
| **Executor** | `agents/executor.py` | 执行编排器，能力注册表路由 + 声明式管线图执行 | 稳定 |
| **AnalystAgent** | `agents/analyst.py` | 产品分析 + 场景匹配 | 稳定 |
| **GeneratorAgent** | `agents/generator.py` | 批量生成 + 多引擎调度 | 稳定 |
| **LayoutAgent** | `agents/layout.py` | 后处理 → 排版 → 多平台 | 稳定 |
| **QAAgent** | `agents/qa.py` | 一致性检测 + 情绪评分 | 稳定 |
| **ResearcherAgent** | `agents/researcher.py` | 联网搜索竞品/抓取页面/下载参考图 | 稳定 |
| **SubAgent 基类** | `agents/base_sub_agent.py` | 所有子 Agent 基类 | 稳定 |
| **Web UI** | `web/app.py` + `web/engine.py` | Flask Web 界面 + DualAgentEngine | 稳定 |
| **MCP Server** | `mcp_server.py` | 利润测算/关键词/CSV 导出工具 | 稳定 |

### 1.3 Agent 之间如何通信

使用 **`AgentMessage` 协议**（`agents/protocol.py`）：

```
Observer → Dispatcher(makes task dict) → Executor
    ↓ AgentMessage (trace_id 贯穿)
Registry (CapabilityRegistry) routes task_type → handler
    ↓
SubAgents called via _run_sub_agent()
    ↓
SubAgents return report dict → Executor finalizes → report back
```

关键组件：
- **`AgentMessage`** (protocol.py)：`sender`、`recipient`、`msg_type`(task/report/event)、`payload`、`trace_id`
- **`CapabilityRegistry`** (registry.py)：`register(task_type, handler, description, agent, aliases)` → `resolve(task_type)` → handler
- **`Pipeline`** (pipeline.py)：声明式 `Step` + `LoopEdge`（条件回跳边）
- **`Telemetry`** (telemetry.py)：span 树追踪

### 1.4 Web UI 如何调用后端

```
Flask API (web/app.py)
  │
  ├── POST /api/chat           ← 用户发消息
  │     └── DualAgentEngine (web/engine.py)
  │           ├── Observer.understand() → 理解意图
  │           ├── Observer.decide_reply() → 先回复
  │           ├── Observer.dispatch() → 决定是否派发
  │           ├── Executor.receive_task() → 接收
  │           ├── Executor.execute() → 执行（同步）
  │           │     └── Registry.resolve() → handler
  │           │           ├── _cap_analyze    → AnalystAgent
  │           │           ├── _cap_generate   → 管线图
  │           │           ├── _cap_research   → ResearcherAgent
  │           │           └── ...
  │           └── Observer.supervise() → 监督
  │
  └── GET /api/session/<sid>/blackboard  ← 共享状态
  └── POST /api/chat/upload              ← 文件上传
```

### 1.5 SharedBlackboard 如何保存上下文

- 会话级共享内存，所有 Agent 可读可写
- 持久化为 `agent/web/sessions/<session_id>/blackboard.json`
- 核心字段：`profile`、`scene_plan`、`preferences`、`raw_images`、`layout_images`、`platform_outputs`、`consistency_score`、`event_log`、`revision`
- 写入约定：Analyst → profile+scene_plan；Generator → raw_images；Layout → layout_images+platform_outputs；QA → consistency_score；Observer → preferences+merge_feedback
- 每次写入递增 `revision` 并追加 `event_log`

### 1.6 哪些地方适合接入新 Agent

| 接入点 | 方式 | 侵入等级 |
|--------|------|---------|
| **CapabilityRegistry** | `register("new_capability", handler, ...)` | 低（新增能力） |
| **Pipeline** | 在管线图中加新 Step | 低（新增步骤） |
| **Observer.dispatch()** | intent → task 映射 | 中（需改 dispatch） |
| **Researcher 并列** | 新增独立 Agent 专门做某类任务 | 中（需 registry） |
| **Web UI** | 新增 API 或页面入口 | 低（Flask 路由） |
| **MCP Server** | 作为 MCP tool 接入 | 零侵入（新文件） |
| **Post QA 钩子** | 在 Supervisor 或 QA 后接入 | 低 |

---

## 二、接入目标澄清

根据项目结构和你的外部 Agent 的定位，我判断以下最有可能的接入目标：

### ✅ 推荐接入目标：作为一致性/质量检查 Agent（ConsistencyGuardAgent）

> 如果外部 Agent 是用于"保持电商设计图中产品一致性"的质量检查工具。

**理由：**
1. 本项目已有 QA Agent（`agents/qa.py`），但一致性检查是系统的核心痛点
2. 外部 Agent 可以作为**增强版 QA** 接入，不替换现有 QA
3. 可以通过 CapabilityRegistry 注册为新能力
4. 在 Pipeline 的 QA 步骤后可追加额外一致性检测

### 其他可能的接入目标

| 目标 | 适用场景 | 接入方式 |
|------|---------|---------|
| **子 Agent** | 外部 Agent 是一个独立工作单元 | `registry.register()` + `_run_sub_agent()` |
| **MCP Server** | 外部 Agent 通过 MCP 协议交互 | 新增 MCP tool（零侵入） |
| **图像生成引擎** | 外部 Agent 是一个图片生成服务 | EngineConfig 配置 + Bridge |
| **平台运营 Agent** | 自动运营 Amazon/Etsy 等平台 | CapabilityRegistry + Web UI 新入口 + 风险边界 |
| **外部 Webhook** | 异步回调检测 | 新增 adapter |

> **⚠️ 先决问题**：你的"外部 Agent"到底是什么？具体的功能边界、输入输出、通信协议？  
> 下面我基于**最常见场景——你的外部 Agent 是一个一致性检测/质量检查服务**来设计接入方案。如果实际场景不同，请在后续确认后调整。

---

## 三、推荐接入方案（3 种方案）

### 方案 A：最小侵入方案（推荐优先评估）

**策略：** 只新增 adapter/wrapper 文件，不改核心文件。

| 维度 | 说明 |
|------|------|
| 新文件 | `agents/consistency_adapter.py`（适配器） |
| 修改现有文件 | **无** |
| 接入方式 | 不修改 executor，外部调用方直接导入 adapter |
| 通信 | 外部 Agent 通过 HTTP/GRPC 调用 adapter，adapter 返回标准 report dict |
| 风险 | ⭐ 极低 |
| 回滚 | 删除 adapter 文件即可 |
| 验收 | adapter 单元测试通过 |

**新增文件：**
```python
# agents/consistency_adapter.py
class ConsistencyAdapter:
    def __init__(self, agent_endpoint: str):
        self.endpoint = agent_endpoint

    def check(self, image_paths: list, profile: dict, ref_images: list) -> dict:
        """调用外部 Agent 做一致性检测，返回标准 report dict"""
        ...
```

**是否能对接已有系统：**
- 可以被 `scripts/consistency_checker.py` 作为可选引擎调用
- 可以被 `web/app.py` 手动路由调用
- 不会自动加入管线图

### 方案 B：标准架构方案（推荐实施）

**策略：** 通过 CapabilityRegistry 注册 + Pipeline Step + Blackboard 写入，融入现有多智能体框架。

| 维度 | 说明 |
|------|------|
| 新文件 | `agents/consistency_agent.py`（Agent 实现） |
| 修改现有文件 | `agents/executor.py`（注册 + pipeline step） |
| 需改行数 | executor.py: ~10 行（加 register + step） |
| 侵入等级 | ⭐⭐ 低 |
| 风险 | 低（新能力被 `try/except` 包裹，失败不阻断主流程） |
| 回滚 | 回退 executor.py + 删除 agent 文件 |

**新增文件：**
```python
# agents/consistency_agent.py
class ConsistencyAgent(BaseSubAgent):
    """外部一致检测 Agent 适配"""
    AGENT_LABEL = "consistency_guard"

    def __init__(self, agent_id, toolkit):
        super().__init__(agent_id, toolkit)
        self.adapter = ConsistencyAdapter(os.getenv("CONSISTENCY_AGENT_URL", ""))

    def execute(self, task, progress_callback=None, cancel_check=None):
        # ... 调用外部 agent，包装为标准 report dict
```

**需要修改 executor.py 的地方：**
1. `__init__` 导入 ConsistencyAgent：1 行
2. `sub_agents` 属性添加：1 行
3. `registry.register("enhanced_qa", ...)`：3-5 行
4. `_build_generate_pipeline` 追加可选 Step：2-3 行

**接线图：**
```
用户请求 → Observer → Executor
  → Registry.resolve("enhanced_qa")
  → ConsistencyAgent.execute()
  → Blackboard.update({"consistency_report": ..., "consistency_score": ...})
  → Web UI GET /api/session/<sid>/blackboard 可见
```

### 方案 C：完整产品化方案

**策略：** Web UI + API + MCP + 测试 + 审计日志，全链路可审查。

| 维度 | 说明 |
|------|------|
| 新文件 | adapter + agent + API route + config + test + docs |
| 修改现有文件 | `executor.py` + `web/app.py`（路由） |
| 影响范围 | 新增 Flask route，executor 注册 |
| 风险 | ⭐⭐⭐ 中等（需回归测试） |
| 回滚 | 回退所有新增/修改文件即可 |

**新增文件清单：**
```
agent/
├── agents/consistency_agent.py       # Agent 实现
├── agents/consistency_adapter.py     # 外部服务适配器
├── web/routes/consistency.py         # API 路由（手动触发检测）
├── tests/test_consistency_agent.py   # 单元测试
├── tests/test_consistency_adapter.py # 适配器测试
└── prompts/consistency_check.md      # 检测 prompt 模板
```

---

## 四、严格禁止事项（不可违反）

| 禁止项目 | 理由 |
|---------|------|
| ❌ 直接修改 `agents/executor.py` | 核心编排逻辑，误改动会破坏完整管线 |
| ❌ 直接修改 `agents/orchestrator.py` | LLM 意图理解核心，副作用不可控 |
| ❌ 直接修改 `web/app.py` | 用户交互界面，安全关键 |
| ❌ 直接修改 `web/engine.py` | DualAgentEngine 生命周期管理 |
| ❌ 删除任何测试文件 | 现有测试是 CI/CD 安全保障 |
| ❌ 关闭一致性检测 | 核心功能，客户依赖 |
| ❌ 绕过用户确认流程 | 高风险操作的安全闸门 |
| ❌ 自动执行平台发布/修改/删除 | 安全边界 |

> 以上操作在执行前必须：① 明确告知影响范围 ② 等待用户明确批准。

---

## 五、接入设计必须遵守的边界

| 规则 | 说明 |
|------|------|
| ✅ 新 Agent 通过 AgentMessage/protocol 接入 | `protocol.make_task()` / `protocol.make_report()` |
| ✅ 新能力注册到 CapabilityRegistry | `registry.register("cap_name", handler)` |
| ✅ 任务状态写入 SharedBlackboard | `blackboard.update({"key": val})` / `blackboard.save()` |
| ✅ 执行过程保留 trace_id | `Telemetry.trace_id` 贯穿始终 |
| ✅ 高风险动作进入确认流程 | Observer 的状态守卫 + `needs_clarification` |
| ✅ 禁止自动执行平台操作 | dispatch 前必须走用户确认 |

---

## 六、接入实施蓝图

### 【推荐方案】

> **优先评估方案 B（标准架构方案）**  
> 理由：① 与现有 Multi-Agent 架构一致 ② 风险低 ③ 可回滚 ④ 能自动融入管线  
> 如果外部 Agent 仅需手动调用，不需要自动融入管线，则选方案 A

### 【新增文件建议】

| 文件路径 | 职责 | 是否影响现有功能 |
|---------|------|----------------|
| `agent/agents/consistency_adapter.py` | 外部 Agent HTTP/GRPC 适配器，负责调用外部服务 | 否 |
| `agent/agents/consistency_agent.py` | 一致性检测 Agent，继承 BaseSubAgent，包装 adapter 结果 | 否 |
| `agent/tests/test_consistency_adapter.py` | adapter 单元测试（mock 外部调用） | 否 |
| `agent/tests/test_consistency_agent.py` | Agent 集成测试 | 否 |
| `agent/.env.example` 追加 | 外部 Agent 端点/密钥变量 | 否 |

### 【需要改动的现有文件】

| 文件 | 改动 | 必要性 | 行数 |
|------|------|--------|------|
| `agents/executor.py` | `__init__` 中导入并实例化 ConsistencyAgent | 注册到 registry | +1 行 |
| `agents/executor.py` | `_register_capabilities` 加 `registry.register("enhanced_qa", ...)` | 注册能力 | +3 行 |
| `agents/executor.py` | `sub_agents` 属性加 `consistency: self.consistency` | 子 Agent 可见 | +1 行 |
| `agents/executor.py` | （可选）`_build_generate_pipeline` 加 `Step("enhanced_qa", ...)` | 自动注入管线 | +3 行 |

> **如果不改 executor.py，则方案 A 够用。方案 B 的最小改动仅限于上述 4 处。**

### 【接入流程】

```
用户发送消息（Web UI）
  ↓
DualAgentEngine.process_message()
  ↓
Observer.understand() → 识别到增强检测意图 (dispatch_intent: "enhanced_qa")
  ↓
Observer.dispatch() → task(type="enhanced_qa", ...)
  ↓
Executor.execute()
  → Registry.resolve("enhanced_qa")
  → handler = ConsistencyAgent.execute()
      → ConsistencyAdapter.check(image_paths, profile, ref_images)
          → HTTP POST 外部 Agent 服务
          → 返回 { scores, issues, passed }
      → 包装为标准 report dict
  ↓
Executor.finalize_report()
  → Blackboard.update({"consistency_report": report, "consistency_score": score})
  → Blackboard.save()
  ↓
Observer.supervise()
  → 返回一致性评分给用户
  ↓
Web UI 显示一致性评分 + 问题列表
```

### 【测试计划】

| 类型 | 测试内容 | 不修改原文件时如何验证 |
|------|---------|---------------------|
| 单元测试 | `ConsistencyAdapter.check()` 返回格式、超时处理、异常重试 | ✅ 新建测试文件，mock HTTP |
| 单元测试 | `ConsistencyAgent.execute()` report 格式、错误报告 | ✅ 新建测试文件 |
| 集成测试 | 注册到 Registry 后可正常路由 | ✅ 测试中手动注册 Mock agent |
| Web API 测试 | POST /api/consistency/check 返回格式 | ✅ 新建 route（可选） |
| 回归测试 | 修改后运行 `pytest agent/tests -q` | 通过全部现有测试 |

### 【风险与回滚】

| 风险 | 等级 | 缓解 | 回滚方式 |
|------|------|------|---------|
| 外部 Agent 不可用导致管线阻塞 | 中 | try/except 包裹，失败时走现有 QA | 删除 adapter/agent 文件 |
| executor.py 修改出错 | 中 | 只加注册行，不改逻辑；单元测试覆盖 | `git checkout agents/executor.py` |
| 外部 Agent 返回格式不兼容 | 低 | adapter 做格式校验和映射 | 修改 adapter 映射层 |
| 环境变量缺失 | 低 | 空字符串回退，打印 warning | `.env.example` 有注释 |

---

## 七、下一轮可执行提示词

下面这段提示词给接力的编码 Agent。**同样禁止直接修改原文件，必须先输出方案等待确认。**

```text
你是电商设计图产品一致性智能体接入工程师。你的任务是执行外部 Agent 接入方案，不是修复原项目。

【前置条件】
- 你已经看过 G:\电商设计图保持产品一致性智能体 下的完整项目结构和接入设计方案。
- 方案设计文档路径：G:\电商设计图保持产品一致性智能体\接入方案_2026-07-06.md（或等价路径）

【核心约束 - 必须遵守】
1. 禁止直接修改以下文件：agents/executor.py、agents/orchestrator.py、web/app.py、web/engine.py
2. 如果方案需要改动上述文件，必须先输出"影响范围分析"等待确认
3. 禁止删除/关闭任何测试文件
4. 禁止关闭一致性检测
5. 禁止绕过用户确认流程

【你的任务】
根据选定的接入方案（A/B/C），创建新增文件。

如果方案 A（最小侵入）：
  1. 创建 agent/agents/consistency_adapter.py
  2. 创建 agent/tests/test_consistency_adapter.py（mock 外部调用）
  3. 创建 agent/.env.example 追加外部 Agent 相关变量

如果方案 B（标准架构）：
  在方案 A 的基础上额外：
  4. 创建 agent/agents/consistency_agent.py（继承 BaseSubAgent 或遵守子 Agent 契约）
  5. 创建 agent/tests/test_consistency_agent.py

如果方案 C（完整产品化）：
  在方案 B 的基础上额外：
  6. 创建 agent/web/routes/consistency.py
  7. 创建 agent/web/templates/consistency.html（可选）
  8. 创建 agent/prompts/consistency_check.md

【每一轮实施前必须输出】
- 准备创建的文件列表
- 文件职责说明
- 是否有对现有文件的修改（如果有，必须逐条列出原因和影响范围）
- 回滚方案

【输出确认格式】
```
轮次: 1/N
方案: B
新增文件:
  - agents/consistency_adapter.py: 外部 Agent HTTP 适配器
  - agents/consistency_agent.py: 一致性检测子 Agent
修改文件: 无（本轮）
风险: ⭐ 低
回滚: 删除新增文件
是否等确认后再实施: 是
```

请输出你的第一轮计划，包括要创建的文件清单、职责说明和风险分析。
```

---

## 八、下一步行动

1. **确认外部 Agent 的具体功能**：上述方案基于"外部 Agent = 一致性检测服务"的假设。如果你的 Agent 功能不同（例如是平台运营 Agent/MCP 工具/图像生成引擎），方案需要调整。
2. **选择接入方案**：建议从 A/B/C 中选择一个方向。
3. **运行环境确认**：确认外部 Agent 的通信协议（HTTP/gRPC/WebSocket/MCP）、端点地址、认证方式。

输出这份接入蓝图后，**我不会直接开始实施**。请确认方案是否符合你的预期，告诉我你的外部 Agent 的具体功能，我再输出第一轮可实施计划。
