# 跨境 AI Agent SaaS 下一步计划实施验收

验收时间：2026-07-15（Asia/Shanghai）

验收原则：只认可可重复执行的代码、测试、运行状态和真实业务证据；未配置、未执行或证据不足的项目不得显示为通过。

## 结论

- **本地实现与回归：通过。** P0 状态一致性与审批安全、P1 反馈评估闭环、P2 本地可观测性和恢复基础均已落地。
- **本地运行基线：通过。** PostgreSQL、Redis、后端、Python Agent、前端、Nginx 均已启动，统一入口为 `http://127.0.0.1`。
- **生产企业级总验收：阻断。** AWS KMS、S3 Object Lock、外部渗透测试、Stripe 实付、真实负载演练、Kubernetes 发布演练和连续 14 天 SLO 尚无完整证据。
- 本轮未执行商品发布、改价、库存、广告、订单、审批通过、图片生成或其他外部写入。

## P0 验收

### 统一 Agent 状态机

- 已实现统一生命周期：`CREATED`、`PLANNING`、`WAITING_TOOL`、`WAITING_APPROVAL`、`EXECUTING`、`VERIFYING`、`RETRY_SCHEDULED`、`COMPLETED`、`FAILED`、`CANCELLED`。
- PostgreSQL 为状态事实源；Python Agent 只上报生命周期事件，不维护第二套业务终态。
- 已实现事件表、Outbox、稳定幂等键、版本号并发控制、Worker lease、heartbeat、恢复扫描、取消和子任务重试。
- 已提供前后端/Python 共用契约 `contracts/agent-lifecycle-v2.json`。
- 前端可查看时间线、失败原因、重试轨迹和最终影响范围。

### Action Approval Center 与 Listing Sandbox

- 通知不再直接充当可执行审批依据；高风险动作转为服务端 `ActionProposal`。
- Listing 发布使用不可变快照、内容哈希、审批记录和沙箱校验；审批后内容变化会阻断执行。
- 发布、改价、库存、广告和订单动作继续要求人工确认。
- 审批中心展示业务预览、真实 Ozon 商品图、商品链接、抓取时间、价格和证据完整性，不展示客户无法理解的原始 JSON。
- 不完整候选在界面中禁用；生成图片和本地 Listing 需要单独确认，且不会直接写入 Ozon。

### Ozon 发布提交账本与不确定结果恢复

- `ProductLaunch` 采用数据库 Compare-And-Set 原子领取：只有 `QUEUED` 状态可以进入 `SUBMITTING`，并发 Worker 中只有一个能取得提交令牌。
- `ExternalSubmission` 持久化不可变 `snapshotHash`、真实提交载荷 `payloadHash`、`submissionKey`、领取令牌、请求发出时间、响应时间和对账结果。
- 外部提交状态明确区分 `PREPARED -> CLAIMED -> REQUEST_SENT -> ACKNOWLEDGED/SUCCEEDED`；本地预检失败进入 `RETRYABLE_FAILED`，网络结果不确定进入 `UNKNOWN -> RECONCILING`。
- 账本在通过本地凭据与渠道校验后、真实 Ozon HTTP 写请求前一刻原子标记 `REQUEST_SENT`，避免“账本先显示已发送但网络请求尚未开始”。
- Ozon `408`、`429` 和 `5xx` 视为传输不确定结果，不再伪装为平台明确拒绝；Worker 不会盲目重发，而是先按不可变 `offerId` 执行只读回查。
- 已存在 `REQUEST_SENT`、`UNKNOWN` 或 `RECONCILING` 的提交不会再次写入 Ozon；丢失领取权的旧 Worker 也不能覆盖新 Worker 的结果。
- 本轮只执行 mock/只读回归、数据库迁移和本地运行验证，没有向 Ozon 发起商品写入。

### 多租户 RLS 强制隔离

- 已核实所有直接含 `organizationId` 的业务表均启用并强制 RLS，且策略绑定 `app.current_organization_id`。
- 数据库应用角色 `shopmate_app` 不是 superuser，且没有 `BYPASSRLS`。
- 实测发现并修复 4 张间接租户子表的数据库级越权：`assistant_messages`、`automation_runs`、`store_metric_snapshots`、`store_agent_profiles`。
- 修复前，切换到无自动化数据的组织后，父表正确返回 0，但可直接读取其他组织的 103 条自动化运行和 14 条指标快照；这证明仅依赖父表 RLS 不足。
- 增量迁移 `20260715160000_enforce_transitive_tenant_rls` 通过父表外键解析组织归属，并为 4 张子表启用 `ENABLE + FORCE ROW LEVEL SECURITY`。
- 修复后，同一真实数据库探针跨组织读取返回 0，4 类跨组织写入全部被 RLS 拒绝；切换到资源所属组织后，39 条自动化运行、7 条指标快照可见，4 类本组织写入均成功。
- 所有写入探针均在事务中回滚，没有向业务库留下测试数据。

### Python Agent 自主工具边界

- Python Planner 不再根据后端清单自动注册全部能力；本地静态只读允许表与后端 `READ_ONLY` 权限必须同时满足，任一不满足都不会进入自主工具列表。
- 运行态清单包含 45 个平台动作，其中 31 个为草稿、修改或发布级动作；Agent 实际注册 14 个只读动作，注册的写入动作数量为 0。
- 所有工具输入执行严格 Schema、字段数量、字符串长度、列表长度和嵌套深度校验；未知字段、错误类型、非有限数字和超限载荷在执行前被拒绝。
- 全局上下文不再无条件注入工具；只有工具声明的业务字段可以继承，`orgId` 等可信身份字段必须由服务端上下文覆盖，模型不能伪造组织。
- Planner 最多执行 6 步，校验依赖顺序，并按工具重试策略限制尝试次数；副作用或不可安全重试的工具只允许一次尝试。
- 每次工具调用写入仅含哈希、字段名、耗时、状态和 trace/run/tenant/workspace 标识的追加式 JSONL 审计；原始密钥、图片和业务内容不会写入审计文件。
- 平台代理只有明确返回 `status=executed` 才会被 Planner 记为完成；`error`、`forbidden`、`pending_confirmation` 和异常响应全部失败关闭，不再出现“后端失败、Agent 显示完成”。
- 攻击测试先复现 6 个边界失败和 2 个身份信任失败；修复后专项回归 41 个测试通过，全量 Agent 回归 663 个测试通过。

### Agent 图片任务终态真实性

- Agent 任务契约已统一升级为 `1.3.0`，前端、后端和 Python Agent 三份契约均强制要求 `mockMode`、`supervisionApproved` 和 `publishable`。
- `supervision_failed`、`cancelled` 和 `mock_preview` 保留真实终态，不再被改写成 `completed`；Mock 结果始终为 `supervisionApproved=false`、`publishable=false`。
- 只有生成报告成功、监督器明确批准、非 Mock 且服务端明确返回 `publishable=true` 时，后端和前端才显示真实完成；其他结果只能进入预览或失败状态。
- 前端图片工作台新增“预览完成”阶段，并明确提示结果不可发布，不再用成功提示误导客户。
- 相关 Agent 生成专项回归 113 个测试通过；Agent 全量回归 665 个测试通过，后端跨层契约专项 25 个测试通过。

### Ozon 只读同步租户上下文

- 运行态重建后发现 `OzonOrderSyncWorker` 在汇总订单后写入 `store_metric_snapshots` 时脱离租户事务，真实数据库由 RLS 正确拒绝该写入。
- `refreshStoreMetricsFromOrders` 已将订单聚合、指标读取和指标 upsert 全部收敛到同一个 `tenantDatabase.run` 事务上下文。
- 新增回归测试强制指标读取和写入必须位于租户上下文；测试先稳定复现 `RLS context missing for store metric read`，修复后通过。
- 后端镜像重建并等待启动同步窗口后，日志中 RLS 错误和 Ozon 同步失败均为 0；本轮仍未执行任何 Ozon 外部写入。

### Agent 主链路统一 W3C Trace

- 新增统一 Trace 上下文解析器，严格校验 W3C `traceparent`、32 位十六进制 `traceId` 和请求 ID；全零、非法版本、CRLF 与超长值都会被拒绝并重新生成。
- HTTP 入口优先继承有效 OpenTelemetry Span 或 W3C `traceparent`，并在响应中返回 `X-Trace-Id` 与 `traceparent`；结构化日志自动附带 `requestId`、`traceId`、组织和用户上下文。
- `AgentRun -> Outbox -> BullMQ -> Agent Worker -> Python Agent` 全链路传播同一个 Trace 根；Python 任务线程、通知线程和生命周期回调继续携带该上下文，模型无法用请求体覆盖服务端可信 Header。
- Agent 任务契约已升级为 `1.4.0`，根目录、后端和 Python Agent 三份契约字节一致，并明确声明 `traceId` 与 `traceparent`。
- 本地真实运行验收创建隔离 QA 用户并提交无工具 `GENERAL_ASSISTANT` 任务，任务 `cmrlsq45100hvql01fx97onia` 终态为 `COMPLETED`；HTTP 响应、PostgreSQL `AgentRun` 和 Python Redis 任务记录中的 Trace ID 均为 `4bf92f3577b34da6a3ce929d0e0e4736`。
- Python 任务记录中的 `traceparent` 为同一 Trace 下的新 Span；数据库保存了 `RUN_CREATED`、`PLAN_STARTED`、`TOOL_CALL_REQUESTED`、`TOOL_RESULT_RECEIVED`、`EXECUTION_FINISHED`、`VERIFICATION_PASSED` 六个真实生命周期事件，证明回调链已闭合。
- 本次 Trace 验收未调用平台工具，未执行审批、出图或任何 Ozon 外部写入；自动化定时/手动流程采用独立验收证据，见下一节。

### 自动化任务统一 W3C Trace

- `AutomationRun` 新增可索引 `traceId`，通过增量迁移 `20260715170000_add_automation_run_trace_context` 应用；没有重写或压缩任何历史迁移。
- 手动触发继承可信 HTTP Trace，定时调度为每次新运行创建 W3C Trace 根；数据库运行记录与 BullMQ 作业同时保存同一 Trace ID 和 `traceparent`。
- Worker 进入任务时绑定 AsyncLocalStorage，并以数据库 `AutomationRun.traceId` 为事实源；队列载荷无法用另一个 Trace 覆盖数据库值，图片提示词与图片 Agent 调用会继承 Worker 上下文。
- BullMQ 原地重试保留同一作业 Trace；失败作业写入死信时完整保留 Trace 载荷，受控恢复创建新运行时沿用原失败运行的 Trace ID，同时生成新的 Span。
- 专项测试先稳定复现数据库未保存、调度未注入、恢复未继承和 Worker 未透传四个失败，修复后自动化、调度、Worker 与死信专项共 27 个测试通过。
- 真实运行验收使用隔离临时组织，手动触发仅含 `task.create` 的本地流程；运行 `cmrluarqt00g5o101pe55w5es` 终态为 `COMPLETED`，HTTP、PostgreSQL 和 BullMQ 的 Trace ID 均为 `0a1b2c3d4e5f67889988776655443322`，Worker 返回 `completed`。
- 临时 QA 账号已停用；本次流程没有调用模型、Ozon、图片生成、审批通过或发布接口，外部平台写入为 `not_executed`。

### 一次性审批执行授权与快照唯一发布入口

- `ActionProposal` 新增只保存 SHA-256 哈希的一次性执行授权；原始令牌只在服务端批准调用栈内短暂存在，不写入数据库，也不返回前端。
- 执行授权同时绑定组织、审批提案、不可变 `payloadHash`、批准决策 ID、精确动作 scope 和最长 5 分钟有效期；数据库原子条件更新确保同一授权只能消费一次。
- 每次批准都会写入一条不可变 `ApprovalDecision`，并将幂等键固定为 `approval:<proposalId>:<payloadHash>`；重放、过期、哈希变化、动作变化或 scope 不匹配全部在业务适配器之前失败关闭。
- API 列表和详情会移除 `executionGrantHash`；客户端无法读取、复制或重放数据库中的授权摘要。
- 已删除通知审批路由中的可变商品直接发布能力。`store.product.update`、`listing.publish`、`ozon.product.update`、`ozon.listing.publish` 和 `product-launch.confirm-publish` 现在都只能进入 `ProductLaunchService.confirmPublish`。
- 所有商品发布必须提供 `productLaunchId`，随后验证不可变 `ListingPublishSnapshot`、快照哈希、Listing Sandbox 报告、`ExternalSubmission` 提交账本和稳定队列 Job ID；仅提供 `productId` 的旧请求返回 `PRODUCT_LAUNCH_SNAPSHOT_REQUIRED`。
- 源码调用点审计确认：商品发布外部写入只剩 ProductLaunch Worker 调用 `publishSnapshot`；不存在通知中心直接调用 `publishProduct` 的旁路。
- 本地运行态隔离验收中，旧 `ozon.listing.publish` 请求缺少 `productLaunchId` 时第一次批准返回 HTTP 400；第二次重放继续返回 HTTP 400。数据库终态为 `FAILED`，授权为 `hashed + consumed`，scope 为 `action:ozon.listing.publish`，批准决策恰好 1 条。
- 同一运行态验收的 `ExternalSubmission` 数量为 0，最近 5 分钟全库新增外部提交为 0；测试组织与测试账号已清理，未触发任何 Ozon HTTP 写请求。

### AI 发布安全 v2 与 Worker 单次授权

- `ListingPublishSnapshot` 当前写入版本升级为 `listing-publish-snapshot/v2`；历史 v1 仅可读取，不会被新的发布流程静默复用。
- v2 快照只固化已持久化证据：图片视觉 QA 与一致性、内容评估、带 URL/正数 RUB 价格/抓取时间的 Ozon 竞品证据、上次批准价、店铺最低利润率、属性编译结果、渠道同步状态、不可变审批和外部响应前置证据。
- 发布安全引擎覆盖图片一致性、内容合规、价格异常、利润缓冲、属性完整性、渠道风险、审批完整性、外部响应可信度 8 个维度；总分 `>=85` 且无硬阻断才 `ALLOW`，`60-84` 或存在软阻断进入 `REVIEW`，低于 60 或存在硬阻断为 `BLOCK`。
- 缺少执行授权、严重图文不符、低于价格底线、负利润、必填属性缺失、高知识产权风险、重复提交和严重外部警告均失败关闭；证据不足不会由模型常识或默认值补成通过。
- `ProductLaunch` 发布确认后签发最长 5 分钟、绑定精确 `action:ozon.listing.publish` scope 与快照哈希的一次性授权；数据库只保存 SHA-256 哈希，明文仅进入内部 BullMQ 作业，不返回前端或审计日志。
- Worker 在 Ozon 预检、领取提交账本和外部请求之前验证授权；授权缺失、过期、已消费、scope 或快照不匹配均返回 `PUBLISH_EXECUTION_GRANT_INVALID`。
- `ExternalSubmissionsService` 在同一租户数据库事务中原子消费授权并把提交状态从 `CLAIMED` 推进到 `REQUEST_SENT`；任一步失败会同时回滚，避免“令牌已消费但请求未登记”或“账本已推进但授权未消费”。
- 发布准备和队列失败路径会清除陈旧授权字段；不完整外部成功继续进入恢复/对账状态，不会冒充 `COMPLETED`。
- 新增迁移 `20260715200000_add_product_launch_publish_grants`；本地后端镜像重建后共识别并应用 83 个迁移，数据库 schema 最新。
- 容器数据库已核实 5 个授权字段真实存在：`publishExecutionGrantHash`、`publishExecutionGrantScope`、`publishExecutionGrantSnapshotHash`、`publishExecutionGrantExpiresAt`、`publishExecutionGrantConsumedAt`。
- 本轮没有调用批准、发布、改价、库存或图片生成接口；部署后最近 15 分钟 `external_submissions` 新增记录为 0。

### Prisma 迁移治理与 v1-baseline

- 保留并冻结当前 83 条历史迁移，冻结边界为 `20260715200000_add_product_launch_publish_grants`；`prisma/migration-governance.json` 记录每个 `migration.sql` 的 SHA-256，历史迁移被修改、删除、重复注册或未登记时均阻断。
- `v1-baseline` 来自第 83 条迁移执行后的真实 PostgreSQL `public` 结构，只包含 schema，不包含业务数据、`_prisma_migrations`、建库语句或 psql 客户端元命令；baseline SQL 与 Prisma introspection 快照均固定哈希。
- 数据库漂移以“目标数据库对完整迁移历史”为权威，避免为了让 `schema.prisma` 表面零差异而误删 RLS、检查约束、表达式索引和数据库专用索引。
- 新迁移必须挂靠当前 OPEN release `v1.1-schema-governance`，并提交 `metadata.json`、`rollback.sql` 及三份文件的不可变哈希；CI 与运行镜像禁止 `migrate dev`，只允许 `migrate deploy`。
- CI 已配置目标库、独立 shadow 库和独立 baseline 空库三套 PostgreSQL 门禁：完整迁移回放、现网结构漂移、baseline SQL 执行与 baseline 结构漂移分别验证，不能由同一数据库自证。
- 运行镜像包含只读失败报告、迁移历史漂移和受控 baseline 接管脚本；接管必须同时提供 `--apply --baseline v1-baseline` 与 `MIGRATION_BASELINE_APPLY=1`，结构不一致或迁移历史非空时在写入前阻断。
- 隔离空库验收：完整 `migrate deploy` 应用 83 条迁移且漂移为 0；baseline SQL 创建 83 张业务表且漂移为 0；baseline 接管生成 83 条已完成迁移历史、部署当前 release 后漂移为 0。
- 负向验收：对当前已有 83 条历史的业务库执行 baseline 接管，被 `Baseline resolve requires an empty migration history; found 83 records` 明确拒绝；当前失败迁移扫描结果为 0。
- 后端镜像重建与重启前后 `external_submissions` 总数均为 0，未触发任何 Ozon 或其他平台写入。

## P1 验收

- `AppModule` 已收缩为 `CoreModule`、`PlatformModule`、`FeaturesModule`、`HealthModule` 四个稳定组合边界，根模块不再直接注册数据库、队列、Agent、Worker、Guard、Interceptor 或 Middleware。
- `CoreModule` 统一承载环境校验和基础设施；`HttpPlatformModule` 固定认证、限流、角色 Guard 顺序及 Trace/Metrics Interceptor；`AgentRuntimeModule` 隔离 Event Bus、队列、SSE、Agent 与 Worker 运行时。
- `main.ts` 仅保留 Nest 应用创建、HTTP 装配调用、监听和启动失败收口；HTTP 细节已提取为可测试装配函数，原有 50 MB body/raw body、全局校验、异常过滤、Helmet、Cookie、CORS、Swagger 和 Trace 响应头行为保持不变。
- 已启用 `SIGTERM`/`SIGINT` shutdown hooks。真实容器 `SIGTERM` 演练退出码为 0，随后恢复 `healthy`；演练前后 `external_submissions` 增量为 0。
- 新增根模块结构契约与 HTTP 装配测试，锁定顶层依赖、Guard/Interceptor/Middleware 顺序、优雅停机和 CORS/Trace 头，防止职责重新回流到根模块。
- 已实现可归因 `FeedbackSignal`、`AgentEvalSnapshot`、`PromptVersion`、`RouterDecisionLog`、`TrainingJob` 和业务结果归因。
- 反馈、评估、Prompt 版本、路由决策和业务结果均绑定组织和真实 Agent run。
- Prompt 采用 `DRAFT -> CHALLENGER -> CHAMPION/RETIRED`，灰度上限 5%，禁止自动直推生产。
- 模型路由和 Prompt 更新不会根据单次结果自动改写；生产切换必须人工执行。
- 新增前端 `Agent 质量中心`：无样本显示“无样本”，不会用 0 分冒充质量结论。

## P2 验收

- `/api/v1/ready` 检查数据库、Redis、任务队列、文件存储和 Python Agent readiness。
- Python Agent 新增 `/api/live`、`/api/ready`、Worker heartbeat、容量和活动 lease 快照。
- Prometheus 增加队列、错误预算和 SLO 记录规则；Alertmanager、OpenTelemetry Collector、Jaeger、Grafana 配置可通过官方校验器。
- Kubernetes 增加 startup/liveness/readiness probes、PDB、HPA 和安全发布脚本。
- 前端企业验收页每 30 秒读取真实 readiness、队列堆积和最近失败任务；当前如实显示历史失败数 1。
- 请求链已注入 `requestId`、组织、用户、Agent run、审批和发布尝试关联属性。

## 自动化验证证据

| 范围 | 结果 |
|---|---|
| 后端 Jest | 108 个 suite 通过，1 个条件跳过；701 个测试通过，2 个跳过 |
| 根模块与 HTTP 装配专项 | 4 个 suite、15 个测试通过；覆盖顶层模块边界、运行时隔离、Guard/Interceptor/Middleware 顺序、CORS/Trace 头和优雅停机注册 |
| Prisma 迁移治理专项 | 6 个测试通过；覆盖历史哈希篡改、未登记迁移、缺失 release 元数据/回滚、部署入口误用 `migrate dev` 和 CI 缺失 baseline 门禁 |
| 审批令牌与发布门禁专项 | 7 个 suite、69 个测试通过；覆盖单次消费、重放拒绝、精确 scope、哈希脱敏、旧发布别名阻断和 ProductLaunch 快照链 |
| 发布安全 v2 与 Worker 授权专项 | 6 个 suite、42 个测试通过；覆盖 8 维评分、v2 真实证据、v1 只读、令牌缺失前置阻断、原子消费、事务回滚和重放拒绝 |
| Agent Trace 专项回归 | 后端 5 个 suite、45 个测试通过；Python 57 个测试通过 |
| 自动化 Trace 专项回归 | 4 个 suite、27 个测试通过；覆盖手动触发、定时调度、Worker 可信 Trace、重试与死信载荷 |
| Ozon 发布账本专项回归 | 4 个 suite、30 个测试全部通过；覆盖并发领取、请求前释放、请求后未知、只读回查和调用顺序 |
| RLS 静态与真实数据库探针 | 直接租户表覆盖无缺口；4 张间接租户子表跨组织读写被阻断、本组织读写正常 |
| Python Agent pytest | 669 个测试通过，另有 7 个子测试通过；33 个 Pillow 弃用警告 |
| Python Agent 工具边界专项 | 41 个测试通过；覆盖写入能力排除、严格输入、可信组织上下文、最大计划步数、重试预算、审计和代理失败关闭 |
| 前端 lint | 通过 |
| 前端生产构建 | 通过 |
| 前端认证单测 | 3 个通过 |
| 后端 lint / build | 全源码 `lint:check`、发布级门禁与生产构建均通过 |
| Prisma 迁移 | 83 个迁移已应用且失败迁移为 0；`v1-baseline`、迁移哈希冻结、release 元数据/回滚、完整空库回放、独立 baseline 空库和 migration-history drift 门禁均通过 |
| Prometheus 规则与配置 | 官方 `promtool` 校验通过 |
| Alertmanager | 官方配置校验通过 |
| OpenTelemetry Collector | `validate` 通过 |
| Docker Compose | 配置解析通过 |
| k6 脚本 | 两个脚本 `inspect` 通过；未对真实环境执行写入型压力测试 |
| Git 差异检查 | `git diff --check` 通过 |

## 本地运行证据

- 统一入口：`http://127.0.0.1`
- Nginx 只公开 80 端口；数据库、Redis、后端和 Agent 控制面未直接暴露。
- `/api/v1/ready`：数据库、Redis、队列、存储、Python Agent 全部 `up`。
- 本地 6 个长期容器均为 `healthy`：PostgreSQL、Redis、后端、Python Agent、前端和 Nginx。
- `/api/v1/health=ok`、`/api/v1/ready=ready`；数据库、Redis、队列、存储和 Agent 均为 `up`，队列 waiting/active 均为 0。
- 最新后端镜像已重建并实际替换；健康响应包含 `x-request-id`、`x-trace-id`、`traceparent`，未认证业务路由返回 401，配置白名单 CORS 回显与凭据头正确，启动依赖装配错误为 0。
- 后端真实接收 `SIGTERM` 后停止且退出码为 0，重新启动后恢复 `healthy`；停机与启动过程均未新增外部提交记录。
- 运行库对 83 条迁移历史的漂移为 0，`_prisma_migrations` 中未完成且未回滚的失败记录为 0。
- 容器数据库已核实 `payloadHash`、`claimToken`、`claimedAt`、`responseReceivedAt`、`reconciliationResult` 字段和 9 个提交状态真实存在。
- 容器数据库已核实 ProductLaunch 的 5 个发布授权字段真实存在；最近 15 分钟 `external_submissions` 新增记录为 0。
- readiness 中 `agent-runs.failed=1` 是保留的历史 DeepSeek 400 失败任务；数据库终态与死信分类一致，后续同组织 Planner 已成功，因此不删除审计证据来伪造零失败。
- Python Agent 内部 readiness：heartbeat 新鲜、Redis 状态后端可用、容量 2、活动任务 0。
- Python Agent 已使用最新源码重建容器；运行态验证只注册 14 个只读平台工具，写入工具为 0。
- Agent 主链路真实 Trace 验收任务 `cmrlsq45100hvql01fx97onia` 已完成；HTTP、数据库、BullMQ/Python Redis 任务和生命周期回调共享 Trace ID `4bf92f3577b34da6a3ce929d0e0e4736`。
- 自动化真实 Trace 验收运行 `cmrluarqt00g5o101pe55w5es` 已完成；HTTP、PostgreSQL 与 BullMQ 共享 Trace ID `0a1b2c3d4e5f67889988776655443322`，Worker 真实返回 `completed`。
- 审批运行态探针确认：缺少不可变快照的发布请求被阻断，授权只消费一次，重放被拒绝，授权哈希未通过 API 暴露，外部提交记录为 0。
- 浏览器验证：企业验收、Agent 质量、审批中心均可打开，控制台错误 0。
- 审批详情真实显示 Ozon 商品图和链接；未点击批准、生成或发布。

## 生产阻断项

以下项目不属于本地代码可以伪造完成的验收，当前继续保持阻断：

1. 配置并验证 AWS KMS 信封加密。
2. 配置并验证 S3 Object Lock 不可变审计归档。
3. 提供有效外部渗透测试报告。
4. 使用 Stripe Live 完成真实支付与退款闭环。
5. 准备隔离的压力测试租户和授权数据，执行 k6 并保存 P95、错误率、队列和恢复证据。
6. 连接真实 Kubernetes 集群，执行滚动发布、HPA、PDB、故障注入和回滚演练。
7. 连续采集并达标 14 个完整业务日的 SLO。
8. 配置真实 Alertmanager 通知接收端并执行告警送达演练。

## 严格状态

当前平台可以作为本地受控验证环境继续测试只读研究、候选预览、Listing 沙箱、人工审核、反馈评估和任务恢复。未完成上述生产阻断项前，页面和文档都不得声明“企业级生产验收全部通过”。
