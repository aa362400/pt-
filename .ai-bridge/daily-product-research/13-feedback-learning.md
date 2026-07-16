# 13 · 经营反馈回传、周度评估与受控学习提示词

> 先读取：`00-shared-context.md`，阶段 02、10-12 的交接，以及现有订单、广告、分析、产品、Listing、利润和 Agent Memory 模型。  
> 前置条件：候选拥有稳定 candidateId，推荐、打样、草稿、上架和订单实体之间存在可追踪关联。  
> 本阶段目标：将真实经营结果回写到推荐历史，评估评分模型是否有效，并生成需要人工批准的新权重建议。系统不得无日志、自主覆盖线上评分版本。

## 你的任务

实现从候选到经营结果的事实链：

```text
候选产品
→ 是否进入 TOP/WATCH/HOLD/REJECT
→ 是否提交审核
→ 是否打样
→ 是否创建产品/Listing 草稿
→ 是否正式上架（人工批准后的外部结果）
→ 曝光
→ 点击
→ 收藏
→ 加购
→ 订单
→ 广告花费
→ 退款/售后
→ 实际收入和完整成本
→ 实际净利润
→ 预测与实际偏差
```

再实现每周评估：

```text
评分组件预测效果
平台/国家/类目表现
定制方式和生产效率
退款/风险/履约偏差
来源质量
候选转化漏斗
评分版本对比
新评分版本建议
```

## 必读位置

```text
后端/src/features/analytics/**
后端/src/features/orders/** 或 MarketplaceOrder 相关服务
后端/src/features/channels/**
后端/src/features/products/**
后端/src/features/listings/**
后端/src/features/product-launch/**
后端/src/features/profit-calculator/**
后端/src/features/supply-chain/**
后端/src/features/agent-memory/**
后端/src/features/automation/**
后端/src/features/product-research/daily/**
后端/src/features/review/**
后端/src/shared/audit/**
后端/prisma/schema.prisma
后端/test/analytics*
后端/test/order*
```

## 一、关联链设计

### 稳定关联

推荐链上的每个内部资源都应保留 `candidateId` 或可追溯关联：

```text
ProductCandidate
ProductResearchCandidateDecision
ReviewTask
ProductLaunch
Product
ListingDraft
MarketplaceListing
MarketplaceOrder/OrderItem
ProfitCalculation/ActualProfitSnapshot
ProductFeedback
```

不要用产品标题模糊匹配作为主要关联方式。标题匹配只允许用于历史回填建议，且需人工确认或高置信度规则。

### 事件事实

使用阶段 02 的 `ProductFeedback` 或等价不可变事件模型：

```text
SAMPLE_REQUESTED
SAMPLE_COMPLETED
SAMPLE_REJECTED
DEVELOPMENT_TASK_CREATED
LISTING_DRAFT_CREATED
LISTING_APPROVED
LISTING_PUBLISHED
IMPRESSION
CLICK
FAVORITE
ADD_TO_CART
ORDER_CREATED
ORDER_CANCELLED
ORDER_REFUNDED
AD_SPEND
REVENUE
COST_ADJUSTMENT
ACTUAL_PROFIT
RISK_REVIEW_CONFIRMED
RISK_REVIEW_DISMISSED
```

每条事件包含：

```text
organizationId
workspaceId
candidateId
product/listing/order refs
eventType
eventAt
value/currency?
source
sourceExternalId?
quality
metadata
createdAt
```

同一外部事实用 `source + sourceExternalId + eventType` 或等价唯一键幂等去重。

## 二、数据覆盖与同步状态

每次分析实际表现前，先检查：

```text
workspace/channel 同步状态
数据覆盖起止日期
最后成功同步时间
订单/广告/退款是否完整
币种和时区
pending 与 posted/confirmed 状态
```

报告必须区分：

```text
COMPLETE：请求窗口在完整覆盖内
PARTIAL：仅部分渠道/日期已同步
SYNCING：仍在同步
FAILED：相关来源失败
NOT_AVAILABLE：平台未提供此指标
```

不得把部分覆盖的本周数据说成完整周结果。首次显示总数时就写清楚“截至某时、基于已同步渠道”。

## 三、经营指标定义

所有指标必须有明确分母、时间窗和归因规则。

### 漏斗

```text
推荐到打样率 = 完成打样候选 / 有资格进入打样的候选
打样到上架率 = 正式上架候选 / 完成打样候选
曝光到点击率 = clicks / impressions
点击到收藏率 = favorites / clicks
点击到加购率 = carts / clicks
点击到订单率 = orders / clicks
上架到首单天数
退款率 = refundedOrders / eligibleOrders
```

分母为零时输出 null 和原因，不输出 0%。

### 利润

实际净利润应尽量使用：

```text
订单收入
- 实际产品/加工成本
- 包装
- 国内/国际物流
- 平台/支付/提现费用
- 广告
- 退款/售后
- 税费
- 设备/人工分配
```

若实际细分成本不可得：

- 显示已知利润和缺失成本。
- 不用预测成本冒充实际成本。
- 可以同时显示 `actualKnownProfit` 与 `estimatedFullyLoadedProfit`，命名清楚。

### 生产效率

```text
实际设计分钟
实际加工分钟
实际沟通分钟
失败/报废
返工
每日产量
准时交付率
```

第一版可通过人工录入或任务计时导入，但要标记 MANUAL，不伪装自动采集。

## 四、归因窗口

候选推荐后可能数周才上架和出单。定义版本化窗口：

```text
sampleWindowDays
listingWindowDays
performanceWindowDays
refundMaturityDays
```

例如：

```text
推荐后 14 天内打样
推荐后 45 天内上架
上架后 30/60/90 天表现
订单后等待退款成熟期再计算最终退款率
```

不能用尚未成熟的新商品与完整 90 天商品直接比较。输出 cohort age 和成熟度。

## 五、周度评估任务

复用现有 AutomationFlow/队列，新增低频评估：

```text
每周一北京时间 09:00
→ 锁定上一完整业务周
→ 检查数据覆盖
→ 生成 cohort 和指标
→ 评估评分组件
→ 生成改进建议
→ 创建 DRAFT ScoringVersion 建议或建议报告
→ 通知管理员审核
```

周度任务与每日选品使用不同幂等键和队列任务类型。禁止阻塞每日选品运行。

## 六、预测准确性

### 基本目标

评估：

```text
高分候选是否更容易被批准/打样/上架
高需求分是否带来更高 CTR/CVR/订单
高利润分是否带来更高实际净利润
高竞争缺口分是否改善进入表现
高定制分是否提高转化，还是增加沟通/退款
高生产物流分是否降低延迟和报废
风险分是否预测人工驳回/平台问题
```

### 方法

第一版优先使用透明统计，不需要立刻引入复杂 ML：

```text
分数分桶表现
Spearman/Pearson（按数据适用性）
命中率/精确率/召回率（对离散目标）
预测净利润与实际净利润 MAE/MAPE（注意零值）
校准曲线
评分版本 cohort 对比
```

样本量不足时不输出强结论。至少显示：

```text
sampleSize
matureSampleSize
coverage
confidence/uncertainty
```

避免幸存者偏差：未被人工批准或未打样的候选没有经营结果，不能简单当作零表现。分别分析：

```text
模型推荐
人工选择
执行能力
市场结果
```

## 七、反馈学习边界

### 自动允许

```text
更新经营事实
计算统计指标
生成评估报告
生成 DRAFT 权重/阈值建议
生成理由和模拟结果
提醒管理员审核
```

### 自动禁止

```text
直接修改 ACTIVE ScoringVersion
无日志覆盖旧权重
自动放宽侵权/合规硬门槛
因短期样本自动删除某来源
根据单周噪声大幅调整权重
自动执行正式上架、改价或广告
```

### 建议版本生成

若样本量和覆盖达到配置门槛，可生成：

```ts
{
  basedOnVersionId: string;
  proposedWeights: {...};
  proposedThresholds: {...};
  reasonCodes: string[];
  evidenceWindow: {...};
  sampleSize: number;
  expectedChanges: {...};
  simulationRunIds: string[];
  status: 'DRAFT';
}
```

权重变化限制：

- 单次每项最大变化可配置，例如 ±3 或 ±5。
- 总和必须 100。
- 风险硬门槛不可通过权重建议改变。
- 数据不足时只生成观察建议，不生成权重版本。
- 管理员必须查看 simulate 结果、输入理由并激活。

## 八、数据泄漏和时间穿越

评分评估必须使用“推荐当时可获得的数据”，不能把未来订单/退款回填到当时特征后再宣称模型准确。

保留：

```text
featureSnapshotAtRecommendation
scoringVersion
source snapshots
profit assumptions
risk rules
```

训练/评估切分按时间，不能随机把同一产品跨日记录放到训练和验证两边造成泄漏。相同 fingerprint 的多次运行需按组处理。

## 九、人工反馈

后台允许记录：

```text
为什么打样/不打样
供应商不可行
设计不适合当前设备
风险误报/漏报
市场判断错误
成本估算偏差
执行资源不足
季节窗口错过
```

反馈必须：

- 绑定 candidateId/run/scoringVersion。
- 原因使用枚举 + 可选备注。
- 备注作为不可信文本处理。
- 记录操作者和时间。
- 可更正但保留历史审计。
- 不直接写入系统 prompt 或权重。

可将经过治理的摘要写入现有 AgentMemory，但原始经营事实仍以结构化表为权威。

## 十、历史页面扩展

完善阶段 12 页面：

```text
推荐漏斗
按评分分桶的上架/订单/利润
预测 vs 实际净利润
退款和履约偏差
平台/国家/类目对比
定制方式效率
评分版本对比
来源贡献和健康
建议版本审批入口
```

每张图显示：

```text
时间范围
数据覆盖
样本量
成熟样本量
币种/换算方式
是否包含估算
```

样本不足时显示解释，不画误导性趋势线。

## 十一、API

建议：

```text
POST /daily-product-research/candidates/:id/feedback
GET  /daily-product-research/candidates/:id/performance
GET  /daily-product-research/feedback/summary
GET  /daily-product-research/feedback/cohorts
GET  /daily-product-research/evaluations
GET  /daily-product-research/evaluations/:id
POST /daily-product-research/evaluations/:id/create-scoring-draft
```

管理写接口需要权限、审计、速率限制。查询分页、租户隔离并限制时间范围。

## 十二、幂等和回填

- 外部事件用稳定 external ID 幂等。
- 聚合结果可以重算，不覆盖原始事件。
- 周度评估按组织/工作区/周/规则版本唯一。
- 修复同步后允许重算评估，生成新 revision 并说明差异。
- 历史回填脚本默认 dry-run、分页和限速。
- 模糊关联的历史候选输出候选映射报告，不自动强连。

## 十三、测试驱动要求

### 关联和事件

```text
[ ] candidate 到 product/listing/order 关联稳定
[ ] 重复外部事件被幂等去重
[ ] 标题相似不自动错误关联
[ ] 跨租户事件不可见
[ ] 人工反馈保留操作者和审计
```

### 指标

```text
[ ] 分母为零返回 null
[ ] 部分覆盖显示 PARTIAL
[ ] 未成熟退款窗口不当最终退款率
[ ] actualKnownProfit 与 estimatedFullyLoadedProfit 分离
[ ] 多币种使用冻结 FX 或分开展示
[ ] 漏斗公式和时间窗正确
[ ] 未被批准候选不简单当零销售
```

### 评估和学习

```text
[ ] 周任务幂等且不阻塞每日任务
[ ] 评估只用推荐时特征快照
[ ] 相同 fingerprint 分组避免数据泄漏
[ ] 样本不足不生成权重版本
[ ] 建议权重总和 100 且单项变化受限
[ ] 自动流程只能创建 DRAFT
[ ] 风险硬门槛无法被学习建议修改
[ ] 激活仍需管理员和阶段 10 审计流程
[ ] 重算产生 revision，不覆盖旧评估
```

建议测试：

```text
后端/test/product-research-feedback-events.spec.ts
后端/test/product-research-performance-metrics.spec.ts
后端/test/product-research-weekly-evaluation.spec.ts
后端/test/product-research-scoring-recommendation.spec.ts
后端/test/product-research-feedback-tenancy.spec.ts
```

前端补充：

```text
智能体前端/src/features/daily-product-research/**/__tests__/*performance*
```

## 本阶段允许修改

```text
后端/src/features/product-research/daily/services/feedback/**
后端/src/features/product-research/daily/services/evaluation/**
后端/src/features/product-research/daily/contracts/**
后端/src/features/product-research/daily/*controller*.ts
后端/src/features/product-research/daily/*repository*.ts
后端/src/features/automation/**                     # 周度 flow 接入小改
后端/src/workers/**                                 # 周度评估 job 小改或专用 worker
后端/src/features/analytics/**                      # 仅复用指标所需
后端/src/features/agent-memory/**                   # 仅治理后摘要接入
后端/prisma/schema.prisma
后端/prisma/migrations/<new-migration>/**
后端/test/product-research-feedback*.spec.ts
后端/test/product-research-weekly*.spec.ts
智能体前端/src/features/daily-product-research/**
智能体前端/src/pages/ProductResearchHistory.tsx
```

## 禁止事项

- 不要让系统自动覆盖 ACTIVE 权重。
- 不要修改或放宽 HIGH/BLOCKED 风险门槛。
- 不要把预测成本称为实际成本。
- 不要把同步不完整的周期说成完整结果。
- 不要用未来数据污染推荐时特征。
- 不要把未打样/未上架候选简单记作零销量。
- 不要仅靠标题模糊匹配订单和候选。
- 不要因单周小样本大幅调整模型。
- 不要把原始自由文本直接塞入长期记忆或系统 prompt。

## 出口闸门

```text
[ ] candidate 到打样、上架、订单、退款和实际利润链路可追踪
[ ] 原始反馈事件幂等、不可变且租户隔离
[ ] 数据覆盖、成熟度、币种和估算状态透明
[ ] 漏斗、利润和生产效率公式有自动化测试
[ ] 周度评估按时间快照，无数据泄漏
[ ] 样本量不足时不做强结论或权重建议
[ ] 自动学习只创建 DRAFT，管理员激活和回滚不变
[ ] 风险硬门槛不受自动学习影响
[ ] 历史页面只展示真实回传数据
[ ] Prisma validate、目标测试、前后端 lint/build 通过
```

最后输出 `PHASE HANDOFF`。`next_phase_inputs` 必须包含：

- 反馈事件和关联链 schema。
- 周度评估任务、幂等键和覆盖语义。
- 当前可用/不可用的经营数据字段。
- 评分建议版本生成限制。
- 安全、监控和发布阶段需验证的高成本任务预算。
