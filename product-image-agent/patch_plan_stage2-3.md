# 外部 Agent 接入 — 阶段 2 & 3 Patch 计划

> 基于阶段 1（consistency_adapter.py + tests + .env.example）已完成且测试通过（15/15）。
> 此为后续阶段的 **影响分析与 patch 计划**，不直接实施，等待用户确认。

---

## 阶段 2：ConsistencyAgent（标准子 Agent 包装）

### 需新增的文件（不改原文件）

| 文件 | 职责 |
|------|------|
| `agent/agents/consistency_agent.py` | 子 Agent，继承 `BaseSubAgent`，包装 `ConsistencyAdapter` |

### consistency_agent.py 核心逻辑

```python
class ConsistencyAgent(BaseSubAgent):
    """增强一致性检测 Agent — 不替换现有 QA，作为叠加检查层"""

    AGENT_LABEL = "ConsistencyGuard"

    def __init__(self, agent_id: str, toolkit=None):
        super().__init__(agent_id)
        self.adapter = ConsistencyAdapter()

    def execute(self, task, progress_callback=None, cancel_check=None):
        params = task.get("params", {})
        start = time.time()
        try:
            image_paths = params.get("image_paths", [])
            profile = params.get("profile", {})
            ref_images = params.get("reference_images", [])
            result = self.adapter.check(image_paths, profile, ref_images)
            data = {
                "external_consistency_score": result["score"],
                "external_consistency_status": result["status"],
                "external_consistency_issues": result["issues"],
                "external_consistency_report": result,
            }
            return self._wrap_report(task, data, status="success", start=start)
        except Exception as e:
            return self._wrap_report(task, {}, status="error", error=str(e), start=start)
```

### 不修改任何现有文件

阶段 2 不改原文件。手动调用或外部脚本导入即可使用。

---

## 阶段 3：接入 Registry + Pipeline（需改核心文件）

### 需要修改的文件

| 文件 | 修改位置 | 修改原因 | 行数 | 回滚方式 |
|------|---------|---------|------|---------|
| `agents/executor.py` | `__init__` 中注册新子 Agent | 实例化 ConsistencyAgent 并加入 sub_agents | +3 行 | `git checkout` |
| `agents/executor.py` | `_register_capabilities()` | `registry.register("enhanced_qa", ...)` | +3 行 | `git checkout` |
| `agents/executor.py` | `sub_agents` 属性 | 添加 `"consistency": self.consistency` | +1 行 | `git checkout` |
| `agents/executor.py` | `_build_generate_pipeline()` | 在 QA 步骤后追加可选 Step（条件跳过） | +6 行 | `git checkout` |

### 新增能力名

```
enhanced_qa — 外部 Agent 增强一致性检测（叠加层，不替换现有 QA）
```

### 接入后的管线图变化

```
现有 QA step ──→ (正常通过) ──→ compliance step
                    │
                    ├──→ enhanced_qa step（如果配置了 external Agent）
                    │       ├── 成功 → 追加 external_consistency_score
                    │       └── 失败/skipped → 不阻断（try/except 包裹）
                    │
                    └──→ 原有流程继续
```

### 修改 executor.py 的具体 diff

```diff
# __init__ 方法
+ from .consistency_agent import ConsistencyAgent
  self.researcher = ResearcherAgent(...)
+ self.consistency = ConsistencyAgent(f"consistency_{agent_id}")

# sub_agents 属性
  "researcher": self.researcher,
+ "consistency": self.consistency,

# _register_capabilities 方法
  reg.register("research", ..., aliases=("web_search", "browse"))
+ reg.register("enhanced_qa", self._cap_enhanced_qa,
+              description="外部 Agent 增强一致性检测（叠加层）",
+              agent="consistency")

# _cap_enhanced_qa 方法
+ def _cap_enhanced_qa(self, task, params, progress_callback, cancel_check):
+     return self._run_sub_agent(self.consistency, task, progress_callback, cancel_check)

# _build_generate_pipeline → 在 QA step 后追加
+ Step("enhanced_qa", self._step_enhanced_qa, when=has_external_agent, agent="consistency"),
```

### 条件守卫

```python
def has_external_agent(ctx):
    """仅当配置了外部 Agent 端点时才运行增强检测"""
    return bool(os.getenv("CONSISTENCY_AGENT_URL"))
```

### 风险等级：⭐⭐ 低

- 新能力被 `try/except` 包裹，失败不阻断主流程
- 条件守卫确保未配置时不影响现有行为
- `enhanced_qa` 的 `score` / `issues` 作为附加信息写入 blackboard，不覆盖现有 QA 结果

### 验收命令

```bash
python -m pytest agent/tests/ -q                # 全量测试
python -m pytest agent/tests/test_consistency_adapter.py -q   # 新增测试
```

---

## 阶段 2/3 激活方式对比

| | 阶段 2（当前输出，不改文件） | 阶段 3（需确认后执行） |
|---|---------------------------|----------------------|
| 手动调用 | ✅ `from agents.consistency_agent import ConsistencyAgent` | ✅ 同样可以 |
| 自动融入管线 | ❌ | ✅ 管线自动执行 |
| 改核心文件 | ❌ 不改 | ✅ 改 executor.py ~13 行 |
| 回滚 | 删除文件 | `git checkout executor.py` |
| 需要用户确认 | ❌ 不需要（只新增文件） | ✅ **需要** |

---

## 建议

1. **先使用阶段 1+2**：`ConsistencyAdapter` + `ConsistencyAgent` 作为可手动调用的工具层
2. 待外部 Agent 真实部署、接口稳定后，再进入阶段 3 接入 Registry/Pipeline
3. 阶段 3 需要用户确认后再修改 executor.py
