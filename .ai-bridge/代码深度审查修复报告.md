# ShopMate AI 代码深度审查修复报告

> 审查阶段：阶段 2.1 至 2.4 第一轮，聚焦 Agent 核心链路、MCP、任务队列、权限、Python Agent Web、前端控制台与生产部署
>
> 审查日期：2026-07-12
>
> 工作区：`G:\平台`
>
> 结论：**当前版本不建议直接进入生产上线。** Agent 与 MCP 的主体架构有较好的模块化基础，但存在多条可组合成真实事故的 P0 链路，主要集中在生产配置、租户身份、任务失败语义、文件路径、SSRF、超时状态机和服务凭证边界。

## 1. 报告边界与可信度说明

本轮按行读取并追踪了以下核心路径及其直接调用链：

- NestJS Agent Provider、AgentRun、BullMQ Worker、权限、代理、记忆、Webhook
- 本地 Commerce MCP 客户端与 Python MCP Server
- Python Agent Integration API、JobQueue、文件存储、URL 下载、Planner、工具注册表
- React API 客户端、鉴权上下文、路由、SSE、MCP 控制台
- Prisma 中 AgentRun、多租户关系与相关索引
- `docker-compose.prod.yml`、Agent Dockerfile、Nginx 生产路由

本报告不是对整个仓库所有业务模块的最终审查结论。它是 Agent 核心链路与 MCP 第一轮的正式阶段报告。后端其他业务、完整前端页面、全部 Migration、CI/CD、支付、渠道发布等仍需继续分阶段审查。

### 当前执行限制

1. 工作区处于 `handoff` 写入模式，安全策略禁止直接修改源代码。本轮只写入 `.ai-bridge` 下的审查报告和精确实施计划，没有伪造“代码已修复”的结论。
2. 工作区原本已有大量已修改和未跟踪文件。为避免覆盖用户现有开发成果，本轮没有重置、回滚或大范围格式化。
3. 测试命令尚未真正运行：
   - `pnpm test -- agent-proxy.spec.ts --runInBand` 在启动前因执行环境缺少 `/bin/bash` 失败。
   - 尝试使用 `cmd.exe` 被当前安全执行模式阻止。
   - 因此本报告中的问题来自静态调用链证据，不把环境失败写成测试失败，也不把未运行测试写成通过。

## 2. 总体评分

| 维度 | 评分 | 说明 |
|---|---:|---|
| 架构分层 | 8.0/10 | Provider、队列、权限注册表、Review、Memory 分层清晰 |
| 多租户安全 | 4.0/10 | 多处调用方可提交 `orgId`、`actorId`、`workspaceId`，缺少归属校验 |
| 任务可靠性 | 4.5/10 | BullMQ 重试被吞异常绕过，Python 超时可被迟到线程覆盖 |
| MCP 安全 | 4.5/10 | 工具白名单基础存在，但服务端缺少真实 Schema 与路径边界 |
| Agent 自主执行安全 | 4.0/10 | Planner 只靠提示词限步，无统一副作用元数据与预算 |
| 可观测性 | 6.5/10 | 有指标、审计与健康状态，但关键跨服务状态会互相矛盾 |
| 生产配置 | 3.0/10 | 生产 Compose 默认导致 Mock、对接 API 禁用、运行目录未持久化 |
| 测试设计 | 6.0/10 | 测试量较大，但关键安全边界和并发状态机存在明显空洞 |

**Agent/MCP 第一轮生产就绪度：4.6/10。**

## 3. 上线阻断项总览

| 编号 | 等级 | 问题 | 主要影响 |
|---|---|---|---|
| P0-01 | P0 | 生产 Compose 默认使后端进入 Mock，Python 对接 API 同时不可用 | 生产返回假数据或集成直接 503 |
| P0-02 | P0 | Python Agent 整站通过 `/agent/` 公网暴露，生产未配置访问口令 | 会话、图片、报告和高成本接口暴露 |
| P0-03 | P0 | `imageUrl` 存在 SSRF、重定向绕过和先下载后限长 | 内网探测、云元数据访问、内存与带宽 DoS |
| P0-04 | P0 | `session_id`、`orgId` 与持久化 `output_dir` 缺少根目录收敛 | 目录穿越、越界读写、错误打包文件 |
| P0-05 | P0 | Agent Proxy 对调用方提交的租户、操作人、Workspace 缺少一致性验证 | 跨租户污染、身份冒用、错误审计 |
| P0-06 | P0 | AgentRunWorker 吞掉异常并返回失败对象 | BullMQ 把失败任务记为 completed，重试与死信失效 |
| P0-07 | P0 | Python JobQueue 超时不能终止线程，迟到任务可覆盖 FAILED | 超时任务“死而复生”，产生重复副作用和错误状态 |
| P0-08 | P0 | Kill Switch 可跨组织指定 orgId，且平台代理调用可绕过暂停检查 | 管理员越权或暂停功能形同虚设 |
| P0-09 | P0 | 单个全局 Agent API Key 同时保护全部租户的代理、记忆与控制面 | 单密钥泄露导致全组织读写爆炸半径 |
| P0-10 | P0 | 高风险审批执行缺少原子抢占 | 并发确认可重复执行发布、调价或外部 CLI 动作 |

## 4. P0 详细问题

### P0-01：生产环境会进入“假成功”组合

**证据**

- `后端/src/agents/agent.module.ts:15-26`：只有同时配置 `AGENT_BASE_URL` 和 `AGENT_API_KEY` 才使用真实 Provider，否则自动返回 `MockAgentProvider`。
- `docker-compose.prod.yml:67-70`：后端 `AGENT_API_KEY` 使用 `${AGENT_API_KEY:-}`，允许空值。
- `docker-compose.prod.yml:99-115`：Python Agent 服务没有注入 `AGENT_API_KEY`。
- `电商设计图保持产品一致性智能体/agent/web/routes/integration.py`：未配置 Agent Key 时，对接 API fail closed 并返回不可用。

**事故链**

```text
生产未设置 AGENT_API_KEY
  -> NestJS 选择 MockAgentProvider
  -> 用户得到结构完整但不真实的 AI 结果
  -> Python /api/v1/agent/* 因无 Key 返回 503
  -> 健康、业务结果与真实能力互相矛盾
```

**修复**

- 生产 Compose 两端都使用 `${AGENT_API_KEY:?AGENT_API_KEY must be set}`。
- 增加 `AGENT_ALLOW_MOCK=false` 或等价配置，`NODE_ENV=production` 时禁止自动 Mock。
- Python 的 `COMMERCE_AGENT_MOCK` 在生产必须强制关闭。
- Health 响应必须把 Mock 视为 degraded 或 failed，而不是普通可用。

### P0-02：Python Agent Web 在生产栈中默认公网裸露

**证据**

- `电商设计图保持产品一致性智能体/Dockerfile:43-44`：服务监听 `0.0.0.0:8080`。
- `电商设计图保持产品一致性智能体/agent/web/app.py:338-379`：`WEB_ACCESS_PASSWORD` 未配置时，访问保护完全不启用。
- `docker-compose.prod.yml:99-123`：Agent 服务未设置 `WEB_ACCESS_PASSWORD`。
- `nginx/nginx.conf:74-87`：整个 `/agent/` 转发给 Python Agent。

**影响**

- 会话列表、消息时间线、黑板、报告、图片和 ZIP 可能被公网访问。
- `/api/commerce-agent/`、生图与导出端点的业务成本和数据面暴露。
- Python 内存限流只能缓解部分请求，不能替代身份认证。

**修复**

- 最优方案：生产 Nginx 不公开完整 Agent Web，只公开必须的签名媒体 URL。
- 过渡方案：强制访问认证、Secure/HttpOnly/SameSite Cookie、独立 Agent 限流和租户会话隔离。
- 生产启动时若公开 `/agent/` 但缺认证配置，应直接失败。

### P0-03：远程图片下载存在 SSRF 与资源耗尽

**证据**

- `agent/common/fetch_url.py`：只检查 `http/https`，没有拒绝 localhost、私网、link-local、保留地址和云元数据地址。
- 跳转后目标没有重新验证。
- 图片和页面内容先完整读取或拼接到内存，之后才做 15MB 判断。
- OG 图片 URL 会触发第二次未经地址策略校验的请求。
- `agent/web/routes/integration.py` 的 `imageUrl` 可进入该下载链路。

**影响**

- 访问 `127.0.0.1`、容器内服务、Redis/Postgres 管理面、云元数据。
- DNS rebinding 或重定向绕过首个 URL 检查。
- 超大或无结束响应造成内存、带宽和线程池耗尽。

**修复**

- 每次请求前解析全部 A/AAAA，拒绝 private、loopback、link-local、reserved、multicast、unspecified。
- 每次重定向重新执行地址验证并限制跳转次数。
- 使用流式读取，超过上限立即中止，不得完整下载后再判断。
- 验证 Content-Type，并使用 Pillow `verify()` 与允许格式白名单确认真实图片。
- 本地文件导入使用 `realpath`，阻止符号链接逃逸。

### P0-04：Session 与输出目录缺少统一文件系统边界

**证据**

- `agent/mcp_server.py`：`session_id` 直接进入输出目录拼接，导出工具会读写磁盘。
- `agent/web/routes/integration.py`：调用方 `orgId` 被截断后直接嵌入 session ID，没有字符白名单。
- `agent/web/services/image_store.py:11-30`：`session_output_dir()` 直接使用 session ID，并信任 `blackboard.json` 中的 `output_dir`。
- `agent/web/services/session_store.py:10-45`：`sid` 直接进入文件名。
- `agent/web/routes/sessions.py:74-79,113-119`：`sid` 直接参与 blackboard 路径。

**影响**

- `../`、绝对路径、Windows 分隔符等可逃逸运行目录。
- 被污染的 blackboard 可把后续图片扫描、ZIP、导出带到任意目录。
- Session 消息和报告可能越界读写。

**修复**

- 只允许有界长度的 `[A-Za-z0-9_-]` Session ID。
- 所有路径统一使用 `realpath + commonpath` 的 `safe_join()`。
- 持久化 `output_dir` 必须重新验证位于 runtime 根目录，不能直接信任。
- 为路径攻击写跨平台测试，覆盖 `/`、`\\`、绝对路径、编码变体和符号链接。

### P0-05：Agent Proxy 可冒用操作人与租户上下文

**证据**

- `后端/src/features/agent-proxy/agent-proxy.controller.ts`：公开代理只校验全局 API Key，调用方可提交 `orgId`、`actorId`、`workspaceId`。
- 控制器没有先确认 actor 是该组织的 ACTIVE Membership，也没有确认 Workspace 属于同一组织。
- `resolveActorForOrg()` 会在 actor 无效或缺失时回退到该组织第一个活跃成员。
- 构造的代理用户曾硬编码为 OWNER。

**影响**

- 请求可以被记录成无辜用户执行。
- 不同组织和 Workspace 的数据可能在同一 Agent 任务中混用。
- 审计日志看起来完整，但身份事实错误，形成“漂亮的假证据”。

**修复**

- 公开代理必须要求 actorId。
- 在任何权限判断、队列提交、MCP 或外部写入前校验：
  - Membership 的 `organizationId + userId + ACTIVE`。
  - Workspace 的 `id + organizationId`。
- 公开代理不得用回退成员替代请求操作人。
- 角色来自真实 Membership，不得伪造 OWNER。

### P0-06：BullMQ 失败语义被 Worker 吞掉

**证据**

- `后端/src/shared/queue/queue.module.ts`：`agent-runs` 已配置 attempts=3 和指数退避。
- `后端/src/workers/agent-run.worker.ts:125-154`：捕获 Provider 异常后写 DB FAILED，但返回 `{ status: 'failed' }`，没有重新抛出。
- BullMQ 会把正常返回视为 completed，因此不会触发 retry、`@OnWorkerEvent('failed')` 或死信逻辑。
- 现有 `agent-run-worker.spec.ts` 还把该错误行为写成预期。

**影响**

- 数据库显示 FAILED，BullMQ 显示 completed。
- 网络抖动、429、502、503 等临时错误不会重试。
- Dead-letter 与告警无法得到真实失败任务。
- completed 事件和失败指标互相冲突。

**修复**

- 可重试错误必须 reject/throw，让 BullMQ 控制 attempts 与 backoff。
- 明确不可重试错误使用 `UnrecoverableError` 或等价机制，但仍进入 failed 事件和审计。
- 只在最终失败时写 finishedAt 和死信，重试中使用 RETRYING 或 attempt 信息。
- 失败指标只能在一个权威位置计数，避免 process catch 与 onFailed 双记。

### P0-07：Python JobQueue 的超时不会停止任务

**证据**

- `agent/web/services/job_queue.py:196-224`：图片任务在嵌套 ThreadPoolExecutor 中执行，`wait(timeout=900)` 后只把任务标记 failed。
- Python 线程不能被强制终止。
- 退出 `with ThreadPoolExecutor(...)` 时还会等待正在运行的 Future。
- 原 `_execute()` 继续执行后，可在 `:254-271` 把同一 Job 改为 completed，并发送 completed Webhook。

**影响**

- 超时任务继续消耗模型额度和 CPU。
- FAILED 可被迟到结果覆盖成 COMPLETED。
- 调用方可能重新提交，原任务同时继续执行，形成重复副作用。

**修复**

- 将不可取消的长任务放入可终止进程或外部 Worker。
- 至少增加 lease/generation token 与 CAS，超时后所有旧执行器的迟到写入失效。
- 超时、完成、失败写入必须是原子状态迁移。

### P0-08：Kill Switch 存在跨组织控制与绕过

**证据**

- `后端/src/shared/agent-permissions/agent-kill-switch.controller.ts:36-72`：ADMIN 可以在 body/query 中提交任意 `orgId`，没有绑定当前 JWT 用户组织。
- `后端/src/shared/rbac/roles.guard.ts:27-28`：角色精确匹配，OWNER 不继承 ADMIN。
- Python 动态工具通过 `common/proxy_client.py` 直接调用 `/agent-proxy`，该代理路径没有统一检查 pause flag。

**影响**

- 某租户 ADMIN 可能暂停或恢复其他组织。
- 本组织 OWNER 反而可能不能操作 Kill Switch。
- UI 显示已暂停，但动态平台代理工具仍可执行。

**修复**

- pause/resume/status 使用当前 JWT `orgId`，不接受任意目标组织。
- 明确允许 OWNER、ADMIN。
- `/agent-proxy` 和所有 Agent 执行入口必须统一检查 kill flag。
- Kill Switch 应位于执行边界，不是只位于“权限查询”端点。

### P0-09：单一共享服务密钥的爆炸半径过大

**证据**

同一 `AGENT_API_KEY` 被用于：

- Agent Proxy 调用
- Agent Memory 读写、经验学习、readiness 计算
- 权限查询、动作列表、自治检查
- Python 向平台读取经验卡与注册动态工具

相关文件包括：

- `后端/src/features/agent-proxy/agent-proxy.controller.ts`
- `后端/src/features/agent-memory/agent-memory.controller.ts:29-113`
- `后端/src/shared/agent-permissions/agent-kill-switch.controller.ts:75-140`
- `agent/common/proxy_client.py`
- `agent/common/permission_client.py`

**影响**

- 任意一端日志、环境、容器或进程泄露密钥后，可以自行选择任意 organizationId。
- 读、写、控制面和高风险动作使用同一信任根，无法最小授权和单租户吊销。

**修复**

- 迁移到短期签名服务身份：JWT/HMAC timestamp+nonce 或 mTLS。
- Token 必须绑定 `audience`、`org`、`actor`、`action`、过期时间和 nonce。
- 各服务权限拆分，记忆读写、代理执行、控制面使用不同 scope。
- 共享密钥比较统一改为恒定时间比较，但这只能减少时序风险，不能解决架构爆炸半径。

### P0-10：审批执行缺少原子抢占

**证据**

- `后端/src/features/notifications/notifications.service.ts` 的确认执行流程先读取待处理状态，再执行外部动作，最后更新 decision。
- 读取与副作用之间没有数据库条件更新、执行中状态或分布式锁。

**影响**

两个并发 execute 请求可能同时看到 PENDING，并重复执行：

- Ozon 发布
- 价格修改
- 外部 CLI/MCP 写入
- 其他付费或不可逆动作

**修复**

- 先用条件更新原子抢占 `PENDING -> EXECUTING`，只有一个请求成功。
- 外部动作使用独立 idempotency key。
- 成功后更新 EXECUTED，失败进入 FAILED_RETRYABLE/FAILED_FINAL。
- 添加并发回归测试，证明两个并发确认只产生一次外部调用。

## 5. P1 高优先级问题

### P1-01：创建 AgentRun 与入队不具备原子可靠性

- `后端/src/features/agent-runs/agent-runs.service.ts:43-55` 先写 DB，再 `queue.add()`。
- 队列失败会留下永久 PENDING 孤儿。
- 建议使用事务 Outbox，或失败时明确标记 ENQUEUE_FAILED 并由补偿任务重投。

### P1-02：任务缺少端到端幂等键

- AgentRun 没有 `idempotencyKey`。
- `queue.add()` 未指定稳定 `jobId`。
- Python JobQueue 对相同 `agentRunId` 会永久复用已落盘终态 Job。
- 低分“重新生成”继续使用同一 AgentRun 时，可能只返回旧结果，根本没有重跑。

建议引入：

```text
organizationId + clientRequestId
agentRunId + attempt
agentRunId + regenerationId
```

### P1-03：Workspace 与 Organization 的一致性只靠应用约定

- Prisma 同时保存 `organizationId` 和 `workspaceId`，但两个外键分别成立并不代表 Workspace 属于该 Organization。
- `AgentRunsService.create()` 没有验证 dto.workspaceId 的组织归属。
- 建议服务层统一 `requireWorkspace(orgId, workspaceId)`；核心表考虑复合约束或结构调整。

### P1-04：MCP Schema 只是说明书，没有运行时执行

- `agent/mcp_server.py` 广告 JSON Schema，但 `tools/call` 未真正校验。
- `agent/agents/tools_registry.py:15-33` 保存 `input_schema`，调用时直接 `fn(**kwargs)`。
- `CommerceMcpClientService.callTool()` 参数仍是 `Record<string, unknown>`。

建议：服务端为权威验证者，拒绝额外字段、超长文本、越界数值和超大数组；Node 端再做入口级 Zod 验证。

### P1-05：Planner 的安全规则只存在于提示词

- `agent/agents/planner.py:28-66` 说最多 6 步，但 `decompose_goal()` 不强制截断或拒绝。
- `execute_plan()` 可执行全局注册表中的任何工具。
- 失败后无条件重试一次，包括未来写入工具。
- `global_context` 会合并到每个工具输入。

建议：代码层限制步骤、依赖图、工具 allowlist、输入大小、预算和副作用审批；只重试明确幂等读取工具。

### P1-06：远程 Agent HTTP 请求缺少连接级保护

- `后端/src/agents/http-agent.provider.ts:84-109` 的 `fetch` 无 AbortSignal、连接超时、重试和熔断。
- 15 分钟轮询超时只停止 Node 轮询，不取消远端任务。
- 建议每个请求设置超时，按错误分类退避重试，加入熔断和远端 cancel。

### P1-07：生产持久化目录与应用真实目录不一致

- `agent/web/app.py:203-215` 默认使用 `agent/web/runtime/{uploads,outputs,sessions,jobs}`。
- `docker-compose.prod.yml:110-115` 挂载的是旧目录 `agent/outputs`、`agent/web/sessions`、`agent/web/uploads`，也没有挂载 jobs。
- 容器替换后任务状态、会话和产物可能消失。

建议将整个 `/app/agent/web/runtime` 作为受控持久卷，并做容器重建回归验证。

### P1-08：Nginx Agent 路由与静态正则冲突

- `nginx/nginx.conf:75-87` 的 `/agent/` 不是 `^~`。
- `:91-101` 的全局图片静态正则可能抢走 `/agent/api/image/...jpg`，把请求转到 frontend。
- 建议使用 `location ^~ /agent/`，并为 Agent 单独配置限流、缓存、超时和认证。

### P1-09：前端令牌存储扩大 XSS 后果

- `智能体前端/src/api/client.ts` 把 access token 和 refresh token 都放在 localStorage。
- 任意 XSS 可长期接管会话。
- 建议 refresh token 使用 HttpOnly、Secure、SameSite Cookie；access token 放内存并短期轮换。

### P1-10：前端丢失角色上下文，敏感页面没有角色门禁

- `/auth/me` 返回 role/orgId，但 `AuthContext` bootstrap 时没有完整保留。
- `ProtectedRoute` 只检查登录。
- `/mcp-tools`、`/audit-logs`、`/billing` 等入口对所有登录用户可见。
- 前端门禁不是安全边界，但必须与后端 OWNER/ADMIN 规则一致，减少误操作和信息暴露。

### P1-11：MCP 控制台允许执行服务端已判定不允许的动作

- `McpToolConsole.tsx` 可以选择 `permission.allowed=false` 的 action。
- 执行按钮没有因拒绝状态禁用。
- 应在 UI 禁用并展示拒绝原因，后端仍需再次校验。

### P1-12：API Key 通过子进程命令行传递

- `agent/agents/toolkit.py:69-76,104-112` 把 `--api-key` 放进 argv。
- 同机进程列表、诊断工具、崩溃采集可能读取参数。
- 应通过环境、stdin 或受限文件描述符传递，并避免在日志打印完整命令。

## 6. P2 中优先级问题

| 编号 | 问题 | 位置与建议 |
|---|---|---|
| P2-01 | 远程 JSON 只做 TypeScript 断言 | `http-agent.provider.ts:108`，使用运行时 Schema 校验所有 RemoteRun 和业务结果 |
| P2-02 | 日志可能包含产品名、关键词和目标 | Provider、Planner、Worker 日志只记录 ID 与摘要，敏感内容放受控 debug |
| P2-03 | 审计记录完整 params 可能含 base64/凭证 | Agent Proxy 审计加入字段级脱敏和大小上限 |
| P2-04 | 本地 MCP 每次调用启动 Python | 批量调用会进程风暴，改常驻 MCP Gateway 或受控 Worker 池 |
| P2-05 | MCP 只读取 stdout 第一条非空行 | 服务日志可能破坏协议，协议 stdout 与日志 stderr 必须严格分离 |
| P2-06 | Session JSON 写入非原子且无锁 | `session_store.py:40-45` 使用临时文件、`os.replace` 与 session 级锁 |
| P2-07 | Python RateLimiter 键永不删除 | `security.py:13-28`，配合伪造 XFF 可无限制造 key，增加 TTL 清理和最大键数 |
| P2-08 | `_client_ip()` 信任用户 X-Forwarded-For | 只信任受控反向代理，Nginx 覆盖而非追加外部 XFF |
| P2-09 | CircuitBreaker 成功不会清连续失败 | `common/resilient.py` 在 CLOSED 成功后清零，HALF_OPEN 只允许单探针 |
| P2-10 | RateLimiter 上下文忽略 acquire 失败 | 获取失败必须抛出限流异常，不能继续执行 |
| P2-11 | Webhook 可重放 | 在签名内容加入 timestamp/nonce，并校验时间窗与 nonce 去重 |
| P2-12 | SSE 无重连和结构校验 | 加 401 刷新、退避、heartbeat、Last-Event-ID、事件 Schema 和缓冲上限 |
| P2-13 | AgentRun 物理删除 | 改软删除或归档，保留成本、审计和事故调查证据 |
| P2-14 | AgentRun 缺少组合索引 | 按实际查询增加 `(organizationId, createdAt)`、`(organizationId,status,createdAt)` |
| P2-15 | Judge 与证据原则矛盾 | 趋势真实结果把 growth 置空，但 Judge 提示奖励具体增长数字，应改为奖励证据完整性 |

## 7. 已确认的良好设计

审查不是只找裂缝。以下设计值得保留：

1. **Agent Provider 抽象清晰**：`AgentProviderInterface` 覆盖聊天、Listing、关键词、调研、趋势、图片、自动化与 Planner，便于替换 Provider。
2. **Agent 健康快照结构较完整**：包含连接、集成、Mock、延迟、LLM 状态、模型和配额状态，且 Health 请求有 5 秒超时。
3. **本地 MCP 基础资源保护存在**：有执行超时、stdout 1MB、stderr 256KB 上限，`shell:false`。
4. **BullMQ 已配置重试与指数退避**：问题在 Worker 吞异常，不在队列配置本身。
5. **AgentRun 查询有组织过滤**：列表和单条查询使用 organizationId 约束。
6. **工作记忆失败不阻塞主任务**：`recordWorkMemory()` 独立捕获错误，避免附属能力拖垮主流程。
7. **图片一致性 Review 思路正确**：真实 consistencyScore 才创建审核，避免凭空造分。
8. **Webhook 使用 raw body HMAC 与 timingSafeEqual**：签名实现的核心方式正确，只缺防重放和生产配置。
9. **Python Integration API 在 Key 未配置时 fail closed**：不会把未鉴权 API 静默开放。
10. **Ozon 真实调研有证据约束**：当前真实 product/trend 路径限定 Ozon，趋势归一化会删除无证据 growth。
11. **没有发现 `eval`、`exec`、不安全 Pickle、`yaml.load` 或 `shell=True` 的直接证据**。
12. **MarketplaceOrder 有组织、Provider、外部单号唯一约束**，能抑制重复同步。

## 8. 关键跨层事故剧本

### 8.1 塑料成功

```text
生产缺 Agent Key
 -> 后端自动 Mock
 -> UI 收到看起来正常的标题、价格和关键词
 -> 用户按假数据决策
 -> Python 真实对接 API 实际不可用
```

### 8.2 失败任务被队列认成成功

```text
LLM 返回 503
 -> AgentRunWorker catch
 -> DB 写 FAILED
 -> process 正常 return
 -> BullMQ completed
 -> 无重试、无 failed event、无死信
```

### 8.3 超时任务复活

```text
Python 图片任务运行超过 15 分钟
 -> Job 标记 FAILED
 -> 线程继续执行
 -> 调用方重新提交
 -> 原线程完成并覆盖成 COMPLETED
 -> 两个任务都可能产生图片和费用
```

### 8.4 跨租户身份冒用

```text
持有全局 Agent Key
 -> 提交目标 orgId + 无效 actorId + 其他 workspaceId
 -> Controller 回退到组织首个成员
 -> 以伪造 OWNER 上下文执行
 -> 审计记录到无辜用户
```

### 8.5 公网 Agent 数据面暴露

```text
Nginx 公布 /agent/
 -> Compose 未设置 WEB_ACCESS_PASSWORD
 -> 访客访问 sessions/report/image/commerce endpoints
 -> 数据泄露或高成本调用
```

## 9. 建议修复批次

### 批次 1：立即停止上线风险

- 生产强制 Agent Key，两端一致，禁止 Mock。
- 暂停公网 `/agent/` 或强制认证。
- 修复 SSRF 和 Session 路径边界。
- 修复 Agent Proxy actor/workspace/org 校验。
- 修复 Worker 抛错语义和 JobQueue 超时覆盖。
- Kill Switch 绑定当前组织，并在代理执行边界统一检查。

### 批次 2：恢复可靠的任务状态机

- AgentRun 入库与入队使用 Outbox。
- 增加 idempotencyKey、attempt、regenerationId。
- JobQueue 原子抢占、lease/CAS、终态不可逆。
- 审批执行 `PENDING -> EXECUTING` 原子更新。
- 统一 retryable/non-retryable 错误分类。

### 批次 3：MCP 与 Planner 护栏

- MCP 服务端真实 Schema。
- 工具副作用、付费、确认、幂等元数据。
- Planner 强制最多 6 步、工具 allowlist、DAG 校验和成本预算。
- 禁止自动重试写入工具。
- 利润默认假设必须明确标记 estimated，不能伪装真实价格。

### 批次 4：身份与服务间信任升级

- 全局 Key 迁移到短期、有 scope 的服务身份。
- 绑定 org、actor、action、audience、timestamp、nonce。
- Memory、Proxy、Control Plane 分离权限。
- Webhook 增加防重放和可靠投递。

### 批次 5：前端与运营可见性

- Refresh Token 改 HttpOnly Cookie。
- AuthContext 保留 role/orgId。
- 敏感路由 OWNER/ADMIN 门禁。
- SSE 重连、Schema、心跳和缓冲上限。
- 控制台禁用服务端不允许的动作。
- 展示真实/估算/Mock/证据来源标签。

## 10. 必须补充的回归测试

| 测试组 | 必须证明的行为 |
|---|---|
| Agent Proxy | actor 缺失或非 ACTIVE 成员拒绝；跨组织 Workspace 拒绝；OWNER/ADMIN 门禁生效 |
| BullMQ Worker | 临时错误 reject 并重试；最终失败进入 dead-letter；DB 与 Queue 状态一致 |
| AgentRun Service | queue.add 失败可补偿；重复 clientRequestId 只创建一个任务 |
| Notification | 两个并发确认只触发一次外部动作 |
| MCP | 目录穿越、错误类型、超长输入、额外字段、超大请求均拒绝 |
| SSRF | localhost、私网、IPv6、本机元数据、重定向私网、DNS rebinding 均拒绝 |
| JobQueue | 超时后迟到执行不能改终态；相同 key 并发只有一个 Job；显式 retry 真正重跑 |
| Planner | 超过 6 步拒绝；写工具不自动重试；未批准工具不能执行 |
| Compose | 缺 Agent Key 时 `compose config` 失败；带配置后两端鉴权一致 |
| Nginx | `/agent/api/image/x/a.jpg` 必须到 Agent，不得被 frontend 静态正则抢走 |
| Persistence | Agent 容器重建后 jobs、sessions、outputs、uploads 均保留 |
| Frontend | MEMBER/VIEWER 看不到敏感控制台；未授权动作按钮不可执行 |

## 11. 验证状态

| 检查 | 状态 | 说明 |
|---|---|---|
| 静态逐行读取 Agent/MCP 核心链 | 已完成第一轮 | 结论基于真实文件与调用关系 |
| Agent Proxy 单测 | 未执行 | 执行环境缺 `/bin/bash`，Windows 命令被安全模式阻止 |
| Worker 单测 | 未执行 | 同上 |
| Python MCP/Agent 测试 | 未执行 | 同上 |
| 后端 build/typecheck | 未执行 | 同上 |
| 前端 build/typecheck | 未执行 | 同上 |
| Docker/Nginx 运行验证 | 未执行 | 未启动生产栈 |
| 源代码修复 | 未应用 | 当前 Workspace 仅允许 handoff 写入，精确实施计划已写入 `.ai-bridge/current-plan.md` |

## 12. 本轮实际产生的文件

- `.ai-bridge/current-plan.md`
  - Agent Proxy 租户边界与角色修复计划
  - AgentRunWorker 失败语义与死信修复计划
  - Python MCP、SSRF、JobQueue、Planner、Compose/Nginx 修复批次
- `.ai-bridge/代码深度审查修复报告.md`
  - 本报告

本轮没有修改业务源文件，没有声称任何测试已通过。

## 13. 上线前硬门槛

以下全部满足后，才建议重新评估生产上线：

- [ ] 生产环境不允许自动 Mock，Agent Key 两端强制配置
- [ ] Python Agent UI 不再默认公网裸露
- [ ] SSRF、目录穿越和输出根目录边界已修复并有回归测试
- [ ] Agent Proxy 强制 actor、org、workspace 一致性
- [ ] Worker 失败会触发 BullMQ retry/failed/dead-letter
- [ ] Python 超时任务不能覆盖终态
- [ ] 低分重生成会创建真实新 attempt
- [ ] Kill Switch 绑定当前组织且无法绕过
- [ ] 高风险审批具备原子抢占和外部幂等键
- [ ] MCP 输入 Schema 在服务端真实执行
- [ ] Planner 写入/付费工具需要审批且不自动重试
- [ ] Agent Runtime 数据卷与真实目录一致
- [ ] Nginx Agent 路由、限流、认证和静态资源优先级已验证
- [ ] 后端、前端、Python 测试与构建均有可复现通过证据

## 14. 第一轮结论

Agent 与 MCP 的骨架不是推倒重来型问题。真正危险的是几条跨层链路互相咬合：生产 Mock、共享服务密钥、租户上下文回退、吞异常、假超时、路径与 SSRF。单看每个文件，它们像散落的细裂纹；连成调用链后，已经形成可以漏水的管道。

建议按本报告的五个修复批次推进，先修事实真实性、租户边界和任务状态机，再扩展自主执行能力。当前不应继续增加新的写入型 Agent Tool，直到审批、幂等、Kill Switch 和服务身份完成闭环。
