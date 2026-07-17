# 跨境电商 Agent 平台真实基线补充（v13）

> 本文是 `platform-real-baseline-2026-07-16.md` 的增量证据，不覆盖历史结论。所有数量来自本地真实 HTTP、Agent API、PostgreSQL、Redis、容器日志和浏览器页面；没有用模拟候选、默认费用或占位发布结果补齐链路。

## 当前结论

平台已能稳定完成“全球公开市场发现 → Ozon 有上限公共搜索证据 → 标准化 → 需求/竞争分析 → 利润与风控硬门禁 → 报告制品”的真实十候选批次，但完整自动上架闭环仍未通过。

本轮 10 个候选全部因费用证据和签名风控证明缺失而被拒绝；数据库中没有候选经济评估、发布任务或发布快照。该结果证明门禁按 fail-closed 工作，不证明 Ozon 发布能力可用。

## 1. v13 正常预算真实批次

- 平台 run：`cmrndwe9u00hymq01nio7dzgc`
- 远端 Agent run：`a22d8ccc049249f499cacef895e2e3df`
- 固定远端幂等键：`daily-product-research:cmrndwe9u00hymq01nio7dzgc:global-product-discovery`
- 配置版本：`daily-product-research/config-v13`
- 启动：`2026-07-16T10:46:41.742Z`
- 完成：`2026-07-16T10:51:12.527Z`
- 终态：`PARTIAL`（来源含降级缓存；不是运行失败）
- 请求候选 / 实际候选 / 短缺：`10 / 10 / 0`
- 全球发现预算：`720s`
- 实际预算耗时：`269671ms`
- 搜索：`70 / 70` 成功
- 发现概念：`10 / 10`
- 原始证据记录：`47`
- 非空证据 URL：`47`
- 唯一 URL：`47`
- 发布外部写操作：`false`

证据域分布：Google 10、Ozon 10、Walmart 10、AliExpress 10、Temu 5、Etsy 2。这里只能证明有受控公共搜索样本，不能声称覆盖任何平台的完整实时目录。

## 2. 60 秒预算负向演练

- 平台 run：`cmrndrino00fnmq01m3bowizy`
- 远端 Agent run：`bc401737facf4a2ca53e61f0cabb379d`
- 终态：`PARTIAL`
- 全球发现错误：`DISCOVERY_BUDGET_EXHAUSTED`
- 预算：`60s`
- 实际耗时：`60007ms`
- 搜索尝试 / 成功：`19 / 18`
- 本轮全球发现候选：`0`
- 复用历史已验证 Ozon 公共证据候选：`5`
- `exhaustedSources=false`
- `nullCandidateCount=0`
- 未生成伪造的 Ozon 零结果。

演练后 Agent 容器已恢复 `GLOBAL_DISCOVERY_BUDGET_SECONDS=720` 并重新确认 healthy。

## 3. 队列、并发与幂等证据

- 修复前确认同一后端进程重复注册 `platform-events` 队列，导致 `@Processor` 被发现两次。
- 统一队列注册所有权后，两个真实 daily job 只发生同毫秒原子交接，没有重叠 active lock。
- Redis `bull:daily-product-research:meta concurrency=1`。
- v13 正常批次结束后：active=0、wait=0、prioritized=0。
- v13 job `attemptsMade=1`、`attemptsStarted=1`。
- 后端日志中 job started=1、job completed=1、远端 discovery create=1。
- 远端 requestId 使用 research run id，不随 Bull 重试 attempt 改变。

审计同时确认 BullMQ 5 不执行 `defaultJobOptions.timeout`。无效字段已从 Bull options 中移除，保留为应用级 `executionTimeoutMs`；合作式 deadline 基础模块已有测试，但在 Worker 接入和真实 Redis 超时回归完成前，不能声称队列卡死恢复已经通过。

## 4. 数据库与不可变制品证据

针对 v13 正常批次直接查询 PostgreSQL：

- `product_research_runs`：PARTIAL，candidateLimit=10，topLimit=10
- `product_candidates`：10，其中 REJECTED=10
- `candidate_economics_evaluations`：0
- `product_launches`：0
- `listing_publish_snapshots`：0
- `product_research_stage_runs`：10，其中 COMPLETED=9、SKIPPED=1

本轮生成 7 个报告制品：TOP_MD、TOP_JSON、WATCHLIST_JSON、REJECTED_JSON、RISK_JSON、SOURCE_HEALTH_JSON、RUN_LOG_JSON。逐个通过 API 读取内容并重新计算 SHA-256 与 UTF-8 字节数，7/7 均与数据库的 `contentHash`、`byteSize` 完全一致。

## 5. 利润与风控结果

10 个候选的共同硬门禁包括：

- `SALE_PRICE_EVIDENCE_MISSING`
- `SUPPLIER_COST_EVIDENCE_MISSING`
- `PLATFORM_FEE_RATE_EVIDENCE_MISSING`
- `PAYMENT_FEE_RATE_EVIDENCE_MISSING`
- `AD_RATE_EVIDENCE_MISSING`
- `REFUND_RATE_EVIDENCE_MISSING`
- `RISK_EVIDENCE_MISSING`

其中多数候选还触发 `OZON_PUBLIC_SUPPLY_NOT_LOW`。每个候选均生成 `RISK_EVIDENCE_MISSING / BLOCKED / NEEDS_REVIEW` 风险记录，没有把“无风险证据”解释为低风险。

因此：通过审核 0，上架 0；没有创建虚假利润结果，也没有为了跑通链路绕过人工审核。

## 6. 前端真实页面回归

前端容器已用当前源码重新构建并达到 healthy；`http://127.0.0.1/` 返回 200。

通过真实浏览器登录 QA 账户并打开 `/daily-product-research`，页面实际显示：

- 请求候选 / 处理候选 / 批次短缺：`10 / 10 / 0`
- 配置版本：`daily-product-research/config-v13...`
- 全球发现：预算 `269671ms / 720s`、未耗尽、搜索 `70 / 70`、概念 `10 / 10`
- Ozon 缓存来源：`历史已验证缓存 / 非实时`
- 浏览器控制台 error：0

前端不再把 PARTIAL 短缺统一标成红色“运行失败”，也不再把跨平台证据全部标成 Ozon。

## 7. 回归测试

- Python Agent 全量：843 passed，7 subtests passed，0 failed；33 条为 Pillow 弃用告警。
- 后端全量（本轮 P0 修复前的稳定点）：139 suites、1061 tests passed，1 suite / 2 tests skipped，0 failed。
- 前端全量：42 / 42 passed；TypeScript、Lint、Vite build 通过。
- 队列 deadline/配置目标回归：16 tests passed。

后续对 cancel、pause/resume/stop 和 Worker deadline 的代码变更必须重新跑完整后端回归，不能复用上述旧绿灯作为新实现的证明。

## 8. 尚未通过的 P0/P1

### P0

1. 未配置可审计的真实供应商报价、完整 13 项费用证据和有效期。
2. 未配置签名风控提供方证明，候选只能进入人工审核。
3. 未验证当前 Ozon Seller API 连接的商品发布 scope、预检、提交、幂等回读和失败恢复。
4. `/stop` durable 控制状态、阶段 checkpoint、恢复和多副本 CAS 尚未实现。
5. active cancel 的状态覆盖竞态正在按红测修复；完成前“取消运行”按钮仍不通过严格验收。

### P1

1. BullMQ 应用级 deadline 尚未接入 Worker 并传播到 Agent/连接器。
2. automation scheduler 在组织 pause/stop 时仍可能领取并推进 nextRunAt。
3. 运行中的远端 Agent discovery 没有合作取消 API。
4. 完整前端按钮矩阵、图片处理、商品生成、发布失败重试仍需逐项浏览器回归。

## 9. 当前严格验收状态

- 候选商品数量：10
- 通过审核数量：0
- 已上架数量：0
- 连续真实发布闭环：0 / 3
- 结论：**未完成，继续修复 P0；禁止宣称平台已形成自动上架闭环。**
