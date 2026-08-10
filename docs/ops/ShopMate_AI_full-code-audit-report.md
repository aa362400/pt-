# ShopMate AI 全代码审计与实施结果

验收日期：2026-07-15  
执行环境：Windows 本地服务器，Docker Compose 受控内测环境  
最终结论：**本地受控内测可运行；企业生产总验收仍阻断。**

## 1. 严格结论

本轮已按审计计划完成代码修复、数据库迁移、全量测试、本地服务启动和浏览器验收。当前登录、真实 Agent 调用、Ozon 只读数据、选品证据、审批、自动化配置、MCP 工具和企业门禁页面均可工作。

平台不能标记为“企业生产已通过”，原因不是本地服务故障，而是以下外部或时间型证据尚未成立：

1. AWS KMS 真实账号控制面与加解密回读证据缺失。
2. S3 Object Lock + SSE-KMS 真实不可篡改归档证据缺失。
3. 独立第三方渗透测试报告缺失。
4. 连续 14 天 SLO 尚未完成；当前观测 3 天，通过 0 天。
5. Stripe Live 真实支付、Webhook 和退款闭环证据缺失。
6. 当前机器没有 Kubernetes context，无法完成真实集群滚动发布与故障恢复验收。
7. Alertmanager 尚无真实接收人和告警 ACK 证据。

此外，生产前仍需处置历史运行债务：当前页面显示 25 个未解决死信，累计 Agent 成功率 8.2%。这些记录不能通过删除或改状态伪造为通过。

## 2. 本轮完成的代码修复

### 2.1 Prisma、租户隔离与迁移

- 为 18 张租户表补齐 PostgreSQL RLS 覆盖和强制策略。
- 增加严格 RLS 覆盖测试，防止新增租户表漏加策略。
- 增加 `Invoice.stripeInvoiceId` 唯一约束。
- 新增 `StripeWebhookEvent` 事件账本，用于 Stripe Webhook 重放与幂等控制。
- 已部署并校验 75 个 Prisma migration，数据库 schema 为最新状态。

关键文件：

- `后端/prisma/migrations/20260715010000_enforce_tenant_rls_coverage/migration.sql`
- `后端/prisma/migrations/20260715012000_harden_stripe_webhook_idempotency/migration.sql`
- `后端/test/rls-readiness.spec.ts`
- `后端/test/billing-schema-security.spec.ts`

### 2.2 Stripe 验签与幂等

- 缺失 raw body 或签名时明确返回 400。
- 验签失败不再伪装为业务成功。
- Webhook 事件账本与业务副作用在事务中一次提交。
- 重复事件返回已处理，不重复升级套餐或创建发票。
- 删除可绕过 Stripe 的直接套餐修改入口。
- 未配置 Stripe Live 时禁用支付写入，不返回模拟成功。

关键文件：

- `后端/src/features/billing/payment.service.ts`
- `后端/src/features/billing/billing.controller.ts`
- `后端/test/payment-webhook-security.spec.ts`

### 2.3 Agent、Worker、Outbox 与 MCP

- AgentRun 使用稳定 Job ID、attempt、lease、heartbeat 和恢复扫描器。
- 终态、过期 attempt 和已认领任务均会阻止重复执行。
- Outbox 发布失败可重试，孤儿事件进入隔离，不静默丢失。
- 外部写入提交保持幂等；不确定终态禁止盲目重发。
- Python MCP 默认拒绝未登记工具和平台写入工具。
- MCP Manifest、执行文件哈希、工具集合和 Ed25519 签名已重新生成并验证。

关键文件：

- `后端/src/shared/commerce-mcp/commerce-mcp-trust.registry.ts`
- `电商设计图保持产品一致性智能体/agent/mcp_server.py`
- `电商设计图保持产品一致性智能体/agent/tests/test_mcp_tool_policy.py`

### 2.4 本地启动、恢复与运维

- 本地启动脚本会等待 Nginx 健康后再宣告成功。
- QA 用户创建改为租户事务，避免 RLS 导致部分写入。
- 灾难恢复脚本增加目标身份确认、生产环境阻断、备份校验、恢复后行数核对及 RPO/RTO 输出。
- 新增 Prometheus 规则、Alertmanager 配置和 Kubernetes 配置静态门禁。
- 新增 CloudFormation：独立轮换 KMS Key、S3 Object Lock COMPLIANCE、版本控制、SSE-KMS、TLS-only 和最小权限策略。

关键文件：

- `scripts/local-server/common.ps1`
- `scripts/local-server/start.ps1`
- `scripts/local-server/qa-user.cjs`
- `scripts/db-disaster-recovery.sh`
- `infra/aws/audit-controls.yml`
- `后端/test/ops-config-security.spec.ts`
- `后端/test/aws-infrastructure-security.spec.ts`

## 3. 真实运行证据

### 3.1 本地服务

以下 6 个容器均为 `healthy`：

- PostgreSQL
- Redis
- Python Agent
- NestJS Backend
- React Frontend
- Nginx Gateway

就绪端点：`http://127.0.0.1/api/v1/ready`  
业务入口：`http://127.0.0.1`

就绪检查实际返回：数据库、Redis、队列、存储、Agent 全部 `up`。队列保留 1 条历史失败记录，未被隐藏。

### 3.2 真实 Agent

- 已通过 API 创建并完成真实 `GENERAL_ASSISTANT` 任务。
- 运行记录使用真实 provider，输出非空，未标记 mock。
- 企业门禁识别到最近 7 天 5 条非模拟成功任务。
- 浏览器 Agent 时间线能显示创建、规划、工具调用、执行、核验和完成状态。

### 3.3 浏览器验收

使用真实登录会话完成以下页面验收，浏览器控制台无 error/warn：

- 企业验收：准确显示通过项和阻断项，不假通过。
- 自动化流程：创建表单可打开；只允许已注册本地 Worker 步骤；外部写入继续人工确认。
- 审批中心：详情使用中文业务说明，不再直接显示原始 JSON。
- 每日精准选品：展示真实 Ozon 价格、评分、评论、抓取时间和来源链接。
- 候选无真实图片时保持空状态，不伪造图片。
- MCP 工具：45 个注册工具、45 个可用、21 个需人工确认；签名与哈希通过。
- AI Agent 中心：真实运行时间线、模型连接、回调、队列和安全闸可见。

选品样本实际展示：1465 RUB、4.9 stars、17006 reviews、抓取时间和 Ozon 来源。由于仅有单一官方索引来源且缺采购/物流成本，系统正确淘汰，没有生成假报告。

## 4. 自动化测试证据

- 后端 Jest：101 个测试套件通过，1 个跳过；634 个测试通过，2 个跳过。
- 后端 ESLint：通过。
- 后端 Nest build：通过。
- Prisma validate：通过。
- Prisma migrate status：75 个 migration，数据库已是最新状态。
- 前端 oxlint：通过。
- 前端 TypeScript + Vite 生产构建：通过，2486 个模块。
- Python Agent pytest：655 passed，7 subtests passed。
- Python 告警：33 个 Pillow 未来弃用警告，不影响当前通过结论，但应在 Pillow 14 前迁移 `getdata()`。
- CloudFormation：YAML 解析与 `cfn-lint` 通过。
- Kubernetes Kustomize、Prometheus 与 Alertmanager 静态配置测试通过。
- `git diff --check`：无空白错误，仅存在仓库既有 LF/CRLF 提示。
- 本地启动验证：`PASS local-server health and port isolation`。

## 5. 企业门禁实时结果

已通过：

- 真实非 Mock Agent
- MCP 信任网关
- Agent 记忆治理（63/63 具备治理元数据）
- Judge 六类业务金标（12 个样本，Ed25519 签名有效）
- Ozon 只读真实链路

未通过：

- AWS KMS：未配置真实运行证据
- S3 Object Lock：未配置真实运行证据
- 外部渗透测试：无有效报告
- 14 天 SLO：观测 3 天，通过 0 天
- Stripe Live：无实付与退款证据

企业门禁命令返回退出码 1 是正确行为，表示系统拒绝生产放行，不是测试脚本故障。

## 6. 允许与禁止的当前范围

当前允许：

- 本地受控内测
- Ozon 只读同步和诊断
- 公开证据选品
- Agent 分析和本地草稿
- 中文人工审批
- MCP 只读/本地业务工具

当前禁止自动放行：

- Ozon 发布、改价、库存、广告、退款和客服外发
- Stripe Live 收款
- 企业生产总验收通过标记
- 未经人工确认的高风险写入

## 7. 下一步严格顺序

1. 对 25 个历史死信逐条分类：可重试、永久失败、数据缺失、供应商失败；不得直接删除。
2. 连续采集每日 SLO，直到完整 14 天且每日达标。
3. 在真实 AWS 账号部署模板，执行 KMS 加解密和 Object Lock 不可删除回读验收。
4. 配置真实 Alertmanager 接收人，完成测试告警、送达、确认和恢复闭环。
5. 在真实 Kubernetes 集群执行滚动发布、Pod 故障、Worker 重启和任务恢复验收。
6. 使用 Stripe Live 小额实付与退款完成签名、账本和回读证据。
7. 委托独立第三方渗透测试并归档报告。

只有以上门禁全部提供新鲜、可验证证据后，才允许把平台状态从“本地受控内测”改为“企业生产验收通过”。
