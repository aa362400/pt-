# 一致性检测

> 批量生成后的产品质量与一致性量化检测。

## 摘要

`consistency_checker.py` 对 `outputs/final/` 中的批量输出进行一致性分析，生成 Markdown 检测报告到 `reports/`。

## 检测维度

| 维度 | 方法 | 阈值参考 |
|-----|------|---------|
| 颜色一致性 | 主色区域 Lab ΔE | ΔE ≤ 5 |
| 结构一致性 | 特征描述比对 / AI 视觉评估 | 综合分 ≥ 0.75 |
| Prompt 合规 | UPS 是否一致嵌入 | 100% |
| 参考图使用 | metadata 审计 | 每场景均有 |

## 使用

```bash
python agent/scripts/consistency_checker.py \
  --input-dir outputs/final/ \
  --profile profile.json \
  --report reports/report.md
```

## 输出

- 通过/未通过判定
- 各场景分数
- 问题场景标注与修复建议

## 与研究框架的关系

检测结果反馈到：
- [[产品一致性研究框架]] 实验记录
- [[2026-Q2 追踪表]] KPI
- [[产品一致性风险地图]] 风险验证

## 相关

- [[UPS 统一产品描述锚]]
- [[参考图锚定策略]]
- [[实体 Index]]
