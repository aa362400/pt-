# 10 套情绪价值场景模板索引

| # | 场景ID | 场景名称 | 情绪 | 电商用途 | 比例 |
|---|--------|---------|------|---------|------|
| 1 | `01_white_bg` | 纯净白底图 | 干净、专业、聚焦 | 主图/搜索缩略图 | 1:1 |
| 2 | `02_lifestyle` | 生活方式场景 | 温暖、向往、代入感 | 主图/详情首图 | 4:3 |
| 3 | `03_premium` | 高端质感展示 | 奢华、精致、品质感 | SKU图/品牌展示 | 4:3 |
| 4 | `04_in_use` | 使用中场景 | 实用、动感、问题解决 | 详情页/功能展示 | 4:3 |
| 5 | `05_detail` | 材质细节特写 | 真实、可信、工艺感 | 详情页/品质展示 | 1:1 |
| 6 | `06_seasonal` | 季节节日限定 | 应景、仪式感、限时感 | 活动图/促销图 | 4:3 |
| 7 | `07_atmospheric` | 色彩氛围光效 | 氛围感、高级感、沉浸 | 详情页/品牌广告 | 4:3 |
| 8 | `08_comparison` | 对比组合展示 | 实用、完整、套装感 | 主图/规格选择 | 16:9 |
| 9 | `09_review_social` | 用户评价情感化 | 好评、真实、社交证明 | 评价区/社交广告 | 1:1 |
| 10 | `10_brand_story` | 品牌故事理念 | 认同、调性、价值观 | 品牌页/广告 | 16:9 |

## 模板变量说明

每个模板中使用 `{{variable}}` 占位符，在运行时会被替换：

| 变量 | 说明 | 示例 |
|------|------|------|
| `{{product_name}}` | 产品名称 | "手工皮质双肩包" |
| `{{product_category}}` | 产品类别 | "箱包" |
| `{{product_description}}` | 产品详细描述 | "采用进口头层牛皮..." |
| `{{product_materials}}` | 材质列表 | "头层牛皮、黄铜五金" |
| `{{product_style}}` | 风格描述 | "复古英伦风" |
| `{{key_features}}` | 关键特征 | "翻盖磁扣、可调节肩带" |
| `{{primary_color}}` | 产品主色 | "#8B4513" |
| `{{secondary_color}}` | 辅助色 | "#DAA520" |
| `{{season}}` | 季节/节日 | "秋季 / 圣诞节" |
| `{{variants_count}}` | 变体数量 | "3种颜色" |

## 使用方式

```python
# 加载模板
template = json.load(open(f"templates/scenes/scene_{id:02d}_{name}.json"))

# 注入产品变量
for key in ["prompt", "style", "composition", "lighting", "color_palette"]:
    template[key] = template[key].replace("{{product_name}}", product_name)
    # ... 其他变量替换
```
