# 参考图锚定策略

> 通过 reference_images / subject_reference 将产品原图作为最强视觉锚点。

## 摘要

在所有锚定策略中，**参考图锚定**效果最强。Gemini 的 `subject_reference` 参数使模型以原图产品形态为准进行场景化生成。

## 规则

1. **每场景同一批参考图** — 10 张输出使用相同的 reference_images 列表
2. **数量** — 至少 1 张，推荐 2-3 张不同角度
3. **质量** — 清晰、光线好、背景干净
4. **一致性** — 参考图列表在批量生成中不可变

## 与 UPS 的配合

```
最终 prompt = UPS（文本锚） + reference_images（视觉锚） + 场景描述 + 风格指令
```

文本锚 alone 不够；视觉锚 alone 可能丢失材质细节。两者叠加效果最佳。

## 代码位置

- `agent/scripts/generate_batch.py` — 传入 reference_images
- `agent/scripts/multi_engine_bridge.py` — Gemini subject_reference 映射
- `agent/references/consistent_generation_guide.md` — 策略二

## 引擎差异

| 引擎 | 参考图机制 | 效果 |
|-----|-----------|------|
| [[Gemini Image Generation]] | subject_reference | ⭐⭐⭐⭐ |
| [[Stable Diffusion]] | IP-Adapter / img2img | ⭐⭐⭐ |
| [[Midjourney]] | cref（偏人物） | ⭐⭐ |

## 矛盾与待验证

| 条目 | 状态 |
|-----|------|
| 3 张参考图 vs 1 张的边际收益 | 待实验（见 [[产品一致性研究框架]]） |

## 相关

- [[UPS 统一产品描述锚]]
- [[Gemini Image Generation]]
- [[一致性检测]]
- [[实体 Index]]
