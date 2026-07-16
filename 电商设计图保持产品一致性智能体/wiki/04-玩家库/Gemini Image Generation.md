# Gemini Image Generation

> Google Gemini 系列图像生成能力 — 本项目主力引擎。

## 摘要

Gemini 支持多模态输入，`subject_reference`（参考图）是本项目最强的产品一致性锚定手段。通过 `multi_engine_bridge.py` 调度，quality=premium 时优先选用。

## 关键能力

| 能力 | 说明 | 本项目用法 |
|-----|------|-----------|
| subject_reference | 传入产品原图作为主体参考 | 每场景传入同一批 reference_images |
| 多图输入 | 支持多张参考图 | 推荐 2-3 张不同角度 |
| 高分辨率 | premium 质量档 | `--quality premium` |
| 英文 prompt | 理解精确材质/色值描述 | 配合 [[UPS 统一产品描述锚]] |

## 配置位置

- `agent/engine_config.yaml` — 引擎优先级与参数
- `agent/scripts/multi_engine_bridge.py` — 调度逻辑

## 优势

- 参考图锚定效果最佳（见 [[参考图锚定策略]]）
- API 稳定，适合批量生成
- 与 Gemini 文本模型配合做 [[一致性检测]] 视觉评估

## 局限

- 复杂材质（透明、反光）仍可能漂移
- API 成本随批量增加
- 需精确英文 UPS，中文描述效果较差

## 矛盾与待验证

| 条目 | 状态 |
|-----|------|
| （暂无） | — |

## 更新记录

- 2026-06-29：从 engine_config 初始化

## 相关

- [[玩家库 Index]]
- [[参考图锚定策略]]
- [[多引擎调度]]
- [[2026-Q2 追踪表]]
