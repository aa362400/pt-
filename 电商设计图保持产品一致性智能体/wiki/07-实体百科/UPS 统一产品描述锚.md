# UPS 统一产品描述锚

> Unified Product String — 所有生成场景共享的绝对一致产品描述段落。

## 摘要

UPS 是本项目**第一一致性策略**：10 个场景的 prompt 必须嵌入**完全相同**的产品描述文本，一字不差。这是对抗「AI 每次独立生成」最根本的 prompt 层锚点。

## 原理

AI 图像模型每次 API 调用无状态。若 Scene 1 写 "vintage brown leather backpack"、Scene 2 写 "一款复古皮包"，模型会生成视觉特征不同的产品。

**正确**：所有场景复用同一段英文描述。
**错误**：简写、翻译、改写、换同义词。

## 生成方式

1. `analyze_product.py` 分析上传产品图
2. 输出 `profile.json`，其中 `description` 字段即为 UPS
3. 场景模板（`templates/scenes/*.json`）从 profile 注入 UPS

## UPS 质量标准

| 要素 | 要求 | 示例 |
|-----|------|------|
| 语言 | 英文 | "Saddle Brown (#8B4513) Italian full-grain cowhide..." |
| 材质 | 具体名称 + hex | 非「高端皮革」 |
| 结构 | 可验证特征 | "flap-over top closure, three front pockets" |
| 长度 | 2-4 句 | 足够具体，不过度冗长 |

## 代码位置

- Prompt 规则：`agent/prompts/product_profile.md`
- 最佳实践：`agent/references/consistent_generation_guide.md`（策略一）
- 风险：[[产品一致性风险地图]] R09

## 矛盾与待验证

| 条目 | 状态 |
|-----|------|
| UPS 最优长度（句数/token） | 待实验 |

## 相关

- [[参考图锚定策略]]
- [[场景模板体系]]
- [[一致性检测]]
- [[实体 Index]]
