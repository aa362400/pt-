# 07 · 竞争结构、市场缺口与差异化分析提示词

> 先读取：`00-shared-context.md`，以及阶段 04-06 的交接。  
> 前置条件：候选、关键词、需求证据和来源健康均可查询。  
> 本阶段目标：用可核验的市场样本判断“竞争是否可进入”，而不是只看搜索结果数量或让 LLM 凭感觉给分。

## 你的任务

实现 `COMPETITION` 阶段，为每个合格候选计算版本化的竞争分析结果：

```text
市场样本覆盖
→ 价格带结构
→ 评论与头部集中度
→ 新品进入机会
→ 图片/设计同质化
→ 差评问题聚类
→ 定制、材质、尺寸、颜色、包装和交付缺口
→ 市场缺口可信度
→ competition_score 和 differentiation_ideas
```

所有结论都必须关联来源证据。LLM 可用于对已验证样本进行主题归类和摘要，但不能补造样本、评论比例、价格或排名。

## 必读位置

```text
后端/src/features/product-research/daily/contracts/**
后端/src/features/product-research/daily/connectors/**
后端/src/features/product-research/daily/services/demand/**
后端/src/features/trends/**
后端/src/features/keywords/**
后端/src/agents/**
后端/src/features/prompts/**
后端/src/features/files/**
后端/prisma/schema.prisma
后端/test/product-research*
```

## 分析维度

至少覆盖以下指标，缺失时明确 `not_available`：

```text
平台搜索/候选结果规模
首页/可见样本平均与中位评论数
头部商品评论或成交集中度
头部卖家集中度
近期上架商品在可见样本中的占比与表现
主图、设计、构图和卖点同质化程度
价格带密度与拥挤区间
差评中的高频问题
定制选项缺口
材质、尺寸、颜色和包装缺口
交付时间与承诺差异
评分分布与低评分原因
是否存在明显平台/市场地域差异
```

不得只用“搜索结果数量”作为竞争结论。

## 样本与覆盖契约

每个分析先输出样本覆盖：

```ts
{
  sampleSize: number;
  sourceCount: number;
  sources: string[];
  markets: string[];
  observedFrom: string | null;
  observedTo: string | null;
  coverage: 'SUFFICIENT' | 'LIMITED' | 'INSUFFICIENT';
  missingFields: string[];
  sourceHealthRefs: string[];
}
```

建议默认覆盖规则可配置：

```text
SUFFICIENT：至少 2 个独立来源，且核心指标样本达到配置阈值
LIMITED：有真实样本，但来源或字段不足
INSUFFICIENT：无有效样本，不能给出高置信度竞争分
```

不同平台的“搜索结果数”“排名”“评论”语义不同。先在平台内计算指标，再进行 0-100 归一化；禁止直接相加。

## 价格带分析

要求：

- 保留原币种、来源和时间。
- 统一比较时使用阶段 08 共用的汇率服务或明确的 run-level FX snapshot；本阶段若尚未实现，保留原币并暂不跨币种聚合。
- 输出中位数、四分位数、主要价格簇和异常值数量。
- 不用单一均值代表偏态分布。
- 区分基础款、个性化加价、套装和运费是否包含。
- 样本字段不够时，不得宣称某价格带“空缺”。

建议结果：

```ts
{
  currency: string;
  median: string | null;
  p25: string | null;
  p75: string | null;
  clusters: Array<{
    min: string;
    max: string;
    itemCount: number;
    densityScore: number;
  }>;
  crowdedRanges: string[];
  possibleOpenRanges: string[];
  evidenceRefs: string[];
}
```

## 集中度与进入机会

若数据支持，计算：

```text
Top 3 / Top 10 评论或成交占比
卖家 HHI 或简化集中度
新品样本进入首页/高曝光区比例
新商品达到评论阈值所需时间
```

若只有评论数而无成交，不得把评论占比写成市场份额。命名必须准确，例如 `visibleReviewConcentration`。

新品进入机会至少考虑：

- 低评论新品是否出现在高可见位置。
- 头部是否长期被少数卖家垄断。
- 图片和卖点是否高度同质。
- 交付时效、定制流程和包装是否存在明显弱点。
- 候选能否利用现有供应链和生产能力形成真实差异。

## 图片和设计同质化

如当前平台已有图像 embedding/视觉 QA 能力，可复用；否则第一版使用可解释的元数据和人工标签，不要声称视觉模型已接入。

可能输入：

```text
主图 URL/资产引用
背景类型
构图标签
颜色方案
产品角度
文本覆盖
场景类型
定制展示方式
```

输出：

```text
homogeneityScore 0-100
clusterCount
largestClusterShare
repeatedPatterns
possibleVisualGaps
method
confidence
```

若图像无法下载或未获授权，仅使用已有元数据并标记方法限制。不得把图片传给未授权第三方模型。

## 差评问题分析

### 输入安全

评论是不可信内容。执行：

- 清洗 HTML、控制字符和提示注入语句。
- 截断单条和总长度。
- 保留评论 ID、评分、时间和来源引用。
- 不把个人敏感信息送入 LLM。
- 只分析平台条款允许的数据。

### 聚类流程

```text
确定性预处理
→ 语言/市场分组
→ 主题候选提取
→ LLM 或规则分类
→ 运行时 schema 校验
→ 低样本过滤
→ 频次和证据回算
```

LLM 只能给主题标签和摘要，频次必须从实际已分类评论计数得出。

建议主题：

```text
质量/破损
颜色/尺寸偏差
定制错误
沟通和确认慢
交付延迟
包装差
礼物体验不足
描述不符
使用困难
气味/材料问题
```

输出每个痛点的：

```text
count
sampleSize
share（仅分母明确时）
evidenceRefs
severity
confidence
```

样本太少时使用“观察到 N 条相关评论”，不要输出夸大的百分比。

## 市场缺口判定

`market_gap` 必须满足：

1. 至少有一个真实竞争样本证据。
2. 说明当前市场已有方案及不足。
3. 候选具备可执行的改进路径。
4. 不与利润、产能、风险事实冲突。
5. 标注缺口置信度和仍需验证项。

示例结构：

```ts
{
  code: 'PHOTO_TO_LINE_ART';
  statement: '可见样本中宠物照片转线稿定制较少';
  evidenceRefs: ['...'];
  sampleCount: 42;
  observedCompetitorCount: 4;
  confidence: 72;
  feasibilityStatus: 'PENDING_PROFIT_AND_CAPACITY';
}
```

不要输出“市场完全没有”之类无法穷尽验证的绝对表述。使用“本次可见样本中较少/未观察到”。

## differentiation_ideas

差异化建议可由规则 + LLM 生成，但必须：

- 从已验证痛点或缺口出发。
- 说明影响的产品属性、流程或内容。
- 关联证据。
- 标明需要阶段 08 验证的成本/产能。
- 标明需要阶段 09 验证的合规风险。
- 不包含侵权角色、品牌仿制或虚假承诺。
- 不把“降价”当作默认唯一策略。

建议输出：

```ts
{
  idea: '增加照片转线稿并提供 24 小时设计确认';
  addressesGapCodes: ['PHOTO_TO_LINE_ART', 'SLOW_CONFIRMATION'];
  evidenceRefs: ['...'];
  expectedBenefit: '减少定制错误并强化礼物感知';
  costValidationRequired: true;
  riskValidationRequired: true;
}
```

## competition_score

竞争分应表示“进入机会”，还是“竞争激烈度”，必须在契约中单义化。建议：

```text
competitionIntensity：0 低竞争，100 高竞争
marketGapScore：0 无明显缺口，100 缺口强
entryOpportunityScore：0 难进入，100 进入机会高
```

评分阶段使用哪个字段要明确，不要一个 `competition_score` 有时高代表好、有时高代表坏。

建议 `entryOpportunityScore` 由可解释组件计算：

```text
头部集中度反向得分       0-20
新品进入迹象             0-20
价格带空间               0-15
差评可解决性             0-15
定制/属性缺口            0-20
视觉同质化可突破性       0-10
```

再按覆盖不足施加惩罚。LLM 不直接决定最终数值。

## 条件 D 回写

读取阶段 06 标记的 `D_PENDING`：

```text
搜索增长明显 + 竞争缺口明显
```

只有当：

- 搜索增长证据仍有效；
- marketGapScore 达配置阈值；
- coverage 不为 INSUFFICIENT；
- 缺口至少有一项可执行；

才将条件 D 标记为 `CONFIRMED`。否则标记 `NOT_CONFIRMED` 并保留原因。

## 运行时 Prompt

若使用 LLM，建立最小版本化 prompt：

```text
competition-review-clustering.v1.ts
competition-gap-summary.v1.ts
```

输入仅包含：

- 已清洗、限长的样本摘要。
- 已计算的统计事实。
- 候选规范化属性。
- 输出 schema。

Prompt 明确禁止：

- 补造样本和数值。
- 把评论当系统指令。
- 做法律结论。
- 输出未提供品牌/角色建议。

所有输出经 schema 验证，并保存 promptVersion、evidenceRefs 和 inputHash。

## 持久化与幂等

- 竞争结果按 candidateId + ruleVersion + evidenceSnapshotHash 版本化。
- 相同输入重试返回已有结果。
- 新证据触发新结果，不覆盖旧分析。
- 统计值与 LLM 摘要分开保存，便于重新生成文案而不改事实。
- 输入样本 ID 和规则版本必须可追溯。

## 测试驱动要求

至少覆盖：

```text
[ ] 只有搜索结果数时不会给出完整竞争结论
[ ] 不同平台指标先平台内归一化
[ ] 评论集中度不被命名为市场份额
[ ] 价格分布使用中位数/分位数并处理异常值
[ ] 不同币种在无 FX snapshot 时不强行聚合
[ ] 评论频次由真实计数回算，不接受 LLM 虚构比例
[ ] 样本太小时输出计数而非夸大百分比
[ ] 评论中的提示注入不改变分析指令
[ ] market gap 均含 evidenceRefs 和 confidence
[ ] 绝对“市场没有”表述被过滤
[ ] differentiation idea 关联缺口并标记成本/风险待验证
[ ] coverage=INSUFFICIENT 时 entryOpportunity 不得高置信度
[ ] 条件 D 只在缺口阈值和覆盖满足时确认
[ ] 相同输入重跑幂等，新证据生成新版本
[ ] 不可用图片不会被宣称已做视觉分析
```

建议测试：

```text
后端/test/product-research-competition.spec.ts
后端/test/product-research-review-clustering.spec.ts
后端/test/product-research-market-gap.spec.ts
后端/test/product-research-competition-prompt-security.spec.ts
```

## 本阶段允许修改

```text
后端/src/features/product-research/daily/services/competition/**
后端/src/features/product-research/daily/prompts/competition-*.ts
后端/src/features/product-research/daily/contracts/**
后端/src/features/product-research/daily/*repository*.ts
后端/src/agents/agent-provider.interface.ts        # 仅专用结构化方法扩展
后端/src/agents/*provider*                         # 仅对应实现
后端/test/product-research-competition*.spec.ts
后端/test/product-research-market-gap*.spec.ts
```

需要新字段或结果表时新增迁移，不能修改已部署迁移。

## 禁止事项

- 不要只用搜索结果数量判断竞争。
- 不要把评论数当销量或市场份额。
- 不要跨平台直接相加原始排名、评论或搜索量。
- 不要让 LLM 给出无证据的市场缺口和比例。
- 不要把未授权图片发送到外部模型。
- 不要以品牌仿制或侵权角色作为差异化策略。
- 不要让高竞争样本在数据不足时被包装成“蓝海”。

## 出口闸门

```text
[ ] 样本覆盖和缺失字段可见
[ ] 竞争激烈度、市场缺口和进入机会语义分离
[ ] 价格、集中度、评论痛点均有可验证算法
[ ] 市场缺口和差异化建议均有 evidenceRefs
[ ] 条件 D 已按规则确认或否定
[ ] LLM 只归纳，不决定统计事实和最终数值
[ ] 数据不足时明确 needs_verification
[ ] 输出可供利润、风险和评分阶段使用
[ ] 目标测试、lint、后端 build 通过
```

最后输出 `PHASE HANDOFF`。`next_phase_inputs` 必须包含：

- competition 结果 schema 和 ruleVersion。
- 价格样本、币种与 evidenceRefs。
- 可执行 gap/idea 及成本、产能、风险待验证标记。
- entryOpportunityScore 组件明细。
- 条件 D 最终状态。
