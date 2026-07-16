# 11 · 每日报告、工件存储与历史查询提示词

> 先读取：`00-shared-context.md`，以及阶段 02、03、10 的交接。  
> 前置条件：run、来源健康、候选分池、稳定排名、利润、风险和评分明细均可查询。  
> 本阶段目标：为每次运行生成可校验的 Markdown/JSON 工件、观察池、淘汰池、风险、来源健康和运行日志，并提供历史只读 API。

## 你的任务

实现 `REPORT` 阶段。每个业务日按 run 生成：

```text
reports/<business-date>/<run-id>/
├── daily-top10.md
├── daily-top10.json
├── watchlist.json
├── rejected.json
├── risk-report.json
├── source-health.json
└── run-log.json
```

目录只是逻辑结构。真实存储应复用当前平台文件/对象存储能力，不能假定生产服务器本地磁盘持久可靠。

## 必读位置

```text
后端/src/features/files/**
后端/src/features/product-research/daily/**
后端/src/features/product-research/**
后端/src/features/notifications/**
后端/src/shared/audit/**
后端/src/shared/observability/**
后端/prisma/schema.prisma
后端/test/files*
后端/test/product-research*
智能体前端/src/api/productResearch.ts
```

## 一、报告工件原则

- JSON 是机器事实契约，Markdown 是其可读投影。
- Markdown 不能包含 JSON 中不存在的虚构数字或结论。
- 两者使用同一个不可变 report snapshot 生成。
- 所有工件包含 `schemaVersion`, `researchRunId`, `businessDate`, `timezone`, `generatedAt`, `scoringVersionId`。
- 所有金额包含币种，所有百分比明确分母/情景。
- 所有证据通过稳定 `evidenceRefs` 或受控链接呈现。
- `null`/`needs_verification` 不能被渲染为 0。
- 报告即使部分数据源失败也要生成，并明确 `partialData`。
- 不足 10 个不补齐；没有立即打样产品时输出空数组和明确说明。

## 二、daily-top10.json 契约

建议顶层：

```ts
{
  schemaVersion: 'daily-product-research-report/v1';
  run: {
    id: string;
    businessDate: string;
    timezone: string;
    status: string;
    partialData: boolean;
    startedAt: string | null;
    finishedAt: string | null;
    scoringVersionId: string;
    configVersion: string;
  };
  summary: {
    collected: number;
    normalized: number;
    eligible: number;
    testNow: number;
    watch: number;
    hold: number;
    rejected: number;
    sourceHealthy: number;
    sourceFailed: number;
  };
  top: DailyProductRecommendation[];
  notices: ReportNotice[];
}
```

每个推荐项至少包含：

```ts
{
  rank: number;
  candidateId: string;
  fingerprint: string;
  productName: string;
  targetPlatforms: string[];
  targetCountries: string[];
  targetCustomer: string | null;
  giftScenarios: string[];
  coreKeywords: string[];
  longTailKeywords: string[];
  negativeKeywords: string[];
  demandSources: Array<{
    source: string;
    intentLevel: string;
    observedAt: string;
    evidenceRefs: string[];
  }>;
  signalStrength: string;
  trend30d: string | null;
  trend90d: string | null;
  competition: {
    intensity: number | null;
    marketGap: number | null;
    entryOpportunity: number | null;
    coverage: string;
  };
  marketGaps: Array<{
    statement: string;
    confidence: number;
    evidenceRefs: string[];
  }>;
  medianPrice: {
    amount: string | null;
    currency: string | null;
    evidenceRefs: string[];
  };
  profit: {
    scenario: 'BASE';
    estimatedTotalCost: string | null;
    estimatedNetProfitAfterAds: string | null;
    netMarginAfterAds: string | null;
    currency: string | null;
    missingCriticalCosts: string[];
  };
  customizationOptions: string[];
  imageDirection: string | null;
  differentiationIdeas: string[];
  productionDifficulty: string | null;
  capacityRisk: string | null;
  shippingRisk: string | null;
  ipRisk: string;
  complianceRisk: string;
  confidenceScore: number;
  componentScores: Array<{
    key: string;
    score: number | null;
    weightedPoints: number;
  }>;
  finalScore: number;
  decision: 'TEST_NOW';
  decisionReasons: string[];
  firstActionToday: string;
  evidenceRefs: string[];
  needsVerification: string[];
}
```

字段命名可以按阶段 02 最终契约调整，但不得遗漏业务语义。

## 三、其它 JSON 工件

### watchlist.json

包含最终 `WATCH` 候选：

```text
candidateId
productName
score
confidence
watchReasons
missingEvidence
nextCheckAt/trigger
manualReviewTaskId?
changesNeededForTestNow
```

### rejected.json

包括 `HOLD` 和 `REJECT`，但字段明确区分：

```text
decision
hardGateReasons
scoreReasons
riskReasons
profitReasons
repeatSuppression
canBeReconsidered
reconsiderationConditions
```

### risk-report.json

按风险类型和 severity 聚合，同时列出每条候选记录。不得暴露敏感买家素材或完整私有文本。

### source-health.json

按来源输出：

```text
status
attempts
lastSuccessAt
itemCount
latencyMs
dataFreshnessSeconds
errorCode/safeMessage
budgetUsed
```

### run-log.json

这不是原始应用日志导出。它是安全的运行事件摘要：

```text
run/stage 状态转换
耗时
输入/输出计数
重试次数
错误码和安全消息
配置/规则/Prompt 版本
告警和 partialData 原因
```

不得包含密钥、Cookie、完整 HTTP payload、堆栈中的敏感路径或买家 PII。

## 四、Markdown 报告结构

`daily-top10.md` 必须包含：

```markdown
# 每日精准选品报告

## 运行摘要
- 业务日期、时区、运行状态、是否部分数据
- 候选数量与分池数量
- 评分版本和数据源健康摘要

## 今日值得行动的产品
### 1. <产品名>
- 推荐平台与国家
- 目标客户与礼物场景
- 真实需求证据
- 核心与长尾关键词
- 趋势和竞争结构
- 市场缺口与改款建议
- 售价、完整成本、广告后净利润、净利率
- 定制、生产与产能
- 图片和视频方向
- 侵权、合规、物流和季节风险
- 置信度、总分、评分版本
- 今天可以执行的第一步
- 待验证项

## 观察池摘要
## 淘汰与暂缓摘要
## 数据源健康与异常
## 方法、版本和免责声明
```

### 真实需求证据

不要只写“需求高”。至少展示：

- 来源。
- 指标类型。
- 观察时间。
- 信号级别。
- 证据引用。
- 数据限制。

### 利润

明确：

```text
售价
广告前毛利率
广告后净利润
广告后净利率
币种
使用情景
关键假设
缺失成本
```

不要只显示一个“利润率”。

### 风险

- `LOW` 不等于“保证无风险”。
- `MEDIUM` 显示人工审核状态。
- `HIGH/BLOCKED` 不应出现在 TOP，但在淘汰摘要中显示原因。
- 规则/数据过期必须明确标注。

### 第一步行动

`firstActionToday` 必须与决策和缺口一致，例如：

```text
向现有供应商获取 3 种尺寸的实际报价与交期
制作 2 个照片转线稿样品并记录设计/加工分钟数
提交商标/角色人工审核
验证美国市场国际物流与包装成本
```

不能输出“立即正式上架”“直接开广告”等绕过人工审核的动作。

## 五、零 TOP 结果

当 `top.length === 0`：

```markdown
## 今日结论

今日暂无达到“立即打样”标准的新产品。

主要原因：
- ...

继续观察方向：
- ...
```

规则：

- 不将 WATCH/HOLD 提升为 TOP。
- 摘要可展示最接近门槛的观察方向，但明确它们未通过。
- JSON 中 `top` 为空数组。
- 通知不应写成“选品失败”，而是“本日无符合门槛的新产品”，除非 run 真正 FAILED。

## 六、报告快照组装

实现单一 `ReportSnapshotAssembler`：

1. 在事务一致性或明确读取版本下加载 run 及关联结果。
2. 验证每个 TOP 候选存在最终 score、profit、risk 和 demand。
3. 检查 TOP fingerprint 唯一和 rank 连续。
4. 检查 top.length <= config.topLimit。
5. 将所有金额、时间、null、evidenceRefs 转为 report schema。
6. 生成不可变 snapshot 和 `snapshotHash`。
7. JSON/Markdown 渲染器只消费该 snapshot。

如果数据不一致：

- 不猜测或临时补全。
- 标记报告生成失败或 partial，并记录 `REPORT_CONTRACT_INVALID`。
- 尽可能生成异常报告。

## 七、工件存储

复用现有文件/对象存储服务：

```text
storageKey = organizations/<orgId>/workspaces/<scope>/product-research/<businessDate>/<runId>/<artifact>
```

实际 key 按现有规范调整。要求：

- 不能由用户直接拼接路径。
- 同 run + artifactType 使用确定性 key。
- 上传使用幂等写入或内容 hash。
- 数据库保存 contentHash、byteSize、schemaVersion 和 storageKey。
- 重试时相同 snapshotHash 不重复生成/上传。
- 新 snapshot 生成新版本或清晰替换策略，旧 artifact 保留审计。
- 私有报告通过鉴权下载或短时签名 URL，不公开 bucket。
- 删除策略遵循现有保留期和组织数据删除规则。

## 八、历史查询 API

建议实现：

```text
GET /daily-product-research/runs
GET /daily-product-research/runs/:id
GET /daily-product-research/runs/:id/report
GET /daily-product-research/runs/:id/artifacts
GET /daily-product-research/runs/:id/candidates
GET /daily-product-research/history/summary
```

查询要求：

- 组织/工作区隔离。
- 分页、稳定排序和最大 limit。
- 支持 businessDate、status、decision、source、risk、platform 过滤。
- 默认不返回巨大 rawData 或完整报告正文。
- artifact 下载使用现有文件权限。
- 历史 summary 只使用已发布的结构化事实，不从 Markdown 反向解析。

## 九、通知

报告成功后通过现有通知/Outbox：

```text
标题：今日精准选品报告已生成
摘要：7 个立即打样，12 个观察，3 个来源降级
动作：查看今日选品
```

零 TOP：

```text
标题：今日暂无符合立即打样门槛的新产品
摘要：已生成观察池与来源健康报告
```

部分数据：显示“部分来源不可用”，不能假装完整。

## 十、Markdown 安全

- 对外部标题、评论摘要和用户文本做 Markdown 转义。
- 禁止嵌入任意 HTML/script。
- 外部 URL 只通过已验证 evidence link 生成。
- 不把 `javascript:`、data URL 或内网地址写入报告。
- 避免表格被 `|` 等字符破坏。
- 对 CSV 公式注入虽然主要属于导出，但任何可下载表格也需防护。
- 不在报告中放 API Key、内部堆栈、对象存储私有 key 或完整 PII。

## 十一、测试驱动要求

### 契约和内容

```text
[ ] JSON 通过 report schema
[ ] Markdown 与同一 snapshot 生成
[ ] TOP 字段齐全且金额带币种
[ ] null 显示为待验证，不显示 0
[ ] 每个产品有需求证据、利润、风险、评分和第一步
[ ] HIGH/BLOCKED 不出现在 TOP
[ ] 同 fingerprint 不重复
[ ] top.length 不超过 topLimit
[ ] 不足 10 不补齐
[ ] 0 TOP 生成正确空数组和说明
[ ] partialData 明确列出失败来源
[ ] Markdown 转义防止脚本/链接注入
```

### 存储和幂等

```text
[ ] 相同 snapshotHash 重试不重复上传
[ ] contentHash/byteSize 正确
[ ] 私有 artifact 需要鉴权
[ ] 跨租户无法查询/下载
[ ] 用户无法通过路径遍历写入任意 key
[ ] 存储失败时 run/report 状态和告警正确
[ ] JSON 成功而 MD 失败时状态可解释并可重试
```

### 历史 API

```text
[ ] 分页和过滤稳定
[ ] 不默认返回 rawData
[ ] 历史 summary 不解析 Markdown
[ ] 工作区过滤受租户断言保护
[ ] 旧 ProductResearchReport API 仍可用
```

建议测试：

```text
后端/test/product-research-report-schema.spec.ts
后端/test/product-research-report-renderer.spec.ts
后端/test/product-research-report-storage.spec.ts
后端/test/product-research-report-security.spec.ts
后端/test/product-research-history-api.spec.ts
```

## 本阶段允许修改

```text
后端/src/features/product-research/daily/reports/**
后端/src/features/product-research/daily/services/report/**
后端/src/features/product-research/daily/contracts/**
后端/src/features/product-research/daily/*controller*.ts
后端/src/features/product-research/daily/*repository*.ts
后端/src/features/files/**                          # 仅工件存储/下载接入所需
后端/src/features/notifications/**                  # 仅报告通知
后端/src/shared/audit/**
后端/prisma/schema.prisma                           # 仅 Artifact 模型补充
后端/prisma/migrations/<new-migration>/**
后端/test/product-research-report*.spec.ts
后端/test/product-research-history*.spec.ts
```

## 禁止事项

- 不要把报告只写到生产容器本地磁盘。
- 不要从 Markdown 反向读取业务事实。
- 不要让 Markdown 生成器补造 JSON 缺失字段。
- 不要为了凑 10 个把观察池放入 TOP。
- 不要把 null 渲染为 0。
- 不要公开对象存储 bucket 或绕过文件权限。
- 不要在 run-log.json 导出原始敏感日志。
- 不要建议跳过人工审核直接上架/开广告。

## 出口闸门

```text
[ ] 七种报告工件均有版本化 schema/渲染器
[ ] JSON 与 Markdown 来源于同一不可变 snapshot
[ ] TOP 字段、证据、利润、风险、评分和行动完整
[ ] 不足 10 和 0 TOP 行为正确
[ ] partialData 和来源健康透明
[ ] 工件使用现有安全存储并有 hash/元数据
[ ] 重试幂等、跨租户下载受阻
[ ] 历史 API 分页、过滤和权限正确
[ ] 通知区分成功、零 TOP、部分数据和真正失败
[ ] Prisma validate、目标测试、lint、后端 build 通过
```

最后输出 `PHASE HANDOFF`。`next_phase_inputs` 必须包含：

- 前端可消费的 report/run/candidate API 契约。
- artifact 下载/查看方式。
- 列表过滤和分页参数。
- 审核按钮可用动作和 blockedActions。
- 零 TOP、partialData、失败三种 UI 状态。
