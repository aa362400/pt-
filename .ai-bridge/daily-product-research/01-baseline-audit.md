# 01 · 基线审计与差距矩阵提示词

> 先读取：`.ai-bridge/daily-product-research/00-shared-context.md`  
> 本阶段性质：只调查、设计和记录，不实现运行时代码。  
> 本阶段出口：一份可被后续阶段直接执行的“真实基线审计报告”。

## 你的任务

完整扫描当前仓库，确认“每日精准跨境选品 Agent”应该复用什么、扩展什么、不能碰什么。禁止根据目录名猜测完成度，必须阅读实际代码、DTO、Prisma 模型、迁移、测试、前端 API 映射和现有部署配置。

你要回答的核心问题是：

```text
如何在不破坏现有 Ozon 选品、自动化、审核、通知、多租户和前端页面的前提下，
把每日多平台选品能力增量接入当前单体平台？
```

## 必读文件与目录

至少检查以下位置，并按实际依赖继续追踪：

```text
根目录 package/工作区配置
后端/package.json
后端/src/app.module.ts
后端/src/features/features.module.ts
后端/src/features/product-research/**
后端/src/features/automation/**
后端/src/workers/automation.worker.ts
后端/src/workers/workers.module.ts
后端/src/shared/queue/**
后端/src/agents/**
后端/src/features/trends/**
后端/src/features/keywords/**
后端/src/features/profit-calculator/**
后端/src/features/supply-chain/**
后端/src/features/review/**
后端/src/features/notifications/**
后端/src/features/prompts/**
后端/src/features/agent-memory/**
后端/src/shared/audit/**
后端/src/shared/tenancy/**
后端/src/shared/database/**
后端/prisma/schema.prisma
后端/prisma/migrations/**
后端/test/**
智能体前端/package.json
智能体前端/src/App.tsx
智能体前端/src/components/sidebar/**
智能体前端/src/pages/ProductResearch.tsx
智能体前端/src/api/productResearch.ts
智能体前端/src/pages/ReviewCenter.tsx
智能体前端/src/api/review.ts
智能体前端/src/i18n/**
docker-compose*.yml
nginx/**
.github/workflows/**
```

不要一次性打印所有文件内容。先用目录树和搜索定位，再精读关键片段。

## 必须产出的审计内容

### 1. 技术栈与运行拓扑

列出并核验：

- Node、NestJS、React、TypeScript、Prisma、PostgreSQL、Redis、BullMQ 的实际版本。
- 后端、Worker、前端、数据库、Redis、对象存储和 Agent 服务如何启动及通信。
- 开发、测试、生产环境变量入口。
- 当前定时任务是进程内轮询、BullMQ repeatable job、Cron，还是组合模式。
- 当前 Agent 调用经过哪些 provider、HTTP 服务或 Python 智能体。
- 当前文件/报告应该存到哪里，是否有现成 `FilesService`、对象存储或签名 URL。

### 2. 能力复用矩阵

按下表格式逐项输出，不得用“应该有”代替证据：

| 目标能力 | 当前实现 | 证据路径/行 | 完成度 | 可复用方式 | 必须补齐 |
|---|---|---|---|---|---|
| 每日 08:00 调度 |  |  | 已有/部分/缺失 |  |  |
| 幂等和重复运行保护 |  |  |  |  |  |
| 分布式锁 |  |  |  |  |  |
| 失败重试/死信 |  |  |  |  |  |
| 多来源连接器 |  |  |  |  |  |
| 原始证据保存 |  |  |  |  |  |
| 标准化/去重 |  |  |  |  |  |
| 关键词扩展 |  |  |  |  |  |
| 需求验证 |  |  |  |  |  |
| 竞争分析 |  |  |  |  |  |
| 完整利润 |  |  |  |  |  |
| 风险一票否决 |  |  |  |  |  |
| 版本化评分 |  |  |  |  |  |
| MD/JSON 报告 |  |  |  |  |  |
| 来源健康 |  |  |  |  |  |
| 人工审核 |  |  |  |  |  |
| 历史表现和反馈 |  |  |  |  |  |
| RBAC/RLS/审计 |  |  |  |  |  |
| 前端页面 |  |  |  |  |  |

### 3. 数据模型重叠分析

逐一比较原需求中的概念与现有 Prisma 模型：

```text
research_runs
product_candidates
product_signals
product_scores
product_recommendations
product_feedback
source_health
scoring_versions
risk_records
report_artifacts
```

对每个概念明确选择：

```text
A. 直接复用现有模型
B. 扩展现有模型
C. 新建关联模型
D. 不需要持久化
```

必须说明理由、兼容风险和查询方式。特别检查：

- `ProductResearchReport` 中 JSON 是否已被前端或测试依赖。
- `ProductResearchCandidateDecision` 以 reportId + candidateIndex 识别候选的局限。
- `AutomationRun` 与新的每日研究运行是否应一对一、引用，还是合并。
- `ProfitCalculation` 是否适合扩字段，还是采用成本明细 JSON/子表。
- `TrendInsight`、`KeywordReport` 能否作为来源证据，避免重复存储。
- 新表如何挂接 organizationId、workspaceId 和 RLS。

### 4. API 与前端兼容审计

输出当前 API 路由、请求 DTO、响应结构及前端映射。至少覆盖：

- 手动创建研究报告。
- 报告列表和详情。
- 候选列表、批准、拒绝、进入审核。
- 自动化流程与运行。
- 利润计算。
- 趋势、关键词、供应链。
- 通知和审核中心。

标记所有“前端期待但后端没有”“后端返回但前端丢弃”“当前只支持 Ozon”的字段。后续设计必须保持现有路由兼容，并通过新增 `/daily-product-research` 或同等清晰子资源提供新能力。

### 5. 工作区冲突与保护清单

当前工作区存在大量未提交修改。输出：

- 与本功能可能冲突的已修改文件。
- 哪些文件可安全新增。
- 哪些文件只能做小范围补丁。
- 哪些文件必须等用户现有工作合并后再改。
- 推荐分支/worktree 策略。

不得清理工作区，不得执行破坏性 Git 操作。

### 6. 最终实施切片

将改造映射到后续 15 个阶段，并为每阶段写出：

- 精确目标。
- 建议新增文件。
- 建议修改文件。
- 前置依赖。
- 主要测试。
- 可独立回滚边界。
- 最大风险。

避免把所有逻辑塞进 `product-research.service.ts` 或 `automation.worker.ts`。如果需要拆分大文件，只允许做服务于当前功能的最小提取，并保持旧导出与接口兼容。

## 本阶段允许修改

只允许新增或更新规划/审计文档，例如：

```text
.ai-bridge/daily-product-research/baseline-audit-result.md
.ai-bridge/daily-product-research/progress.md
```

禁止修改：

```text
后端/src/**
后端/prisma/**
智能体前端/src/**
部署和 CI 文件
```

## 质量检查

完成前自检：

- 每一条“已有能力”都有真实文件证据。
- 没有把未阅读的目录当成已实现。
- 没有提出第二套认证、队列、审计、通知或租户体系。
- 数据模型选择没有语义重复。
- 计划包含向后兼容与回滚。
- 所有待确认事项都被区分为“可从代码验证”和“真正需要业务输入”。
- 文档中没有 `TBD`、`TODO`、“以后再说”等占位词。

## 出口闸门

只有同时满足以下条件，本阶段才能标记 `completed`：

```text
[ ] 完成技术栈与运行拓扑核验
[ ] 完成至少 18 项能力复用矩阵
[ ] 完成所有目标实体与现有 Prisma 模型的重叠分析
[ ] 完成 API/前端兼容矩阵
[ ] 完成 dirty worktree 冲突清单
[ ] 为阶段 02-16 给出精确实施切片
[ ] 所有关键结论都有路径/行号或命令输出证据
```

最后按 `00-shared-context.md` 的 `PHASE HANDOFF` 模板输出，并把下一阶段所需的模型选择、兼容约束和文件清单放入 `next_phase_inputs`。
