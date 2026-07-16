# 03 · 每日调度、幂等与流水线编排提示词

> 先读取：`00-shared-context.md`、阶段 01 审计结果、阶段 02 的模型与契约交接。  
> 前置条件：数据库模型、run/stage 状态和队列 payload 已稳定。  
> 本阶段目标：让系统在北京时间每天 08:00 安全地产生且只产生一次每日选品运行，并能暂停、恢复、重试和人工触发。

## 你的任务

复用当前 `AutomationFlow`、`AutomationRun`、BullMQ、Redis、Worker、审计和通知基础设施，实现专用的每日选品调度和 Orchestrator 骨架。

本阶段要打通：

```text
业务时区计划
→ 到期发现
→ 数据库幂等创建 run
→ 专用队列入队
→ Worker 获取运行
→ 阶段状态机顺序执行
→ 部分失败与恢复
→ 运行完成/异常通知
```

本阶段的各业务阶段可以使用明确的 no-op/test adapter，或调用已完成的接口骨架，但不得伪造真实采集、利润、风险或评分结果。真正业务实现由阶段 04-11 完成。

## 必读位置

```text
后端/src/features/automation/automation-scheduler.service.ts
后端/src/features/automation/automation.service.ts
后端/src/features/automation/automation.module.ts
后端/src/workers/automation.worker.ts
后端/src/workers/workers.module.ts
后端/src/shared/queue/**
后端/src/app.module.ts
后端/src/features/product-research/daily/**
后端/src/features/notifications/**
后端/src/shared/audit/**
后端/src/shared/database/**
后端/src/shared/tenancy/**
后端/prisma/schema.prisma
后端/test/automation*
后端/test/*queue*
后端/.env.example
```

## 架构边界

### 控制面继续使用 AutomationFlow

不要创建第二套用户可配置的定时任务系统。每日选品应由一个明确类型的 `AutomationFlow` 或现有等价配置触发，例如：

```json
{
  "source": "daily_product_research",
  "schedule": "0 8 * * *",
  "timezone": "Asia/Shanghai",
  "workspaceScope": "connected_or_configured",
  "enabledSources": ["etsy", "amazon", "google_trends", "internal_store"],
  "candidateLimit": 300,
  "topLimit": 10,
  "configVersion": "..."
}
```

若现有 `AutomationFlow.triggerConfig` 只支持 interval，向后兼容地增加 `cron`/`timezone` 语义。旧 interval flow 必须继续工作。

### 执行面使用专用队列和 Worker

推荐：

```text
Queue: daily-product-research
Worker: DailyProductResearchWorker
Orchestrator: DailyProductResearchOrchestratorService
```

不要让通用 `automation.worker.ts` 膨胀成全部选品逻辑。通用 Worker 只需：

1. 识别 `daily.product-research` 步骤。
2. 创建或取得 `ProductResearchRun`。
3. 向专用队列入队，或调用清晰 facade。
4. 返回 `researchRunId`、状态和可追踪链接。

专用 Worker 负责阶段状态、恢复和业务流水线。

## 业务时间与 Cron 规则

### 默认

```text
timezone = Asia/Shanghai
cron = 0 8 * * *
```

必须使用支持 IANA timezone 的可靠实现。优先评估当前依赖能否支持；若新增 Cron 解析库，选择维护良好、体积合理、能计算下一次执行时间的库，并锁定版本。

### 时间语义

- `businessDate` 由计划触发时刻在 `Asia/Shanghai` 转换得到，格式 `YYYY-MM-DD`。
- 存储时间统一 UTC，展示和计划计算使用明确 timezone。
- 服务器运行在 UTC、美国或任何地区都不能改变业务日。
- 计划修改后必须重新计算 `nextRunAt`。
- 服务停机跨过 08:00 后，默认执行一次补偿运行，但不能为每个错过分钟重复补跑。
- 补偿窗口可配置，例如 24 小时；超过窗口则记录 missed，不自动追赶。
- 不要依赖 JavaScript 进程内 `setTimeout` 作为唯一调度器。

## 幂等策略

### 数据库最终防线

创建 run 时必须在单个事务中：

1. 解析组织、工作区、业务日、configVersion。
2. 尝试依据阶段 02 的唯一键创建 run。
3. 若唯一冲突，返回已有 run，而不是报成系统错误。
4. 只有首次创建者才入队。
5. 写审计/Outbox 事件，避免 run 已创建但消息永久丢失。

推荐返回：

```ts
{
  runId: string;
  created: boolean;
  enqueued: boolean;
  businessDate: string;
  dedupeKey: string;
}
```

### 锁

Redis/BullMQ jobId 可用作并发优化：

```text
daily-product-research:{organizationId}:{workspaceScope}:{businessDate}:{configVersion}:{attempt}
```

但 Redis 锁失效、Worker 重启或消息重复时，数据库约束仍必须保证不重复。

### 手动运行

设计管理员接口：

```text
POST /daily-product-research/runs/manual
```

请求建议：

```json
{
  "workspaceId": "optional",
  "businessDate": "optional",
  "sources": ["etsy", "csv"],
  "dryRun": false,
  "forceNewAttempt": false,
  "reason": "manual verification"
}
```

规则：

- 默认复用同业务日已有运行。
- `forceNewAttempt=true` 需要管理员权限、原因、预算检查和审计。
- 不允许普通用户连续触发高成本任务。
- 同一 run 正在运行时返回 202/已有状态，不创建平行副本。

## 流水线状态机

建议阶段顺序：

```text
COLLECT
NORMALIZE
KEYWORDS
DEMAND
COMPETITION
PROFIT
RISK
SCORE
REPORT
NOTIFY
```

Orchestrator 规则：

1. 从数据库读取 run 和 `configSnapshot`，运行中不重新读取活跃配置覆盖本次快照。
2. 找到第一个未完成且可执行阶段。
3. 对阶段调用单一职责 service。
4. 每阶段开始和结束都持久化状态、attempt、耗时和摘要。
5. 每阶段输出只持久化 ID/统计/版本，不把巨大对象塞进 BullMQ job payload。
6. Worker 重启后根据数据库状态恢复。
7. 已完成阶段默认跳过，显式重算时创建新 attempt，不覆盖旧证据。
8. 依赖阶段失败时，后续阶段标记 `SKIPPED` 或 `BLOCKED`，原因可查询。
9. `COLLECT` 内某个来源失败只产生 source-level failure，不让整个阶段抛出，除非所有启用来源均不可用。
10. 报告阶段尽最大努力执行，即便 run 为 PARTIAL。

### Run 状态计算

```text
COMPLETED：所有必需阶段完成，允许有非关键来源降级
PARTIAL：报告已生成，但存在来源/可选阶段失败或数据不足
FAILED：无法形成任何有效候选/报告，或基础设施不可恢复失败
CANCELLED：管理员取消且 Worker 安全停止
```

不要让单个候选失败把整个 run 标记 FAILED。

## 重试与恢复

### 来源级重试

阶段 04 会实现来源连接器，本阶段先提供可配置策略：

```text
attempt 1 → 30 秒
attempt 2 → 2 分钟
attempt 3 → 10 分钟
最终失败 → 保存 SourceHealth=FAILED，继续其它来源
```

可使用 BullMQ 子任务、独立 job 或服务内受控重试。选择必须支持：

- 独立来源隔离。
- 超时。
- 总预算限制。
- 应用重启恢复。
- 测试中可用 fake timers，不真实等待。

### 阶段级重试

- 瞬态基础设施错误可以重试当前阶段。
- 数据验证失败不应无限重试，应记录 `DATA_INVALID`。
- 重试必须幂等，不重复插入候选/信号/评分/报告。
- 终态失败进入现有 dead-letter 或等价机制，并创建管理员告警。

### 取消

如实现取消：

- 仅管理员可操作。
- 使用 cooperative cancellation，在阶段边界停止。
- 不杀死共享 Worker 进程。
- 已写入证据保留，run 标记 CANCELLED。
- 报告可明确显示未完成阶段。

## 配置解析

实现单一配置解析服务，避免环境变量、triggerConfig、数据库配置散落：

```text
DailyProductResearchConfigService
```

至少解析：

```env
AGENT_TIMEZONE=Asia/Shanghai
PRODUCT_RESEARCH_CRON=0 8 * * *
DAILY_PRODUCT_LIMIT=300
DAILY_TOP_LIMIT=10
PRODUCT_RESEARCH_CATCHUP_WINDOW_HOURS=24
PRODUCT_RESEARCH_QUEUE_CONCURRENCY=2
PRODUCT_RESEARCH_SOURCE_TIMEOUT_MS=30000
PRODUCT_RESEARCH_DAILY_BUDGET=...
```

配置服务应返回已验证、冻结的 configSnapshot。非法 Cron、timezone、负数上限必须在启动或保存配置时明确失败。

## 审计、通知和 Outbox

至少记录：

```text
run.created
run.deduplicated
run.enqueued
run.started
stage.started
stage.completed
stage.failed
run.partial
run.completed
run.failed
run.cancelled
manual_run.requested
manual_run.force_attempt
```

复用现有 `AuditService`。关键状态通知通过现有通知/Outbox，不在事务中直接发外部网络请求。

普通用户通知只展示可行动内容：

- 今日报告已生成。
- 有多少立即打样、观察和淘汰。
- 部分数据源不可用。
- 是否需要人工审核。

管理员通知包含来源失败、死信、预算超限和调度异常。

## 可观测性骨架

本阶段至少添加：

```text
research_run_total{trigger,status}
research_run_duration_seconds
research_stage_duration_seconds{stage,status}
research_run_deduplicated_total
research_queue_wait_seconds
research_scheduler_missed_total
```

沿用项目现有 Prometheus/OpenTelemetry 方式。日志必须包含：

```text
organizationId
workspaceId
researchRunId
automationRunId
stage
jobId
requestId
```

不得记录凭证或完整外部 payload。

## 测试驱动要求

先写失败测试。至少覆盖：

### 时间和计划

```text
[ ] UTC 服务器仍在 Asia/Shanghai 08:00 到期
[ ] 07:59 不运行，08:00 运行
[ ] 次日 nextRunAt 正确
[ ] 非法 timezone/Cron 被拒绝
[ ] 服务停机后在补偿窗口内只补跑一次
[ ] 超出补偿窗口记录 missed
[ ] interval 类型旧 AutomationFlow 不受影响
```

### 幂等和并发

```text
[ ] 两个 scheduler 实例同时触发只创建一个 run
[ ] 重复消息只执行一个有效阶段 attempt
[ ] Redis jobId 丢失时数据库仍防重复
[ ] 同一组织不同 workspace 可各自运行
[ ] forceNewAttempt 创建关联 attempt 并有审计
[ ] 非管理员不能 force 或取消
```

### 状态和恢复

```text
[ ] Worker 崩溃后从首个未完成阶段恢复
[ ] 已完成阶段不会重复执行
[ ] 单一来源失败后 run 最终为 PARTIAL 且报告阶段仍运行
[ ] 全部来源失败时 run 为 FAILED 并产生报告/异常记录
[ ] 阶段数据验证失败不无限重试
[ ] 最终失败进入 dead-letter/告警
[ ] 手动取消在阶段边界停止
```

建议测试：

```text
后端/test/daily-product-research-scheduler.spec.ts
后端/test/daily-product-research-idempotency.spec.ts
后端/test/daily-product-research-worker.spec.ts
后端/test/daily-product-research-recovery.spec.ts
```

## 本阶段允许修改

```text
后端/src/features/automation/**                     # 仅扩展 cron/timezone 和 daily flow 接入
后端/src/features/product-research/daily/**         # scheduler/config/orchestrator/facade
后端/src/shared/queue/**                            # 仅注册专用队列所需
后端/src/workers/daily-product-research.worker.ts
后端/src/workers/workers.module.ts
后端/src/app.module.ts                              # 仅模块注册
后端/test/daily-product-research-*.spec.ts
后端/.env.example
```

如需 Prisma 小修，只能修复阶段 02 遗漏，并新增迁移，不得修改已部署迁移文件。

## 禁止事项

- 不要用单机 `setInterval` 作为唯一调度保证。
- 不要把 timezone 默认为服务器本地时区。
- 不要只靠 Redis 锁防重复。
- 不要在 BullMQ payload 中传 300 个完整候选和原始快照。
- 不要把所有业务阶段继续写入 `automation.worker.ts`。
- 不要让单个来源失败终止其它来源。
- 不要在运行中静默切换评分/阈值配置。
- 不要自动执行任何店铺写操作。

## 出口闸门

```text
[ ] Asia/Shanghai 08:00 计划语义有自动化测试
[ ] 旧 interval automation flow 回归通过
[ ] 数据库唯一约束确保同业务日不重复
[ ] 多实例并发触发测试只产生一个 run
[ ] 专用队列和 Worker 已注册
[ ] Orchestrator 可按阶段恢复、跳过已完成阶段
[ ] 来源失败不会阻断报告阶段
[ ] 手动触发、force attempt、权限和审计已实现
[ ] 关键状态有指标和结构化日志
[ ] 目标测试、lint、后端 build 通过
```

最后输出 `PHASE HANDOFF`。`next_phase_inputs` 必须提供：

- Connector 阶段应实现的接口签名。
- Orchestrator 如何调用 `COLLECT` 服务。
- SourceHealth 的写入接口。
- 单来源错误的标准错误码。
- 重试、超时和每日预算配置对象。
