# 05 · 标准化、跨平台合并与去重提示词

> 先读取：`00-shared-context.md`，以及阶段 02-04 的交接。  
> 前置条件：原始候选和信号已按统一契约持久化。  
> 本阶段目标：把不同来源的杂乱产品记录变成可重复计算、可追溯、不会在 TOP 中撞车的规范化候选。

## 你的任务

实现 `NORMALIZE` 阶段，包括文本标准化、字段归一、产品指纹、完全重复去除、近似候选合并、跨平台证据聚合、30 天重复推荐抑制和幂等写入。

标准化是确定性数据处理，不应依赖 LLM 才能完成。LLM 可以在极少数模糊分类中给出建议，但不能作为唯一合并依据，也不能改变原始证据。

## 必读位置

```text
后端/src/features/product-research/daily/contracts/**
后端/src/features/product-research/daily/connectors/**
后端/src/features/product-research/daily/services/**
后端/src/features/product-research/product-research.service.ts
后端/src/features/products/**
后端/src/features/keywords/**
后端/src/features/agent-memory/**
后端/prisma/schema.prisma
后端/test/product-research*
```

## 标准化流水线

按固定顺序实现，并为每一步建立小型纯函数或清晰 service：

```text
读取原始候选
→ Unicode/空白/大小写清洗
→ 语言与市场标记
→ 产品类型提取
→ 材质归一
→ 用途/场景归一
→ 定制方式归一
→ 目标人群归一
→ 品牌/IP 高风险词预标记
→ 生成规范化字段
→ 生成 product_fingerprint
→ 完全重复合并
→ 同运行近似合并
→ 跨平台证据挂接
→ 历史 30 天重复检查
→ 幂等写入 ProductCandidate
```

每一步必须保留：

```text
原始值
规范化值
使用的规则版本
变换警告
来源证据 ID
```

不要求每个变换都单独一张表，但必须能在候选详情或运行日志中解释来源。

## 文本基础规则

至少处理：

- Unicode NFKC 规范化。
- 去除控制字符、零宽字符和重复空白。
- 统一常见连接符和引号。
- 大小写折叠仅用于匹配，不覆盖展示名称。
- 统一单复数、常见缩写和已批准同义词。
- 去除纯营销修饰词，但不从展示标题强行删除。
- 对尺寸、颜色、套装数量进行结构化，而不是一律拼进名称。
- 保留非拉丁语言原文，并另有匹配键。
- 语言识别不确定时标记 unknown，不假定英语。

禁止将品牌词直接删掉后当作安全产品。品牌/IP 词需要保留证据并交给风险阶段。

## 规范化词典

实现可版本化的规则/词典来源，至少覆盖：

```text
product_type_aliases
material_aliases
customization_aliases
occasion_aliases
audience_aliases
relationship_aliases
unit_aliases
stop_marketing_terms
```

第一版可以使用代码内版本化静态配置或现有配置系统，但必须：

- 有 `normalizationRuleVersion`。
- 变更有测试。
- 不让组织 A 的私有词典泄漏到组织 B。
- 支持后续从后台配置，而不在本阶段过度建设 UI。

## 产品指纹

默认语义：

```text
product_fingerprint =
  normalized_product_type
  + normalized_material
  + normalized_primary_use
  + normalized_customization_method
  + normalized_target_audience
```

示例：

```text
journal|leather|graduation-gift|laser-name|daughter
```

实现要求：

1. 先生成可读 canonical key，再对其做稳定 hash。
2. 空值使用明确 token，例如 `_none`，不能因拼接歧义碰撞。
3. 加入 `fingerprintVersion`，规则升级不覆盖旧版本。
4. 顺序、大小写和同义词变化应得到相同指纹。
5. 核心产品类型不同不得因共享关键词而合并。
6. 颜色、尺寸等变体默认不改变产品级指纹，除非它改变用途或合规属性。
7. 品牌/IP 词不作为去品牌后的合并捷径，保留风险标记。

建议结构：

```ts
{
  version: 'product-fingerprint/v1';
  canonicalKey: 'journal|leather|graduation-gift|laser-name|daughter';
  hash: 'sha256:...';
  components: {
    productType: 'journal';
    material: 'leather';
    primaryUse: 'graduation-gift';
    customizationMethod: 'laser-name';
    targetAudience: 'daughter';
  };
}
```

## 合并策略

### 1. 完全重复

满足任一可靠条件可自动合并：

- 同 source + externalId。
- 同 source + canonical URL/hash。
- 同 run + 同 fingerprint + 高一致的关键属性。
- 同导入文件内重复行 hash。

合并时不得丢失来源记录，所有 signal/evidence 继续挂接到规范化候选。

### 2. 跨平台同产品

指纹相同只是候选条件，还要检查：

```text
productType 一致
核心材质兼容
用途/场景不冲突
定制方式不冲突
目标人群不冲突
关键安全属性不冲突
```

自动合并需达到可配置高阈值。中间区间标记 `possible_duplicate`，保留为独立候选或进入人工审查，不能强行吞并。

### 3. 相似关键词但不同产品

例如：

```text
personalized leather journal
personalized leather journal cover
personalized leather journal charm
```

不能只因字符串相似就合并。核心产品类型/部件关系优先于编辑距离。

### 4. 合并字段规则

- 展示名：选择信息完整、非广告堆砌、来源质量较高的名称。
- 数值：不取任意平均值；信号保留逐来源记录，聚合由后续阶段完成。
- 市场：保留集合，不合成一个虚构市场。
- 价格：保留来源、币种和时间，后续统一换算。
- 标签：取并集但保留来源。
- rawData：不可覆盖，只引用。

## 30 天重复推荐抑制

目标不是删除历史出现过的产品，而是避免相同产品连续占据 TOP。

实现：

```text
lookbackDays 默认 30，可配置
exact fingerprint + fingerprintVersion
+ 同 workspace/组织作用域
+ 历史 decision/rank/test/listed 状态
```

建议输出：

```ts
{
  seenInLookback: true;
  lastRecommendedAt: '...';
  previousDecision: 'TEST_NOW';
  previousRank: 2;
  repetitionPenalty: 20;
  blockedFromTop: true;
  reason: 'same_fingerprint_recommended_within_30_days';
}
```

规则：

- 完全相同指纹且近 30 天已进入 TOP，默认禁止再次进入 TOP 10。
- 若有显著新证据，可允许进入观察池或人工重评，但必须标明变化原因。
- 显著变化至少包括：新增独立来源、增长跃迁、成本大幅变化、风险解除、改款维度改变。
- 已被人工拒绝的候选遵循现有持久拒绝逻辑，不应自动回到待审核，除非新运行明确标记“实质变化”且走人工审核。
- 历史出现但未进入 TOP 的候选可以重新评分，不应永久封禁。

## 幂等与并发

`NORMALIZE` 阶段必须可重复运行：

- 同一个 run 的相同原始记录重复处理，不新增重复候选。
- 使用数据库 upsert/唯一约束，不采用“先查后写”的竞态模式。
- 批量写入时在合理事务边界内，避免 300 条候选形成超大事务。
- 失败重试后已成功批次不重复挂接 signal。
- fingerprint 规则版本变化应显式重算为新 attempt，不覆盖旧指纹审计。

## 输出契约

建议：

```ts
{
  schemaVersion: 'product-normalization/v1';
  researchRunId: string;
  normalizationRuleVersion: string;
  fingerprintVersion: string;
  rawCandidateCount: number;
  normalizedCandidateCount: number;
  exactDuplicatesMerged: number;
  possibleDuplicates: number;
  crossPlatformGroups: number;
  repeatedWithinLookback: number;
  warnings: Array<{ code: string; count: number }>;
}
```

候选详情至少可返回：

```text
canonicalName
fingerprint + components
sourceCount
source list
evidence IDs
normalization warnings
possible duplicate links
history repetition metadata
```

## 测试驱动要求

先写失败测试。至少覆盖：

```text
[ ] Unicode、空白、大小写和连接符规范化稳定
[ ] 单复数/同义词得到相同 canonical component
[ ] 非拉丁原文被保留
[ ] 控制字符和零宽字符被清理
[ ] 缺失字段使用明确 token，不产生拼接碰撞
[ ] 同 source + externalId 自动合并
[ ] 同 fingerprint 的跨平台记录保留全部证据
[ ] 同名不同产品类型不合并
[ ] journal 与 journal cover 不合并
[ ] 颜色/尺寸变体按规则合并或分离
[ ] 品牌词不会被删除后绕过风险
[ ] possible duplicate 不被强制合并
[ ] 同 run 重试不新增重复候选
[ ] 两个 Worker 并发写入仍只有一个候选
[ ] 近 30 天已进 TOP 的相同指纹被阻止再次进 TOP
[ ] 新增显著证据时可以进入重评但有原因
[ ] 人工拒绝候选不会静默返回待审核
[ ] fingerprintVersion 升级不覆盖旧审计记录
```

建议测试：

```text
后端/test/product-research-normalization.spec.ts
后端/test/product-research-fingerprint.spec.ts
后端/test/product-research-deduplication.spec.ts
后端/test/product-research-repeat-suppression.spec.ts
```

## 本阶段允许修改

```text
后端/src/features/product-research/daily/services/normalization/**
后端/src/features/product-research/daily/services/product-normalization.service.ts
后端/src/features/product-research/daily/contracts/**
后端/src/features/product-research/daily/*repository*.ts
后端/src/features/product-research/daily/daily-product-research.module.ts
后端/test/product-research-normalization*.spec.ts
后端/test/product-research-fingerprint*.spec.ts
后端/test/product-research-deduplication*.spec.ts
```

若需要增加索引或可能重复链接字段，新增 Prisma 迁移，不修改旧迁移。

## 禁止事项

- 不要用一个 LLM prompt 替代可测试的规范化规则。
- 不要用字符串相似度单独决定产品合并。
- 不要在合并时平均或覆盖外部数值。
- 不要删除原始来源和证据。
- 不要把未知字段填成默认产品属性。
- 不要永久删除近 30 天重复候选，只做透明的抑制/降权。
- 不要让指纹算法无版本变化。

## 出口闸门

```text
[ ] 标准化规则、指纹和合并策略有明确版本
[ ] 相同产品跨来源合并但证据完整保留
[ ] 不同产品不会因名称相似误合并
[ ] 同 run 重试和并发写入均幂等
[ ] 30 天重复推荐抑制有历史证据和例外规则
[ ] 人工拒绝与旧候选审批兼容
[ ] 输出契约可供关键词/需求阶段读取
[ ] 所有核心边界有单元测试
[ ] 目标测试、lint、后端 build 通过
```

最后输出 `PHASE HANDOFF`。`next_phase_inputs` 必须包含：

- 规范化候选查询接口。
- fingerprint 与 component schema。
- normalization/fingerprint 版本。
- 可用于关键词扩展的安全字段。
- 重复抑制和人工拒绝元数据。
