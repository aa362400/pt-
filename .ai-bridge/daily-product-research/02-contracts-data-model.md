# 02 · 版本化契约与数据模型提示词

> 先读取：`00-shared-context.md`、`01-baseline-audit.md` 以及阶段 01 的真实审计结果。  
> 前置条件：阶段 01 已通过出口闸门。  
> 本阶段目标：先建立稳定、可迁移、可审计的数据地基，再让采集、Agent、评分和页面接入。

## 你的任务

在当前 NestJS + Prisma + PostgreSQL 多租户体系中，实现每日精准选品的版本化领域契约和持久化模型。保持现有手动 Ozon 研究、旧报告 JSON、候选审批和前端 API 兼容，不进行破坏性重命名或删除。

本阶段只实现：

```text
领域类型和枚举
→ 数据库模型与关系
→ Prisma 迁移和回滚说明
→ RLS/租户隔离
→ DTO/响应契约
→ 最小 CRUD/Repository 边界
→ 契约和迁移测试
```

不要在本阶段实现真实平台采集、评分算法、完整页面或自动调度。

## 必读位置

```text
后端/prisma/schema.prisma
后端/prisma/migrations/**
后端/src/features/product-research/**
后端/src/features/automation/**
后端/src/features/trends/**
后端/src/features/keywords/**
后端/src/features/profit-calculator/**
后端/src/features/supply-chain/**
后端/src/features/files/**
后端/src/shared/database/**
后端/src/shared/tenancy/**
后端/src/shared/audit/**
后端/test/*tenant*
后端/test/*rls*
后端/test/product-research*
智能体前端/src/api/productResearch.ts
```

## 设计原则

1. **现有模型优先**：先复用、再扩展、最后才新建。
2. **结构化核心字段**：用于筛选、排序、关联和审计的字段不能只藏在 JSON。
3. **JSON 有边界**：原始第三方快照、可变平台字段和报告渲染数据可放 JSON，但要有 schemaVersion。
4. **未知不等于零**：所有可能缺失的指标使用 nullable 字段或明确的 completeness 状态。
5. **稳定 ID**：候选必须拥有独立 ID，不能长期依赖 `reportId + candidateIndex`。
6. **多租户默认安全**：新模型必须含 `organizationId`；涉及店铺的必须含或可追溯 `workspaceId`。
7. **数据库是最终幂等防线**：关键唯一约束必须在数据库层表达。
8. **兼容旧数据**：旧报告、旧候选和旧前端继续可读。

## 建议领域模型

阶段 01 若给出更优且有证据的模型，可调整名称，但必须覆盖以下语义。

### 1. ProductResearchRun

表示一个组织/工作区在一个业务日的一次每日选品批次。

建议字段：

```text
id
organizationId
workspaceId?
automationRunId?
parentRunId?              # 手动重跑或补跑来源
businessDate              # Asia/Shanghai 的业务日期，不是服务器日期
scheduleTimezone
trigger                    # SCHEDULE | MANUAL | RETRY | BACKFILL
attempt
status                     # PENDING | RUNNING | PARTIAL | COMPLETED | FAILED | CANCELLED
currentStage?
configSnapshot             # 本次运行锁定的阈值/来源/预算
configVersion
scoringVersionId?
candidateLimit
topLimit
startedAt?
finishedAt?
errorSummary?
createdBy
createdAt
updatedAt
```

最终幂等约束至少表达：

```text
organizationId + workspace scope + businessDate + configVersion + attempt
```

Prisma 对 nullable unique 的语义需谨慎。若 `workspaceId` 可空，设计规范化 scope key，例如 `workspaceScopeKey = workspaceId ?? "ORG"`，或用 PostgreSQL 表达式/部分唯一索引迁移。不能依赖应用层先查后插。

### 2. ProductResearchStageRun

表示批次内阶段状态，支持恢复、重试和可观测性。

```text
id
organizationId
researchRunId
stage                      # COLLECT ... REPORT
status                     # PENDING | RUNNING | COMPLETED | PARTIAL | FAILED | SKIPPED
attempt
inputSnapshot?
outputSummary?
startedAt?
finishedAt?
errorCode?
errorMessage?
metrics?
createdAt
updatedAt
```

唯一约束应阻止同一 run/stage/attempt 重复记录。

### 3. ProductCandidate

表示规范化后的候选产品。

```text
id
organizationId
workspaceId?
researchRunId
legacyReportId?            # 兼容现有 ProductResearchReport
fingerprint
canonicalName
productType
material?
primaryUse?
customizationMethod?
targetAudience?
market?
sourceCount
signalStrength             # STRONG | MEDIUM | WEAK | INVALID
confidenceScore?
dataCompleteness
status                     # DISCOVERED | ELIGIBLE | SCORED | RECOMMENDED | WATCH | HOLD | REJECTED
firstSeenAt
lastSeenAt
rawSummary?
createdAt
updatedAt
```

唯一约束至少包括 `researchRunId + fingerprint`。跨运行历史不能简单 unique，否则会丢失每日快照；可另有稳定 fingerprint 索引用于 30 天重复检查。

### 4. ProductSignal

每条信号必须保留来源和时间，不能只存聚合分数。

```text
id
organizationId
workspaceId?
researchRunId
candidateId
source
provider
externalId?
url?
market?
metricName
metricValue?               # Decimal 或 Float，按指标含义选择
unit?
observedAt
fetchedAt
quality                     # VERIFIED | ESTIMATED | MANUAL | UNKNOWN
rawSnapshotRef?
rawData?
sourceHash?
createdAt
```

设计能够区分：搜索、成交、评论、价格、增长、加购、广告、内容播放等不同 metricName。为常用查询增加组合索引，但不要为所有 JSON 字段造索引。

### 5. ProductRiskRecord

```text
id
organizationId
workspaceId?
researchRunId
candidateId
riskType
severity                    # LOW | MEDIUM | HIGH | BLOCKED
ruleVersion
matchedTerm?
evidence?
source?
reviewStatus                # AUTO | NEEDS_REVIEW | CONFIRMED | DISMISSED
reviewTaskId?
createdAt
updatedAt
```

### 6. ProductScore

```text
id
organizationId
workspaceId?
researchRunId
candidateId
scoringVersionId
componentScores             # 结构化或 JSON，但必须 schemaVersion
rawTotal
finalScore
hardGateStatus
hardGateReasons
confidenceScore
missingDataPenalties
rank?
decision                    # TEST_NOW | WATCH | HOLD | REJECT
explanation?
createdAt
```

唯一约束：`candidateId + scoringVersionId`，或包含 attempt 以支持显式重算。必须定义重算语义，不能悄悄覆盖历史分数。

### 7. ScoringVersion

```text
id
organizationId
workspaceId?
version
status                      # DRAFT | ACTIVE | RETIRED
weights
thresholds
reason
basedOnVersionId?
createdBy
activatedBy?
activatedAt?
retiredAt?
createdAt
updatedAt
```

每个组织/工作区作用域只能有一个 ACTIVE 版本。用事务和数据库约束/锁保证切换原子性。回滚应创建或重新激活可审计版本，不能覆盖旧记录。

### 8. SourceHealth

按 run 和来源记录，不仅保存一个全局“最后成功”。

```text
id
organizationId
workspaceId?
researchRunId?
source
status                      # HEALTHY | DEGRADED | FAILED | DISABLED
attempts
requestedAt?
finishedAt?
lastSuccessAt?
itemCount
latencyMs?
dataFreshnessSeconds?
httpStatus?
errorCode?
errorMessage?
budgetUsed?
metadata?
createdAt
updatedAt
```

### 9. ProductFeedback

```text
id
organizationId
workspaceId
candidateId
productId?
listingDraftId?
productLaunchId?
eventType                   # SAMPLED | LISTED | IMPRESSION | CLICK | FAVORITE | CART | ORDER | REFUND ...
eventAt
value?
currency?
source
externalReference?
metadata?
createdAt
```

原始事件可以保留，后续周度聚合不要覆盖原始事实。

### 10. ResearchReportArtifact

```text
id
organizationId
workspaceId?
researchRunId
artifactType                # TOP_MD | TOP_JSON | WATCHLIST_JSON | REJECTED_JSON | RISK_JSON | SOURCE_HEALTH_JSON | RUN_LOG_JSON
schemaVersion
storageKey
contentHash
byteSize
createdAt
```

复用现有文件/对象存储服务。不要将大量报告正文直接塞入数据库，除非阶段 01 证明当前平台就是这样设计。

## 现有模型兼容要求

### ProductResearchReport

- 保持现有字段和旧路由可用。
- 新每日批次可生成一条兼容报告，或通过关联字段链接到 `ProductResearchRun`。
- 旧 `opportunities.competitors` 仍可读取。
- 新结构化候选不得再以字符串数组作为唯一事实来源。
- 如需新增 `researchRunId`，必须 nullable，先兼容旧记录。

### ProductResearchCandidateDecision

- 保持旧 `reportId + candidateIndex` 入口。
- 新候选审批优先使用 `candidateId`。
- 设计兼容桥接：旧候选第一次访问/迁移时映射到稳定 candidateId，或提供版本化 DTO。
- 不要让同一候选同时产生互相冲突的旧决策和新决策。

### AutomationRun

- 不复制自动化控制面。
- `ProductResearchRun` 应引用触发它的 AutomationRun，或由 AutomationRun 的步骤结果返回 researchRunId。
- 运行状态同步要有明确单向所有权，避免两个表互相覆盖。

### ProfitCalculation / TrendInsight / KeywordReport

- 保留现有通用功能。
- 选品运行可通过关联 ID、快照引用或新关联表复用这些结果。
- 不在本阶段把所有功能模型大改成选品专用模型。

## 契约设计

在 `后端/src/features/product-research/daily/contracts/` 建议建立：

```text
daily-product-research.contract.ts
product-candidate.contract.ts
product-signal.contract.ts
product-score.contract.ts
product-risk.contract.ts
source-health.contract.ts
report-artifact.contract.ts
```

要求：

- 契约包含 `schemaVersion`，建议从 `daily-product-research/v1` 开始。
- 领域内部使用 TypeScript 类型和运行时验证，优先复用项目已有 Zod 4。
- HTTP 输入继续使用 class-validator DTO，以符合现有 NestJS 风格。
- HTTP 响应、队列 payload、Agent 输出和报告 JSON 使用同一核心 schema 或明确转换层。
- 对所有枚举定义唯一来源，避免前后端复制后漂移。
- 金额用十进制字符串或 Prisma Decimal 安全序列化，不允许浮点悄悄舍入。
- 日期使用 ISO 8601；业务日使用 `YYYY-MM-DD` 并显式关联 timezone。
- nullable 与 optional 的语义必须清楚：未提供与已知为空不能混为一谈。

### 建议核心响应

```json
{
  "schemaVersion": "daily-product-research/v1",
  "run": {
    "id": "...",
    "businessDate": "2026-07-13",
    "timezone": "Asia/Shanghai",
    "status": "COMPLETED",
    "partialData": false
  },
  "summary": {
    "collected": 300,
    "eligible": 42,
    "testNow": 7,
    "watch": 18,
    "hold": 9,
    "rejected": 8
  },
  "items": []
}
```

## API 最小边界

本阶段可只实现契约和只读骨架，不需要完整业务逻辑。建议预留：

```text
POST /daily-product-research/runs/manual
GET  /daily-product-research/runs
GET  /daily-product-research/runs/:id
GET  /daily-product-research/runs/:id/candidates
GET  /daily-product-research/runs/:id/source-health
GET  /daily-product-research/scoring-versions
POST /daily-product-research/scoring-versions
POST /daily-product-research/scoring-versions/:id/activate
POST /daily-product-research/scoring-versions/:id/rollback
```

如果本阶段创建 controller，未实现的高成本操作必须明确返回受控状态或不暴露，不能用假数据填充。

## 迁移策略

1. 只新增表、枚举、索引和 nullable 关联，第一版不删旧字段。
2. 生成 Prisma migration，不手工修改生产数据库。
3. 若需要 PostgreSQL 部分唯一索引或 RLS，允许在 migration.sql 中加入受控 SQL。
4. 每个新租户表添加 RLS policy，并延续项目当前 session/context 变量模式。
5. 写清楚 down/rollback 方案。Prisma 不自动生成 down migration时，新增同目录回滚说明或受控 SQL 文件，遵循仓库现有规范。
6. 评估表锁和索引创建风险。大表索引按现有并发索引策略执行。
7. 不在同一迁移中做不可逆大规模回填。
8. 如需旧报告回填，另建可重复、分批、幂等的 CLI 脚本，并默认 dry-run。

## 测试驱动要求

先写失败测试，再实现。至少覆盖：

```text
[ ] Prisma schema validate
[ ] 新模型关系和唯一约束
[ ] 同业务日重复 run 被数据库拒绝或返回已有 run
[ ] 不同 organization 可以有同一业务日运行
[ ] 同 organization 不同 workspace 正确隔离
[ ] RLS 阻止跨租户读取/写入
[ ] ScoringVersion 同作用域只能一个 ACTIVE
[ ] Decimal/日期/nullable 契约序列化
[ ] 队列 payload schema 拒绝错误版本和非法枚举
[ ] 旧 ProductResearchReport API 回归不变
[ ] 旧候选审批路径仍可工作
[ ] 迁移可在空库执行
[ ] 回填脚本 dry-run 不修改数据
```

测试路径遵循当前仓库风格，优先新增：

```text
后端/test/daily-product-research-contract.spec.ts
后端/test/daily-product-research-model.spec.ts
后端/test/daily-product-research-tenant.spec.ts
后端/test/daily-product-research-migration.spec.ts
```

不要为了测试方便绕过 `TenantDatabaseContextService`。

## 本阶段允许修改

```text
后端/prisma/schema.prisma
后端/prisma/migrations/<new-migration>/**
后端/src/features/product-research/daily/contracts/**
后端/src/features/product-research/daily/*dto*.ts
后端/src/features/product-research/daily/*repository*.ts
后端/src/features/product-research/daily/daily-product-research.module.ts
后端/src/features/product-research/product-research.module.ts   # 仅注册子模块所需小改
后端/test/daily-product-research-*.spec.ts
后端/.env.example                                               # 仅本阶段真正新增配置时
```

避免修改前端。避免大改旧 `product-research.service.ts`。

## 出口闸门

```text
[ ] 领域模型与现有模型无语义重复
[ ] 核心候选、信号、风险、评分、来源健康均有稳定结构
[ ] 所有新表有 organizationId 和正确 workspace 语义
[ ] 关键幂等约束由数据库保证
[ ] 所有新表有 RLS 迁移和验证测试
[ ] 旧 ProductResearchReport/候选审批接口回归通过
[ ] 契约有 schemaVersion 和运行时验证
[ ] 金额、日期、null/optional 语义已测试
[ ] Prisma validate、目标测试、后端 build 通过
[ ] 有迁移部署、回滚和可选回填说明
```

最后输出 `PHASE HANDOFF`，其中 `next_phase_inputs` 必须包含：

- 最终模型名和关系图。
- run/stage 状态机枚举。
- 队列 payload schema。
- 幂等唯一键。
- 调度阶段可安全调用的 repository/service 接口。
