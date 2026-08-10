# ADR-003: Pipeline 阶段注入策略（可选步骤的条件执行）

## 状态

✅ 已实施（2026-07-06）

## 背景

`ConsistencyGuardAgent` 需要嵌入现有的 generate pipeline（`analyze → generate → layout → qa → compliance`），
但必须满足：
- 外部 Agent 未配置时完全透明（零性能开销）
- 不影响现有 QA 的自动重生成回跳逻辑
- 不改变 `_generate_result_from_ctx` 的输出字段

## 决策

### 注入位置

```
... → qa → [enhanced_qa] → compliance → ...
```

放在 QA 之后、compliance 之前，原因：
- QA 先做内部一致性检测，决定是否重生成
- enhanced_qa 是外部增强检查，不参与重生成决策
- compliance 是最终合规校验，enhanced_qa 结果可在此时已写入 ctx

### 条件执行

```python
Step("enhanced_qa", self._step_enhanced_qa,
     when=lambda ctx: bool(os.environ.get("CONSISTENCY_AGENT_URL")),
     agent="consistency_guard"),
```

使用 pipeline 原生的 `when` 条件机制（与其他条件 step 一致）：
- 条件 False → step 完全跳过，不走 `_run_sub_agent`
- 条件 True → 正常执行，结果写入 `ctx["enhanced_qa_data"]`

### 为什么不用 try/except 包裹

Pipeline 的 `_cancelled` + `when` 机制已经提供了声明式的条件控制。
用 try/except 包裹会：
1. 掩盖真实的跳过语义（skipped 不是异常）
2. 需要在 step 内部检查环境变量，职责不清晰

### 为什么不放在 QA 之前

QA 的重生成回跳逻辑（`qa_needs_regen` → `LoopEdge`）不应受外部检测影响。
放在 QA 之后确保：
- 重生成决策纯由内部 QA 决定
- enhanced_qa 步骤在最终结果生成后执行，不影响权重的图像生成

### 为什么不放在 Pipeline 结束之后

Pipeline 结束后 `_generate_result_from_ctx` 已调用，
enhanced_qa 结果无法写入输出。但当前阶段暂不暴露到前端，
仅通过 `sub_agents` 列表在 `self_check` 中可见。

### 影响

- Pipeline step 列表 +1（共 10 步）
- 未配置时 when 返回 False，pipeline 运行零额外延迟
- 已配置时新增一次 HTTP 调用（通常 <3s）
- 不改变现有 LoopEdge（enhanced_qa 在 QA 之后，不参与回跳）
- 不改变 `_generate_result_from_ctx` 输出字段
