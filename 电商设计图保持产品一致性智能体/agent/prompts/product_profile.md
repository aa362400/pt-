# 产品特征提取 Prompt

当你收到用户上传的产品图片时，请分析图片中的产品，提取以下结构化信息，并生成 JSON 格式的产品档案。

## 提取规则

1. **准确为主**：只提取你从图片中能明确看到的信息，不确定的字段留空或用 `null`
2. **英文为主**：`product_name`、`product_description` 用英文输出（为了更好的 AI 生图效果），`materials`、`key_features` 保持中英文双语
3. **具体而非抽象**：不要写"高端材料"这种模糊词，写"进口意大利植鞣牛皮"这种具体描述
4. **视觉可验证**：所有描述必须能从图片中观察到或合理推断

## 输出格式

```json
{
  "product_name": "Product Display Name in English",
  "product_name_cn": "产品中文名（如适用）",
  "category": "product category like bag/shoes/clothing/furniture/electronics/food",
  "category_cn": "产品类别",
  "materials": ["primary material", "secondary material", "hardware/accents"],
  "colors": {
    "primary": "hex_color_primary",
    "accents": ["hex_accent_1", "hex_accent_2"],
    "color_names": ["main color name", "accent colors"]
  },
  "style": "style description e.g. 'minimalist Scandinavian', 'vintage British', 'modern Japanese'",
  "style_cn": "风格中文描述",
  "dimensions": "approximate size description",
  "shape": "product shape description",
  "key_features": ["feature_1", "feature_2"],
  "target_audience": "who this product is for",
  "usage_scenarios": ["everyday use", "gift giving", "specific use case"],
  "emotion_keywords": ["trustworthy", "elegant", "cozy", "professional"],
  "description": "A detailed 2-3 sentence English description of the product suitable for image generation prompts. Include materials, colors, unique features, and design style. This text will be embedded directly into AI image generation prompts.",
  "description_cn": "中文产品描述，用于用户交互"
}
```

## 示例（箱包类）

```json
{
  "product_name": "Handcrafted Vintage Leather Backpack",
  "product_name_cn": "手工复古皮质双肩包",
  "category": "bag/backpack",
  "category_cn": "箱包/双肩包",
  "materials": ["Italian full-grain cowhide leather", "Brass YKK zippers", "Waxed canvas lining", "Solid brass hardware"],
  "colors": {
    "primary": "#8B4513",
    "accents": ["#DAA520", "#F5DEB3"],
    "color_names": ["Saddle Brown", "Antique Gold", "Cream"]
  },
  "style": "Vintage British heritage, classic expedition style",
  "style_cn": "复古英伦风，经典探险风格",
  "dimensions": "Medium size, approximately 42cm x 30cm x 15cm",
  "shape": "Rectangular with rounded bottom corners, flap-over top closure",
  "key_features": ["Flap magnetic snap closure", "Adjustable leather shoulder straps", "Front organizer pockets", "Padded laptop compartment", "Embossed logo stamp"],
  "target_audience": "Professionals and travelers who appreciate vintage aesthetics and quality craftsmanship",
  "usage_scenarios": ["Daily commute", "Weekend travel", "Business casual outings", "Gift giving"],
  "emotion_keywords": ["heritage", "craftsmanship", "adventure", "reliability", "timeless"],
  "description": "A handcrafted vintage leather backpack made from Italian full-grain cowhide leather. Features saddle-brown coloration that will develop a beautiful patina over time. The design combines classic expedition silhouette with modern functionality including brass hardware, waxed canvas lining, and padded laptop compartment. Antique gold accents complement the warm brown leather tones.",
  "description_cn": "手工制作的复古皮质双肩包，采用意大利进口头层牛皮，经典鞍棕色。黄铜五金件与蜡帆布内衬，兼顾怀旧风格与现代功能。"
}
```
