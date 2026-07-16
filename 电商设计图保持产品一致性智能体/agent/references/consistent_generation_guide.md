# 产品一致性生成最佳实践

## 为什么一致性是核心难题

AI 图片生成模型（即使是 Gemini 3 Pro）每次调用都是独立的，没有"记住"上次生成了什么。因此，同一个产品在不同场景中生出来可能看起来像不同的东西。

**解决思路**：在 prompt 层面建立足够强的锚点，让每次生成都锚定到同一个产品上。

---

## 五大一致性锚定策略

### 策略一：产品描述锚（UPS — Unified Product String）

所有 10 个场景的 prompt 共享同一个产品描述段落，保持绝对一致。

**正确做法** ✅：
```
Scene 1: "A handcrafted vintage brown leather backpack with brass hardware..."
Scene 2: "A handcrafted vintage brown leather backpack with brass hardware... in a coffee shop"
Scene 3: "A handcrafted vintage brown leather backpack with brass hardware... in dramatic lighting"
```

**错误做法** ❌：
```
Scene 1: "一款复古棕色皮包"
Scene 2: "A cool backpack"
Scene 3: "手工双肩包"
```

> ⚠️ 每次产品描述必须一字不差地复用，不能简写、改写或翻译。

### 策略二：参考图策略

AI 引擎的 `reference_images` 参数（在 Gemini 中作为 `subject_reference`）是所有策略中最强的锚定手段。

规则：
- 每张生成图都传入**同一批原产品图**
- 至少 1 张，推荐 2-3 张不同角度的原图
- 图片要清晰、光线好、背景干净
- 所有10张图的参考图列表保持一致

### 策略三：材质和颜色精确描述

AI 对具体材料名称和色值的理解比抽象形容词更好。

| 不好 ❌ | 好 ✅ |
|---------|------|
| "棕色皮包" | "Saddle Brown (#8B4513) Italian full-grain cowhide leather" |
| "金属扣" | "Solid brass hardware with antique gold finish (#DAA520)" |
| "一些口袋" | "Three front organizer pockets with magnetic snap closures" |

### 策略四：风格统一限定

在 prompt 中加入一致的风格指令：

```
Style: Photorealistic commercial product photography, consistent product representation across all scenes, the product must look identical in shape, color, and material in every image. Product maintains exact same appearance as shown in the reference images.
```

### 策略五：负面提示词防守

在所有场景中加入相同的产品一致性负面提示：

```
Negative prompt: 
- Product color changing between scenes
- Product shape distortion
- Product material inconsistency
- Product missing key features visible in reference images
- Product replaced by similar but different product
- Extra or missing hardware/details on product
```

---

## 常见一致性问题及修复

| 问题 | 现象 | 可能原因 | 修复方法 |
|------|------|---------|---------|
| 颜色漂移 | 不同场景中产品颜色不同 | 场景光照描述影响了对产品颜色的理解 | 在 prompt 中明确产品颜色不受场景光影响："product maintains its original (color) regardless of scene lighting" |
| 形状变形 | 产品比例在不同场景中改变 | AI 根据场景生成了不同比例 | 增加原参考图，在 prompt 中描述精确尺寸 |
| 特征丢失 | 关键特征在部分场景中消失 | 场景描述太长冲淡了产品特征 | 将 `key_features` 放在 prompt 最前面 |
| 材质错误 | 皮变布、金属变塑料 | 材质描述不够具体 | 用具体品牌级术语描述材质 |
| Logo 丢失 | Logo 在某些场景中消失 | AI 认为场景不需要 Logo | 明确要求 "product logo must be visible and correctly positioned" |

---

## 不同引擎的差异

| 特性 | Gemini 3 Pro | MiniMax image-01 |
|------|-------------|-----------------|
| 参考图支持 | ✅ 强 | ✅ 强（subject_reference） |
| prompt 长度 | 无限制 | ≤1500 字符 |
| 一致性表现 | 较好 | 较好（人物保持突出） |
| 产品细节还原 | 优秀 | 良好 |
| 推荐用法 | 主力引擎 | 当 Gemini 不可用时的备选 |

---

## 校验清单（生成后检查）

每批图生成后，按此清单快速校验：

- [ ] 产品颜色在所有图中一致（无漂移）
- [ ] 产品材质看起来一致（皮还是皮、金属还是金属）
- [ ] 产品形状/比例一致（没有变胖变瘦）
- [ ] 关键特征在所有图中可见（Logo、五金件、特殊设计）
- [ ] 产品始终是视觉焦点（没有被背景淹没）
- [ ] 场景元素没有篡改产品外观
- [ ] 图片质量达到上架标准（足够清晰、光线合适）
- [ ] 10 张图各有不同情绪价值（不是换了个背景的重复）
- [ ] 文件命名规范（`scene_xx_*.jpg`）
