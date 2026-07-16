# 场景模板体系

> 10 套标准场景 + 6 类目定制模板。

## 摘要

`agent/templates/scenes/` 定义了电商产品图的 10 种标准场景，每个场景 JSON 包含 prompt 模板、UPS 注入点、风格指令和负面提示词。

## 10 套标准场景

| ID | 文件 | 场景 | 用途 |
|----|------|------|------|
| 01 | scene_01_white_bg | 白底主图 | 平台主图 |
| 02 | scene_02_lifestyle | 生活场景 | 代入感 |
| 03 | scene_03_premium | 高端质感 | 品牌调性 |
| 04 | scene_04_in_use | 使用中 | 功能展示 |
| 05 | scene_05_detail | 细节特写 | 材质/工艺 |
| 06 | scene_06_seasonal | 季节主题 | 营销节点 |
| 07 | scene_07_atmospheric | 氛围光 | 情绪价值 |
| 08 | scene_08_comparison | 对比展示 | 卖点强化 |
| 09 | scene_09_review_social | 社交证明 | 小红书/抖音 |
| 10 | scene_10_brand_story | 品牌故事 | 品牌页 |

## 6 类目模板

`templates/scenes/categories/`：

- fashion — 服饰
- beauty — 美妆
- digital — 数码
- food — 食品
- home — 家居
- sports — 运动

`scene_matcher.py` 根据产品 profile 自动匹配类目模板。

## 一致性设计要点

每个场景模板必须：
1. 注入相同 UPS（[[UPS 统一产品描述锚]]）
2. 包含统一 style 指令
3. 包含相同负面提示词（产品变形/变色/细节增减）
4. 仅场景描述部分不同

## 扩展

- LLM 创意场景：`scene_creator.py` 生成自定义场景，但仍需遵循 UPS 规则
- 反馈优化：`ab_test_runner.py` 根据用户偏好调整场景排序

## 相关

- [[UPS 统一产品描述锚]]
- [[参考图锚定策略]]
- [[实体 Index]]
