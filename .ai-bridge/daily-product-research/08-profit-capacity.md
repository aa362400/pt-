# 08 · 完整净利润、情景测算与 UV/激光产能提示词

> 先读取：`00-shared-context.md`，阶段 02、04、07 的交接，以及当前 `profit-calculator`、供应链和订单模型。  
> 前置条件：候选已具备价格样本、差异化方案、供应商成本引用和来源时间。  
> 本阶段目标：把“售价减货品成本”的简化计算升级为可审计、可配置、按币种安全计算的完整利润与生产能力判断。

## 你的任务

实现 `PROFIT` 阶段，并在不破坏现有 `ProfitCalculation` API 的前提下扩展或新增选品专用利润快照。

必须计算：

```text
销售价格
- 产品成本
- 定制加工费
- 包装费用
- 国内物流
- 国际物流
- 平台佣金
- 支付费用
- 提现/结算费用
- 广告成本
- 退款损耗
- 售后损耗
- 税费
- 仓储费用
- 设备折旧
- 人工成本
- 其它经证实成本
= 预计广告后净利润
```

UV/激光类产品还必须计算：

```text
单件加工时间
排版/设计时间
设备占用时间
墨水、光油、膜材、激光耗材
打样失败率
报废率
个性化沟通时间
批量切换/装夹时间
每日最大产能
产能利用率
交付缓冲
```

## 必读位置

```text
后端/src/features/profit-calculator/**
后端/src/features/supply-chain/**
后端/src/features/products/**
后端/src/features/listings/**
后端/src/features/analytics/**
后端/src/features/channels/**
后端/src/features/product-research/daily/**
后端/prisma/schema.prisma
后端/test/profit*
后端/test/supply*
智能体前端/src/api/profitCalculator.ts 或等价文件
```

## 一、兼容策略

当前通用 `ProfitCalculation` 已有：

```text
salePrice
productCost
packagingCost
shippingCost
platformFee
paymentFee
adCost
storageCost
otherCost
totalCost
estimatedProfit
profitMargin
roi
```

保持现有字段、路由和前端可用。根据阶段 02 审计结果选择以下之一：

### 方案 A：新增版本化成本明细字段

适用于现有表可安全扩展：

```text
schemaVersion
costBreakdown JSON
assumptions JSON
sourceRefs JSON
scenario
fxSnapshotId?
calculationRuleVersion
```

### 方案 B：新增 ProductProfitSnapshot/CostLineItem

适用于需要多情景、逐成本来源和历史版本：

```text
ProductProfitSnapshot
ProductCostLineItem
ProductionCapacitySnapshot
```

不得创建与 `ProfitCalculation` 完全重叠、没有关联的第二套孤岛。新结果必须能关联 candidateId、researchRunId、旧 ProfitCalculation 或产品。

## 二、金额与币种

### Decimal

- 所有金额使用 Prisma Decimal、decimal.js 或项目现有十进制方案。
- 禁止使用 JS 二进制 float 直接累加货币。
- API 中金额序列化为十进制字符串，或沿用项目已验证格式。
- 明确舍入时点和规则，建议最终展示按币种精度舍入，中间计算保留更高精度。

### 币种

每条成本和售价包含：

```text
amount
currency
observedAt
sourceRef
quality
```

跨币种计算使用 run-level `FxRateSnapshot` 或现有汇率服务：

```text
baseCurrency
quoteCurrency
rate
provider
observedAt
fetchedAt
```

规则：

- 同一 run 内复用冻结汇率快照。
- 无可靠汇率时不强行计算统一净利润，标记 `FX_MISSING`。
- 不使用模型记忆中的汇率。
- 汇率来源过期时降低 confidence 或阻断 TEST_NOW。

## 三、售价输入

售价来源可包括：

```text
竞争样本中位价
目标价格带
现有店铺同类实际成交价
人工配置价
差异化加价
```

必须输出 `priceBasis` 和 evidenceRefs。不要让 LLM 单独决定售价。

建议至少计算三个情景：

```text
CONSERVATIVE：低售价、高广告/退款/物流成本
BASE：中位或目标售价、基准成本
OPTIMISTIC：合理高售价、较优成本，但不能超出现有证据范围
```

每个情景独立展示，不用乐观情景覆盖基准结论。硬门槛默认基于 `BASE` 和 `CONSERVATIVE` 的配置规则，例如 BASE 达标且 CONSERVATIVE 不出现严重亏损。

## 四、成本行契约

建议：

```ts
{
  code: 'INTERNATIONAL_SHIPPING';
  label: '国际物流';
  amount: '6.25';
  currency: 'USD';
  calculationMethod: 'FIXED' | 'PERCENT_OF_REVENUE' | 'PER_MINUTE' | 'EXPECTED_LOSS' | 'TIERED';
  rate?: '0.05';
  quantity?: '1';
  sourceRef?: string;
  observedAt?: string;
  quality: 'VERIFIED' | 'ESTIMATED' | 'MANUAL' | 'UNKNOWN';
  assumption?: string;
}
```

核心成本若未知，不得变成 0。使用：

```text
amount = null
quality = UNKNOWN
missingCriticalCost = true
```

关键成本缺失时，候选不能进入高置信度立即打样。

## 五、费用计算规则

### 平台费、支付费和提现费

- 按平台、市场、类目和时间版本化。
- 支持固定费、百分比、阶梯费和每单费。
- 平台费用规则必须有来源/配置版本。
- 不把平台佣金与支付费重复计算。
- 税基是售价、含运费金额还是利润，要按市场规则明确。

### 广告成本

支持输入：

```text
目标 ACOS/TACOS
历史同类 CPC/转化率
每单广告成本
无广告情景
```

广告前毛利和广告后净利润必须分别命名并输出。禁止把广告前毛利当最终利润。

### 退款和售后损耗

使用期望损失：

```text
expectedRefundLoss = refundRate × averageRefundLossPerOrder
expectedAfterSaleLoss = afterSaleRate × averageAfterSaleCost
```

退款率来源可以是：

- 自有店铺同类历史。
- 市场/类目经过验证的基线。
- 人工保守配置。

没有来源时不能随意设 0。采用可配置保守默认并标记 `ESTIMATED`，或阻断高置信度推荐。

### 税费

- 税率和适用基数必须配置/版本化。
- 本系统输出经营估算，不冒充法律或税务结论。
- 不确定市场税务时标记 `needs_tax_review`。

### 人工、设备与定制沟通

```text
laborCost = totalLaborMinutes / 60 × hourlyLaborRate
machineDepreciation = machineMinutes × depreciationPerMachineMinute
customizationCommunication = expectedCommunicationMinutes × hourlyLaborRate
```

人工费率和折旧参数必须可配置，并记录版本。

## 六、UV/激光生产模型

### 工序输入

```text
designMinutes
layoutMinutes
setupMinutes
machineMinutes
finishingMinutes
packingMinutes
communicationMinutes
batchSize
changeoverMinutes
materialConsumption
consumableConsumption
failureRate
scrapRate
reworkRate
availableMachineMinutesPerDay
availableLaborMinutesPerDay
```

### 失败与报废

不要只把失败率乘产品成本。期望损耗应覆盖：

```text
材料
已投入加工
人工
设备时间
重新包装
加急/延误风险
```

避免双重计算 failureRate 与 scrapRate，定义互斥或条件关系。

### 产能

至少输出：

```text
unitsPerMachineDay
unitsPerLaborDay
bottleneck
practicalUnitsPerDay
peakSafeUnitsPerDay
estimatedLeadTimeDays
capacityUtilizationAtForecast
capacityRisk
```

`practicalUnitsPerDay` 要考虑换线、维护、失败和安全缓冲。不能直接使用 24 小时除单件时间。

### 个性化订单

定制产品还要考虑：

- 买家素材不合格率。
- 设计确认轮次。
- 沟通等待造成的交付延迟。
- 不同定制复杂度层级。
- 人工复核和拼写错误风险。

可以定义：

```text
SIMPLE_NAME
TEXT_AND_DATE
PHOTO_TO_LINE_ART
MULTI_PERSONALIZATION
CUSTOM_DESIGN
```

每层有默认工时/失败风险，但必须可配置并标明来源。

## 七、关键结果

每个情景至少输出：

```text
salePrice
grossRevenue
variableCost
fixedAllocatedCost
totalCostBeforeAds
grossProfitBeforeAds
grossMarginBeforeAds
adCost
expectedRefundLoss
expectedAfterSaleLoss
estimatedNetProfitAfterAds
netMarginAfterAds
roi
breakEvenAdCost
breakEvenSalePrice
missingCriticalCosts
capacityResult
assumptions
sourceRefs
confidence
```

### 默认硬阈值

```text
广告前毛利率 >= 45%
广告后净利率 >= 18%
预计退款率 <= 8%
产能可在目标交付期内完成
```

阈值从本次 run 的 configSnapshot 读取。利润阶段输出门槛结果，但最终硬门槛由阶段 10 统一执行。

### 建议契约

```ts
{
  schemaVersion: 'product-profit/v1';
  candidateId: string;
  ruleVersion: string;
  baseCurrency: string;
  fxSnapshotRefs: string[];
  scenarios: ProfitScenario[];
  selectedScenario: 'BASE';
  thresholdEvaluation: {
    grossMarginPassed: boolean | null;
    netMarginPassed: boolean | null;
    refundRatePassed: boolean | null;
    capacityPassed: boolean | null;
  };
  missingCriticalCosts: string[];
  confidenceScore: number;
  needsManualReview: boolean;
}
```

## 八、纯计算核心

将计算核心做成无数据库、无网络的纯函数/领域服务：

```text
ProfitEngine
CapacityEngine
FeeRuleEngine
FxConversionService
```

外层服务负责加载配置、来源和持久化。这样可以：

- 精确测试舍入和边界。
- 复用现有利润计算页面。
- 避免 Agent/数据库逻辑污染数学计算。
- 支持后续批量重算。

LLM 不参与金额计算。

## 九、持久化和版本

- 每次结果保存 ruleVersion、configSnapshotHash、inputEvidenceHash。
- 相同输入 hash 重试幂等。
- 价格、成本或汇率变化产生新版本，不覆盖历史。
- 旧 `ProfitCalculation` 可继续作为用户手动计算；每日选品结果通过关联或兼容字段呈现。
- 若回填旧记录，不能假定 `otherCost` 的细分组成。

## 测试驱动要求

### 金额和费用

```text
[ ] Decimal 加总无浮点误差
[ ] 固定费、百分比、阶梯费计算正确
[ ] 平台费和支付费不重复
[ ] 未知成本保持 null，不变成 0
[ ] 广告前毛利与广告后净利润不同且命名准确
[ ] 退款/售后用期望损失计算
[ ] 税费按正确基数计算
[ ] FX 缺失阻止跨币种利润
[ ] 同 run 使用同一 FX snapshot
[ ] 保守/基准/乐观情景不超出输入证据范围
[ ] break-even 值边界正确
[ ] 零售价、负成本、NaN、Infinity 被拒绝
```

### UV/激光和产能

```text
[ ] 工时换算和人工费正确
[ ] 设备折旧按分钟分配
[ ] failure/scrap 不重复计算
[ ] 换线、维护和缓冲降低实际产能
[ ] 机器与人工瓶颈取更小产能
[ ] 个性化沟通时间计入成本和交付
[ ] 设计确认轮次影响 lead time
[ ] 高利用率触发 capacity risk
[ ] 核心工时缺失不能标记 capacity passed
```

### 兼容和租户

```text
[ ] 旧 ProfitCalculation API 回归通过
[ ] 新候选利润只可在本 organization/workspace 查询
[ ] 相同 input hash 重跑幂等
[ ] 成本变化生成新版本而非覆盖
[ ] 日志不包含供应商敏感信息或密钥
```

建议测试：

```text
后端/test/product-research-profit-engine.spec.ts
后端/test/product-research-fee-rules.spec.ts
后端/test/product-research-fx.spec.ts
后端/test/product-research-capacity.spec.ts
后端/test/product-research-profit-compatibility.spec.ts
```

## 本阶段允许修改

```text
后端/src/features/product-research/daily/services/profit/**
后端/src/features/product-research/daily/contracts/**
后端/src/features/product-research/daily/*repository*.ts
后端/src/features/profit-calculator/**                  # 仅提取纯计算或兼容扩展
后端/src/features/supply-chain/**                       # 仅读取成本/产能所需接口
后端/prisma/schema.prisma                               # 仅阶段 02 方案要求
后端/prisma/migrations/<new-migration>/**
后端/test/product-research-profit*.spec.ts
后端/test/product-research-capacity*.spec.ts
后端/.env.example
```

不要在本阶段重做利润前端页面。

## 禁止事项

- 不要把毛利当净利润。
- 不要用 JS float 直接计算货币。
- 不要把缺失成本填 0。
- 不要让 LLM 计算或覆盖金额。
- 不要使用未注明来源的汇率、平台费率或税率。
- 不要用乐观情景替代基准结论。
- 不要忽略定制沟通、失败、报废和产能瓶颈。
- 不要让高利润掩盖无法履约。

## 出口闸门

```text
[ ] 完整成本项均可结构化表示并带来源/质量
[ ] Decimal、币种和汇率快照语义正确
[ ] 至少支持 CONSERVATIVE/BASE/OPTIMISTIC 三情景
[ ] 广告前毛利与广告后净利润均输出
[ ] UV/激光耗材、工时、失败、报废和产能已覆盖
[ ] 核心成本缺失时不能高置信度通过
[ ] 默认 45%/18%/8% 阈值从 configSnapshot 读取
[ ] 旧利润接口保持兼容
[ ] 所有数学边界有纯函数测试
[ ] Prisma validate、目标测试、lint、后端 build 通过
```

最后输出 `PHASE HANDOFF`。`next_phase_inputs` 必须包含：

- 利润/产能结果 schema 和 ruleVersion。
- BASE/CONSERVATIVE 情景的门槛结果。
- missingCriticalCosts。
- capacityRisk 和 shipping/lead-time 相关信息。
- 可供评分阶段使用的归一化净利润指标。
