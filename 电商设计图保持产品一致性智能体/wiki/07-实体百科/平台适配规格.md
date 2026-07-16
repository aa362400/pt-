# 平台适配规格

> 15 个电商/社交平台的输出尺寸与规范。

## 摘要

`platform_adapter.py` 将 `outputs/final/` 成品自动裁切/缩放为各平台所需规格。

## 平台规格表

| 平台 | 尺寸 | 比例 | 用途 |
|-----|------|------|------|
| 淘宝主图 | 800×800 | 1:1 | 主图 |
| 京东主图 | 800×800 | 1:1 | 主图 |
| 拼多多 | 800×800 | 1:1 | 主图 |
| Amazon 主图 | 1000×1000 | 1:1 | 主图 |
| Shopify | 2048×2048 | 1:1 | 主图 |
| 小红书 | 1242×1660 | 3:4 | 笔记封面 |
| 抖音 | 1080×1920 | 9:16 | 短视频封面 |
| 微信朋友圈 | 1080×1080 | 1:1 | 社交 |
| Lazada | 800×800 | 1:1 | 东南亚 |
| Etsy | 2000×2000 | 1:1 | 手工艺 |
| _更多_ | 见 platform_adapter.py | — | — |

## 使用

```bash
python agent/scripts/platform_adapter.py \
  --input outputs/final/ \
  --output outputs/platforms/ \
  --platforms taobao_main amazon_main xiaohongshu
```

## 与一致性的关系

- 裁切可能改变产品占比 → 优先从中心裁切
- 不同比例场景应选用对应场景模板（如 3:4 用 lifestyle 类）

## 风险

- [[产品一致性风险地图]] R06 — 平台规格不合规

## 相关

- [[场景模板体系]]
- [[Flask Web UI]]
- [[实体 Index]]
