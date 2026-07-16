# Phase 3 Patch Plan — Registry / Pipeline 集成 ConsistencyGuardAgent

## 概述

将 `ConsistencyGuardAgent` 注册到 Executor 的 `CapabilityRegistry`，并在 generate pipeline
中作为可选步骤插入（QA 之后、compliance 之前）。

## 改动范围

| 文件 | 改动类型 | 行数 |
|---|---|---|
| `agent/agents/executor.py` | 增量修改（不删不改现有逻辑） | ~15 行 |

## 详细变更

### 1. 新增 import

```python
from .consistency_agent import ConsistencyGuardAgent
```

紧接现有 import 块末尾（第 28 行附近）。

---

### 2. `__init__` 新增子 Agent 实例

```python
self.consistency_guard = ConsistencyGuardAgent(
    agent_id=f"consistency_{agent_id}",
)
```

紧接 `self.researcher = ResearcherAgent(...)` 之后（第 68~69 行）。

---

### 3. `sub_agents` property 新增 entry

```python
"consistency_guard": self.consistency_guard,
```

加到现有 return dict（第 252 行）。

---

### 4. `_register_capabilities()` 新增注册

```python
reg.register("enhanced_qa", self._cap_enhanced_qa,
             description="外部一致性增强检测（ConsistencyGuard），在 QA 通过后可选执行",
             agent="consistency_guard")
```

紧接 `reg.register("research", ...)` 之后（第 100 行）。

---

### 5. 新增能力处理器 `_cap_enhanced_qa`

```python
def _cap_enhanced_qa(self, task, params, progress_callback, cancel_check):
    sub_task = {**task, "type": "enhanced_qa", "params": params}
    return self._run_sub_agent(
        self.consistency_guard, sub_task, progress_callback, cancel_check,
    )
```

紧接 `_cap_research` 方法之后（第 125~126 行）。

---

### 6. Pipeline 新增可选步骤

在 `_build_generate_pipeline()` 的 steps 列表末尾（`qa` 步之后、`compliance` 步之前）：

```python
Step("enhanced_qa", self._step_enhanced_qa,
     when=lambda ctx: bool(os.environ.get("CONSISTENCY_AGENT_URL")),
     agent="consistency_guard"),
```

条件 `when` 仅在配置了外部端点时才执行，未配置时透明跳过。

对应步骤方法：

```python
def _step_enhanced_qa(self, ctx: dict) -> dict:
    pc = ctx["progress_callback"]
    if pc:
        pc("consistency_guard", "check", "正在执行外部一致性增强检测...", progress=95)
    enhanced_data = self._run_sub_agent(
        self.consistency_guard,
        {**ctx["task"], "type": "enhanced_qa", "params": ctx["params"]},
        pc, ctx["cancel_check"],
    )
    return {"enhanced_qa_data": enhanced_data}
```

---

## 不修改的内容

- `_step_qa` / `_step_compliance` — 不变
- `self_check` — 现有 `enhanced_qa_data` 会通过 `sub_agents` 列表自动参与汇总，无需追加逻辑
- `_generate_result_from_ctx` — 外部检测结果不改变核心输出字段，暂不暴露到前端
- 其他任何文件

## 执行后验证

```bash
cd "G:/电商设计图保持产品一致性智能体"
python -m pytest agent/tests/ -q
```

预期 461+ 全部通过（新增测试不在此 patch 范围内，量级不变）。
