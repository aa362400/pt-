# 10 · 版本化评分、硬门槛与推荐分池提示词

> 先读取：`00-shared-context.md`，以及阶段 05-09 的交接。  
> 前置条件：候选已有需求、增长、竞争、利润、产能、风险、数据完整度和历史重复信息。  
> 本阶段目标：以确定、可解释、可回滚的规则输出总分、排名与 `TEST_NOW/WATCH/HOLD/REJECT`，不让 LLM 或高分绕过硬门槛。

## 你的任务

实现 `SCORE` 阶段和评分版本管理后端。流程顺序必须是：

```text
加载本 run 锁定的 ScoringVersion
→ 校验权重与阈值
→ 执行硬门槛
→ 计算各组件标准分
→ 处理缺失数据和置信度
→ 计算原始总分
→ 应用透明惩罚
→ 生成最终分数和决策
→ 按 fingerprint 去重和稳定排序
→ 选出最多 TOP N
→ 保存分数明细、版本和原因
```

LLM 可以生成解释文案，但不能计算、覆盖总分、门槛或最终决策。

## 必读位置

```text
后端/src/features/product-research/daily/**
后端/src/features/product-research/**
后端/src/features/review/**
后端/src/shared/audit/**
后端/src/shared/auth/**
后端/prisma/schema.prisma
后端/test/product-research*
智能体前端/src/api/productResearch.ts
```

## 一、默认权重

总分 100：

| 指标 | 权重 |
|---|---:|
| 真实需求强度 | 20 |
| 近 30-90 天增长 | 12 |
| 竞争缺口/进入机会 | 16 |
| 广告后净利润 | 16 |
| 可定制能力 | 12 |
| 视觉传播能力 | 8 |
| 生产与物流可行性 | 6 |
| 生命周期 | 5 |
| 侵权与合规安全 | 5 |

权重存储为明确键，不依赖数组顺序。保存时校验：

```text
每个权重 0-100
总和必须等于 100
必需键完整
无未知键
阈值范围合法
```

不要在保存时自动偷偷归一化错误权重。应返回明确验证错误，让管理员修正。

## 二、硬门槛

硬门槛先执行，至少包括：

```text
HIGH/BLOCKED 风险
平台或目的国明确禁售
物流/产能无法履约
BASE 广告后净利率低于配置阈值
关键成本缺失，无法可靠计算净利润
退款率高于最大阈值
供应链不稳定或关键成本过期
需求证据 INVALID
只有 WEAK 信号却尝试进入 TEST_NOW
数据来源不足且无法验证
近 30 天完全相同 fingerprint 已进入 TOP，且无实质变化
人工持久拒绝仍有效
```

建议输出：

```ts
{
  passed: boolean;
  reasons: Array<{
    code: string;
    severity: 'BLOCK' | 'DOWNGRADE';
    evidenceRefs: string[];
    message: string;
  }>;
  maximumDecision: 'TEST_NOW' | 'WATCH' | 'HOLD' | 'REJECT';
}
```

某些门槛直接 `REJECT`，某些只限制最高决策为 `WATCH`。规则要版本化并有测试。

### 默认门槛语义

```text
HIGH/BLOCKED 风险                  → REJECT
平台禁售/无法履约                  → REJECT
BASE 净利率 < 最低值               → REJECT 或 HOLD，按配置明确
关键利润成本缺失                   → 最大 HOLD/WATCH，不能 TEST_NOW
WEAK 单来源需求                    → 最大 WATCH
MEDIUM 风险未审核                  → 最大 WATCH，且 needsReview
近 30 天 exact TOP 重复            → 最大 WATCH 或 REJECT_FROM_TODAY_TOP
```

不允许同一原因既惩罚分数又重复硬扣，除非规则文档明确说明。

## 三、组件标准分

每个组件标准化为 0-100，再乘权重。必须有独立纯函数和版本化映射。

### 1. 需求分

输入：

```text
signalStrength
confidenceScore
HIGH/MEDIUM intent 数量
独立来源数量
条件 A-D
数据新鲜度
```

示例：STRONG 不自动等于 100，仍受 confidence 和证据质量影响。

### 2. 增长分

- 使用已验证 30/90 天增长或平台内归一化趋势。
- 只在分母、窗口和来源有效时计算。
- 极端异常值做上限截断并保留原值。
- 季节性短峰不应等同长期增长。

### 3. 竞争缺口分

使用阶段 07 的 `entryOpportunityScore` 或 `marketGapScore` 中契约指定字段。不要错误使用“竞争激烈度越高分越高”。

### 4. 净利润分

使用 BASE 情景广告后净利率、净利润和保守情景风险。避免只按百分比偏爱低价小利润产品，可结合：

```text
netMarginAfterAds
absoluteNetProfit
conservativeDownside
breakEvenAdHeadroom
profitConfidence
```

映射规则必须可配置且可解释。

### 5. 可定制能力分

根据真实可执行方式，而不是关键词数量：

```text
定制层级数量
工艺可行性
设计确认流程
错误率/沟通成本
是否形成竞争缺口
供应链支持
```

### 6. 视觉传播分

仅使用已有可信视觉/内容信号：

```text
可展示定制前后对比
礼物开箱表现
产品视觉独特性
短视频演示性
现有样本同质化可突破性
```

没有视觉分析时标记缺失，不让 LLM 凭空给高分。

### 7. 生产与物流分

使用：

```text
capacityRisk
leadTime
failure/scrap
supply stability
shippingRisk
requiredDocuments
```

### 8. 生命周期分

区分：

```text
EVERGREEN
SEASONAL_REPEATABLE
EVENT_WINDOW
FAD
UNKNOWN
```

考虑销售窗口、准备周期、库存风险和重复购买/礼物周期。没有时间证据时不能给满分。

### 9. 安全分

风险安全分不是硬门槛替代物：

```text
LOW 且规则新鲜/字段完整 → 较高
MEDIUM → 低分且最大 WATCH
HIGH/BLOCKED → 硬淘汰
规则来源过期/属性缺失 → 降分和人工审核
```

## 四、缺失数据策略

每个组件必须定义：

```text
requiredInputs
optionalInputs
missingPolicy
minimumConfidence
```

禁止用 0 静默代替未知。建议输出：

```ts
{
  score: number | null;
  weightedPoints: number;
  confidence: number;
  missingInputs: string[];
  evidenceRefs: string[];
  explanationCode: string;
}
```

处理方式可为：

```text
BLOCK：关键事实缺失，不能进入评分或立即打样
NEUTRAL_WITH_PENALTY：赋中性值并透明扣置信度
ZERO_WITH_REASON：业务上确实等于零，而非未知
NOT_APPLICABLE：权重重新分配只在规则版本明确允许时进行
```

默认不对缺失组件自动重新分配权重，以免数据少的候选获得虚高总分。

## 五、总分

建议：

```text
rawWeightedScore = Σ(componentScore × weight / 100)
confidencePenalty = 可配置且有上限
repetitionPenalty = 来自阶段 05，不能低于硬门槛限制
finalScore = clamp(rawWeightedScore - penalties, 0, 100)
```

所有中间值保存足够精度，最终展示可四舍五入到整数或一位小数。排序使用未截断精度，展示值相同不代表真实 tie。

## 六、决策分级

默认：

```text
80-100：TEST_NOW / 立即打样
68-79：WATCH / 观察池
50-67：HOLD / 暂缓
0-49：REJECT / 淘汰
```

最终决策：

```text
scoreDecision 与 hardGate.maximumDecision 取更保守者
```

示例：总分 87，但只有 WEAK 单来源需求，最终为 WATCH；总分 92，但 HIGH 风险，最终 REJECT。

## 七、排名和 TOP N

### 去重

- 同一 run 的 TOP 按 `fingerprint + fingerprintVersion` 唯一。
- 可能重复但未自动合并的候选，默认只保留更高置信度者进入 TOP，其余进入观察并标记关联。
- 同一产品的颜色/尺寸变体不能占多个 TOP 位。
- 近 30 天 exact TOP 重复遵循阶段 05 门槛。

### 稳定排序

建议 tie-breaker 顺序：

```text
finalScore DESC
confidenceScore DESC
netProfitAfterAds DESC
entryOpportunityScore DESC
sourceCount DESC
fingerprint ASC
candidateId ASC
```

保证相同输入重复运行产生相同排名。

### 不凑数

- 只选最终 `TEST_NOW` 且通过所有门槛的候选。
- `topLimit=10` 是上限，不是配额。
- 只有 3 个合格候选就输出 3 个。
- 0 个合格候选时输出明确状态，不把 WATCH 提升为 TEST_NOW。

## 八、ScoringVersion 管理

### 创建

```text
POST /daily-product-research/scoring-versions
```

要求：

- 管理员权限。
- weights/thresholds schema 校验。
- reason 必填。
- 默认创建 DRAFT。
- 记录 basedOnVersionId、创建人和审计。

### 激活

```text
POST /daily-product-research/scoring-versions/:id/activate
```

要求：

- 事务内完成旧 ACTIVE 退役和新版本激活。
- 同作用域只能一个 ACTIVE。
- 已开始的 run 继续使用 configSnapshot 中锁定版本。
- 新 run 使用新版本。
- 激活写审计和通知。

### 回滚

```text
POST /daily-product-research/scoring-versions/:id/rollback
```

回滚不能删除历史。可重新激活旧版本或创建“基于旧版本的回滚版本”，按阶段 02 模型执行。必须记录原因、操作者和影响范围。

### 模拟

建议提供管理员 dry-run：

```text
POST /daily-product-research/scoring-versions/:id/simulate
```

对指定历史 run 重算但不覆盖现有分数，输出排名差异、决策变化和阈值影响。受预算和权限限制。

## 九、解释契约

每个候选输出机器和人类可读解释：

```ts
{
  candidateId: string;
  scoringVersionId: string;
  componentScores: [...];
  rawScore: number;
  penalties: [...];
  finalScore: number;
  scoreDecision: string;
  hardGate: {...};
  finalDecision: string;
  rank: number | null;
  decisionReasons: string[];
  evidenceRefs: string[];
  needsManualReview: boolean;
}
```

LLM 生成摘要时只能复述已计算字段和原因码，输出经 schema 验证。即使 LLM 失败，数字评分和决策仍能完成。

## 十、持久化和幂等

- 每个分数关联 run、candidate、scoringVersion、inputSnapshotHash。
- 相同 input hash 重试不新增冲突记录。
- 显式重算创建新 attempt/version，不覆盖旧分数。
- 排名在全 run 候选评分结束后一次性稳定写入。
- 并发评分使用批次/锁或事务避免两个 Worker 写不同排名。
- 保存 scoringVersion snapshot 或不可变引用，不能因配置后来被编辑而改变历史解释。

## 测试驱动要求

### 权重和版本

```text
[ ] 默认权重总和为 100
[ ] 缺键、多键、负数、总和不为 100 被拒绝
[ ] 同作用域只能一个 ACTIVE
[ ] 激活事务原子
[ ] 已运行批次不受后续权重修改影响
[ ] 回滚保留完整审计和历史
[ ] simulate 不覆盖正式分数
```

### 门槛

```text
[ ] HIGH/BLOCKED 无论分数多高都 REJECT
[ ] 禁售/无法履约 REJECT
[ ] BASE 净利率不足按配置拒绝或降级
[ ] missingCriticalCosts 不能 TEST_NOW
[ ] WEAK 信号最高 WATCH
[ ] MEDIUM 风险未审核最高 WATCH
[ ] 近 30 天 exact TOP 重复不能再次占 TOP
[ ] 人工持久拒绝仍有效
```

### 分数和排名

```text
[ ] 每个组件按正确方向映射
[ ] competitionIntensity 不会被误当进入机会
[ ] 未知值不会静默当 0
[ ] confidence/repetition 惩罚只应用一次
[ ] finalScore clamp 0-100
[ ] 相同输入排序稳定
[ ] 同 fingerprint 只占一个 TOP 位
[ ] topLimit 是上限，不足 10 不补齐
[ ] 0 个 TEST_NOW 时返回空 TOP 和明确原因
[ ] LLM 解释失败不影响评分结果
```

建议测试：

```text
后端/test/product-research-scoring-engine.spec.ts
后端/test/product-research-hard-gates.spec.ts
后端/test/product-research-ranking.spec.ts
后端/test/product-research-scoring-version.spec.ts
后端/test/product-research-scoring-simulation.spec.ts
```

## 本阶段允许修改

```text
后端/src/features/product-research/daily/services/scoring/**
后端/src/features/product-research/daily/contracts/**
后端/src/features/product-research/daily/*repository*.ts
后端/src/features/product-research/daily/*controller*.ts
后端/src/features/product-research/daily/*dto*.ts
后端/src/features/product-research/daily/prompts/scoring-summary*.ts
后端/src/shared/audit/**                          # 仅版本事件
后端/prisma/schema.prisma                        # 仅阶段 02 模型补充
后端/prisma/migrations/<new-migration>/**
后端/test/product-research-scoring*.spec.ts
后端/test/product-research-ranking*.spec.ts
```

## 禁止事项

- 不要让 LLM 计算总分或最终决策。
- 不要在硬门槛之后用高分恢复被阻断候选。
- 不要把未知字段当 0 或自动重分配权重。
- 不要悄悄归一化错误权重。
- 不要覆盖历史评分版本。
- 不要为了 TOP 10 数量提升 WATCH/HOLD。
- 不要允许同一 fingerprint 多次占榜。
- 不要让管理员修改影响正在运行的 configSnapshot。

## 出口闸门

```text
[ ] 默认 100 分权重和阈值已版本化
[ ] 硬门槛在加权分前执行且有独立测试
[ ] 每个组件有单义输入、方向和缺失策略
[ ] 总分、惩罚、最终决策可完整解释
[ ] HIGH/BLOCKED、弱信号、利润不足等限制不可绕过
[ ] TOP 按 fingerprint 去重且排序稳定
[ ] 不足 10 个不会凑数
[ ] ScoringVersion 创建、激活、模拟、回滚有权限和审计
[ ] 历史分数不可变且重算版本化
[ ] Prisma validate、目标测试、lint、后端 build 通过
```

最后输出 `PHASE HANDOFF`。`next_phase_inputs` 必须包含：

- ScoringVersion ID、权重和阈值快照。
- TOP/WATCH/HOLD/REJECT 候选 ID 与稳定排名。
- 每个候选的分数明细、门槛原因和 evidenceRefs。
- 0 个合格候选时的状态。
- 报告阶段需要的所有字段查询接口。
