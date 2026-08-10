# 外部 Agent 接入架构文档

> 电商设计图保持产品一致性智能体 — 外部一致性检测 Agent 接入
> 日期：2026-07-06 | 版本：v1.0

---

## 一、架构概览

### 三层接入架构

```
┌─────────────────────────────────────────────────────────┐
│                    Pipeline 层                          │
│  Pipeline (enhanced_qa step, when=CONSISTENCY_AGENT_URL)│
│  CapabilityRegistry (task_type → handler)               │
│  ExecutorAgent (sub_agents, _run_sub_agent)              │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                   Agent 封装层                          │
│  ConsistencyGuardAgent (BaseSubAgent 契约)              │
│  ├─ receive_task() → 更新状态                           │
│  ├─ execute() → 调用 adapter                            │
│  ├─ self_check() → 自检                                  │
│  └─ _wrap_report() → 标准化输出                         │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                   Adapter 层                            │
│  ConsistencyAdapter (HTTP 适配器)                       │
│  ├─ check() → 调用外部 Agent /check                     │
│  ├─ _parse_response() → JSON → 标准化 dict              │
│  ├─ _validate_response() → 字段校验                     │
│  └─ _build_payload() → 请求体构造                       │
│                                                         │
│   输出契约:                                              │
│   { status, score, issues, recommendations, raw, source }│
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP POST
┌──────────────────────▼──────────────────────────────────┐
│                外部 Agent 服务                           │
│  一致性检测 API (JSON-REST)                             │
└─────────────────────────────────────────────────────────┘
```

### 数据流

```
Web UI 用户请求
  │
  ▼
Observer.understand() → dispatch()
  │
  ▼
Executor.execute("generate")
  │
  ▼
Pipeline.run(ctx)
  ├─ analyze (条件)
  ├─ generate
  ├─ subject_lock (条件)
  ├─ layout
  ├─ qa ── (LoopEdge 回跳 generate if QA failed)
  ├─ enhanced_qa (条件: CONSISTENCY_AGENT_URL 已配置)
  │    └─ _run_sub_agent(ConsistencyGuardAgent)
  │         └─ ConsistencyAdapter.check()
  │              └─ HTTP POST /check → 外部 Agent
  │              └─ ← 标准化 {status, score, issues, ...}
  │         └─ _wrap_report() → {external_consistency_*}
  │    └─ ctx["enhanced_qa_data"] = report
  └─ compliance
  │
  ▼
Executor._finalize_report()
  └─ sub_agents 列表包含 consistency_guard 的报告
  └─ self_check 自动汇总
```

---

## 二、组件详细说明

### 2.1 ConsistencyAdapter (`agents/consistency_adapter.py`)

| 属性 | 说明 |
|------|------|
| 职责 | HTTP 适配器，调用外部 Agent 并标准化响应 |
| 依赖 | `requests` 库 |
| 配置 | `CONSISTENCY_AGENT_URL`, `CONSISTENCY_AGENT_API_KEY`, `CONSISTENCY_AGENT_TIMEOUT` |
| 输出契约 | `{status, score, issues, recommendations, raw, source}` |

**异常处理策略：**
- 所有网络异常被 `try/except` 捕获，返回 `status: "error"`
- 不抛出任何异常（调用方无需 try/except）
- 未配置时返回 `status: "skipped"`

### 2.2 ConsistencyGuardAgent (`agents/consistency_agent.py`)

| 属性 | 说明 |
|------|------|
| 基类 | `BaseSubAgent` |
| AGENT_LABEL | `"ConsistencyGuard"` |
| 输出字段 | `data.external_consistency_*`（不覆盖现有 data）|
| 生命周期 | `receive_task → execute → self_check → _wrap_report` |

**self_check 规则：**

| 状态 | 通过 |
|------|------|
| status=success ∧ external_consistency_status=passed | ✅ |
| status=success ∧ external_consistency_status=skipped | ✅ |
| status=success ∧ external_consistency_status=failed | ❌ |
| status=error | ❌ |

### 2.3 Pipeline 集成

```python
Step("enhanced_qa", self._step_enhanced_qa,
     when=lambda ctx: bool(os.environ.get("CONSISTENCY_AGENT_URL")),
     agent="consistency_guard"),
```

- 位置：qa → enhanced_qa → compliance
- 条件：仅 `CONSISTENCY_AGENT_URL` 配置时执行
- 结果存储在 `ctx["enhanced_qa_data"]`（当前未暴露到前端输出）

---

## 三、配置参考

### 3.1 环境变量

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `CONSISTENCY_AGENT_URL` | 否 | "" | 外部 Agent 端点，空=禁用 |
| `CONSISTENCY_AGENT_API_KEY` | 否 | "" | Bearer Token |
| `CONSISTENCY_AGENT_TIMEOUT` | 否 | "30" | HTTP 超时秒数 |

### 3.2 启用/禁用

**启用：** 在 `.env` 中配置 `CONSISTENCY_AGENT_URL=https://your-agent.example.com`

**禁用：** 将 `CONSISTENCY_AGENT_URL` 设为空或注释掉

> 修改环境变量后无需重启代码，pipeline 的 `when` 条件在运行时判断。

---

## 四、测试矩阵

| 文件 | 用例数 | 覆盖率 |
|------|--------|--------|
| `test_consistency_adapter.py` | 15 | 正常调用、非法 JSON、超时、连接失败、未配置、校验失败、批量、工厂 |
| `test_consistency_agent.py` | 13 | 基本构造、skipped、成功、失败、超时、连接失败、取消、self_check×4、空输入、集成 |
| 全量回归 | 461 | 100% 通过 |

---

## 五、回滚方案

### 完全回滚（回到接入前状态）

```bash
# 恢复 executor.py（如果有 git）
git checkout agent/agents/executor.py

# 删除新增文件
rm agent/agents/consistency_adapter.py
rm agent/agents/consistency_agent.py
rm agent/tests/test_consistency_adapter.py
rm agent/tests/test_consistency_agent.py

# 恢复 .env.example（如果有 git）
git checkout agent/.env.example

# 验证
python -m pytest agent/tests/ -q   # 应为 433 passed（原测试数）
```

### 部分回滚（仅禁用作）

```bash
# 注释掉环境变量
# CONSISTENCY_AGENT_URL=

# Pipeline 自动跳过 enhanced_qa 步骤
# 无需代码回滚
```
