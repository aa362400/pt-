# 每日精准跨境选品 Agent：平台接入设计与分阶段提示词

> 文档性质：实施设计与开发型 AI 执行手册。  
> 当前状态：只新增 `.ai-bridge` 交接文档，不修改运行时代码、数据库或页面。  
> 适用仓库：当前 `G:\平台` 单体仓库。  
> 默认业务时区：`Asia/Shanghai`。  
> 默认每日执行时间：北京时间 08:00。  
> 默认候选上限：300。  
> 默认高质量推荐上限：10，不足时禁止凑数。

## 1. 为什么不能继续使用“一整块总提示词”

原始说明同时包含业务目标、数据采集、Agent 推理、数据库、队列、前端、测试、安全、上线和验收。把这些内容一次性交给开发型 AI，容易产生四类问题：

1. 上下文过长，关键约束被埋在中间。
2. AI 在不了解现有模块时重复造轮子。
3. 数据结构尚未稳定，前后端和报告先行后反复返工。
4. 一个阶段失败后，后续阶段仍在错误假设上继续施工。

本目录把改造拆成“共享上下文 + 16 个有出口闸门的阶段提示词 + 总控提示词”。每次只执行一个阶段，并把结果作为下一阶段的输入。

## 2. 当前平台已具备的可复用骨架

| 能力 | 当前路径 | 接入原则 |
|---|---|---|
| NestJS 后端 | `后端/src/` | 不另建第二套后端 |
| Prisma 数据模型与迁移 | `后端/prisma/` | 只用迁移脚本演进，不手改生产库 |
| BullMQ/Redis 队列 | `后端/src/shared/queue/`、`后端/src/workers/` | 新增专用选品队列和 Worker，复用队列基础设施 |
| 自动化调度控制面 | `后端/src/features/automation/` | 复用 `AutomationFlow`/`AutomationRun` 触发，不把完整流水线塞进轮询服务 |
| 手动与自动选品入口 | `后端/src/features/product-research/` | 保持现有 API 兼容，新增 daily 子域 |
| Agent Provider | `后端/src/agents/agent-provider.interface.ts` | 扩展版本化契约，不用字符串数组承载全部候选信息 |
| 趋势、关键词、利润、供应链 | `后端/src/features/trends/`、`keywords/`、`profit-calculator/`、`supply-chain/` | 封装为阶段能力并复用，不复制业务逻辑 |
| 审核、通知、审计 | `后端/src/features/review/`、`notifications/`、`后端/src/shared/audit/` | 所有外部写操作继续走人工审批与审计 |
| 多租户/RLS | `TenantDatabaseContextService`、Prisma RLS 迁移 | 新表必须具备组织隔离与验证脚本 |
| React 控制台 | `智能体前端/src/` | 延续现有设计系统、API 客户端和路由，不重做控制台 |
| PromptTemplate | `后端/src/features/prompts/` | 运行时提示词需版本化、可审计；本目录提示词用于开发实施 |
| 历史与记忆 | `后端/src/features/agent-memory/` | 经营反馈可以写入结构化反馈后再生成可治理记忆 |

## 3. 推荐接入架构

```text
AutomationFlow（每天 08:00，Asia/Shanghai）
        │
        ▼
DailyProductResearchScheduler
        │  幂等键：org + workspace + business_date + config_version
        ▼
BullMQ: daily-product-research
        │
        ▼
DailyProductResearchOrchestrator
        ├─ 01 Collect：并行调用连接器，保存原始证据和 SourceHealth
        ├─ 02 Normalize：标准化、去重、生成 product_fingerprint
        ├─ 03 Keywords：核心词、长尾词、否定词
        ├─ 04 Demand：多来源需求验证和 confidence_score
        ├─ 05 Competition：竞争强度、缺口、差异化方向
        ├─ 06 Profit：完整成本、产能、广告后净利润
        ├─ 07 Risk：侵权、合规、物流、禁限售一票否决
        ├─ 08 Score：版本化权重、硬门槛、决策分池
        ├─ 09 Report：TOP、观察池、淘汰池、异常与来源健康
        └─ 10 Feedback：关联上架、订单、广告、退款和实际利润
        │
        ▼
人工审核中心
        ├─ 批准后：生成开发任务、图片方案、Listing 草稿
        └─ 未批准：禁止上架、改价、删品、开广告等外部写操作
```

### 3.1 代码放置建议

不建议把新逻辑继续堆进已经很大的 `product-research.service.ts`。推荐在原功能域内建立隔离子域：

```text
后端/src/features/product-research/
├── daily/
│   ├── contracts/
│   ├── connectors/
│   ├── services/
│   ├── prompts/
│   ├── reports/
│   ├── daily-product-research.controller.ts
│   ├── daily-product-research.module.ts
│   └── daily-product-research.service.ts
├── product-research.controller.ts        # 保持现有接口兼容
├── product-research.service.ts           # 保留手动研究与候选审批
└── product-research.module.ts

后端/src/workers/
└── daily-product-research.worker.ts
```

前端建议在现有选品页面和审核中心上增量扩展：

```text
智能体前端/src/
├── api/dailyProductResearch.ts
├── pages/ProductResearch.tsx             # 保留手动研究入口
├── pages/DailyProductResearch.tsx        # 今日选品、观察池、淘汰池
├── pages/ProductResearchSources.tsx      # 数据源健康
├── pages/ProductResearchScoring.tsx      # 评分配置与版本
└── pages/ProductResearchHistory.tsx      # 历史表现与预测准确率
```

## 4. 关键领域决策

### 4.1 现有表保留，新能力增量建模

`ProductResearchReport`、`ProductResearchCandidateDecision`、`AutomationFlow`、`AutomationRun`、`ProfitCalculation` 等现有结构继续保留。第一版不删除、不重命名、不破坏旧接口。

新增结构化实体时，优先围绕以下概念设计，并在阶段 02 根据当前 Prisma 模型消除重复：

- `ProductResearchRun`：一次每日选品批次及阶段状态。
- `ProductCandidate`：规范化后的候选产品，不再只藏在 JSON 或字符串数组中。
- `ProductSignal`：来源、时间、指标、证据 URL、原始快照引用。
- `ProductScore`：评分明细、权重版本、决策和硬门槛结果。
- `ProductRiskRecord`：风险项、证据、等级、审查状态。
- `SourceHealth`：来源可用性、延迟、失败、最后成功和数据新鲜度。
- `ScoringVersion`：权重、阈值、修改人、原因、启用状态和回滚链。
- `ProductFeedback`：打样、上架、曝光、点击、收藏、加购、订单、广告、退款和实际净利润。
- `ResearchReportArtifact`：MD/JSON 报告元数据、存储位置和内容哈希。

### 4.2 调度与执行分离

`AutomationSchedulerService` 负责发现到期任务和入队，不负责运行所有选品阶段。完整流程由专用 Worker 和 Orchestrator 执行。调度器必须理解时区和 Cron/本地业务日，而不是只依赖固定分钟间隔。

### 4.3 证据优先于大模型判断

LLM 只做归纳、分类、缺口提炼和文案生成。价格、趋势、成交、成本、风险名单、平台规则等字段必须带来源和采集时间。字段缺失时输出 `null`、`unknown` 或 `needs_verification`，不得补造数字。

### 4.4 硬门槛先于加权分数

以下任一成立时，不论总分多高都不能进入“立即打样”：

- `HIGH`/`BLOCKED` 侵权或合规风险。
- 平台禁售或无法履约。
- 广告后净利率低于配置阈值。
- 供应链不稳定或关键成本缺失。
- 退款风险超阈值。
- 只有单一弱信号且无法交叉验证。

### 4.5 外部写操作保留人工开关

正式上架、改价、删除商品、采购、开启广告、向平台写入数据，都必须经过现有审核与权限体系。自动流程只生成候选、草稿、任务和建议。

## 5. 提示词执行顺序

每个阶段都先读取 `00-shared-context.md`，再读取对应阶段文件。

| 顺序 | 文件 | 结果 |
|---:|---|---|
| 0 | `00-shared-context.md` | 所有阶段共用的项目事实与安全规则 |
| 1 | `01-baseline-audit.md` | 实际差距矩阵、冲突清单、实施切片 |
| 2 | `02-contracts-data-model.md` | 版本化契约、Prisma 模型、迁移与回滚设计 |
| 3 | `03-scheduling-orchestration.md` | 08:00 调度、幂等、锁、队列、阶段状态机 |
| 4 | `04-connectors-source-health.md` | 统一连接器、CSV 导入、来源健康与容错 |
| 5 | `05-normalization-dedup.md` | 标准化、指纹、跨平台合并、30 天去重 |
| 6 | `06-keywords-demand.md` | 关键词扩展、需求证据、置信度门禁 |
| 7 | `07-competition-analysis.md` | 竞争结构、市场缺口、差评与差异化 |
| 8 | `08-profit-capacity.md` | 完整净利润、情景测算、UV/激光产能 |
| 9 | `09-compliance-risk.md` | 侵权/合规/物流风险和一票否决 |
| 10 | `10-scoring-decision.md` | 权重版本、硬门槛、TOP/观察/淘汰决策 |
| 11 | `11-reporting-history.md` | MD/JSON 报告、历史、异常和来源健康报告 |
| 12 | `12-console-approval.md` | 今日选品、来源、评分、历史、日志与人工审批 |
| 13 | `13-feedback-learning.md` | 经营结果回传、周度评估、受控权重建议 |
| 14 | `14-tests-security-observability.md` | 测试、安全、RLS、预算、指标、告警 |
| 15 | `15-release-rollout.md` | 数据迁移、灰度、部署、回滚、运行手册 |
| 16 | `16-final-acceptance.md` | 全链路验收证据与最终缺口清单 |
| 总控 | `99-master-orchestrator.md` | 供开发型 AI 管理整套阶段流程 |
| 完整交付 | `100-local-server-ready-platform-goal.md` | 把 Windows 电脑作为本机服务器，补齐全部生产页面并交付可直接登录使用的平台 |

## 6. 推荐使用方式

### 方式 A：最稳妥

每次新开一个开发会话，按顺序提供：

```text
1. .ai-bridge/daily-product-research/00-shared-context.md
2. 当前阶段提示词
3. 上一阶段的 handoff 结果
```

一个阶段完成并通过出口闸门后，再进入下一阶段。

### 方式 B：使用总控

把 `99-master-orchestrator.md` 交给支持长任务和文件工具的开发型 AI。总控仍必须按阶段工作，不能一次性跨过所有验收门。

### 方式 C：直接交付本机可用平台

当目标是把 Windows 电脑作为服务器、补齐生产页面、打开全部安全功能并在完成后直接开始使用时，将 `100-local-server-ready-platform-goal.md` 交给 Codex。该提示词要求实际启动 Docker 本机栈、验证局域网入口、运行每日选品、完成浏览器全路由验收和备份恢复，不以规划文档代替交付。

## 7. 每阶段统一交接格式

```markdown
# PHASE HANDOFF

- phase: 02-contracts-data-model
- status: completed | blocked | partial
- base_revision: <git SHA 或工作区基线说明>
- files_added: []
- files_modified: []
- migrations_added: []
- contracts_added_or_changed: []
- tests_added: []
- verification_commands:
  - command: ...
    result: passed | failed | not_run
- factual_evidence:
  - path:line-range
- compatibility_notes: []
- unresolved_risks: []
- next_phase_inputs: []
- rollback_notes: []
```

没有测试输出或文件证据时，不允许写“已完成”。

## 8. 当前工作区安全提醒

当前仓库已有大量未提交修改。执行任何实现阶段时必须：

1. 先记录工作区状态和基线，不得 `reset --hard`、`clean -fd` 或覆盖他人修改。
2. 优先使用独立分支或 worktree。
3. 只修改当前阶段允许范围内的文件。
4. 发现现有修改与阶段目标冲突时，记录冲突并采用增量兼容方案。
5. 未经明确授权不提交、不推送、不部署。

## 9. 最终成功标准

系统能够在业务日每天北京时间 08:00 只执行一次；多个来源独立失败不会拖垮全流程；每个候选都有来源证据、完整成本、风险结果、评分版本和决策原因；TOP 10 不重复、不凑数；报告同时生成 MD 和 JSON；后台能查看来源健康、任务日志、评分版本和历史表现；所有外部写操作仍需人工批准；新增表具备租户隔离、迁移、回滚、测试和可观测性证据。
