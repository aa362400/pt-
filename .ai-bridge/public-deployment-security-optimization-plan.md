# ShopMate AI 公网部署与安全优化方案

> 文档版本：v1.0
>
> 编写日期：2026-07-12
>
> 适用工作区：`G:\平台`
>
> 适用范围：NestJS 后端、React 前端、Python Agent、MCP、BullMQ、Prisma、Redis、PostgreSQL、Nginx 与 Docker Compose 生产栈
>
> 当前结论：在本文件列出的 P0 门槛完成前，不建议把完整平台直接暴露到公网。

## 1. 文档目标

本方案用于把当前可本地运行的 Agent 电商平台，收敛为可审计、可限流、可回滚、可隔离的公网生产系统。

公网部署不是简单地把端口映射出去。真正需要完成的是以下闭环：

```text
身份可信
  + 租户隔离
  + 网络收敛
  + Agent 权限护栏
  + MCP 输入边界
  + 任务幂等
  + 审批原子性
  + 可观测性
  + 容灾与回滚
```

## 2. 当前公网暴露模型

当前生产栈大致为：

```text
Internet
   |
   v
Nginx :80
   |-----------------------------|
   |              |              |
Frontend       Backend        Python Agent
React          NestJS         Flask + Agent + MCP
               |   |
               |   +-- Redis / BullMQ
               +------ PostgreSQL
```

当前主要公网风险：

1. Nginx 将整个 `/agent/` 转发给 Python Agent。
2. Python Agent 的 Web 访问口令是可选配置，未配置时整站可访问。
3. 后端和 Python Agent 的 `AGENT_API_KEY` 在生产 Compose 中没有做到双端强制配置。
4. Agent 缺少密钥时，后端可能自动切换到 Mock，形成“看起来成功但结果不真实”的塑料成功。
5. `imageUrl` 可触发服务端下载，当前需要补齐 SSRF 防护。
6. Session、orgId、output_dir 等值会参与文件路径，需要统一做根目录收敛。
7. Agent Proxy 的 actor、org、workspace 需要在执行前做强一致性校验。
8. BullMQ 与 Python JobQueue 的失败、超时、重试语义需要统一。
9. 高风险审批必须原子抢占，防止并发重复执行。
10. 单个全局服务密钥控制多个租户与多个控制面，泄露后的爆炸半径过大。

## 3. 公网目标架构

推荐目标拓扑：

```text
Internet
   |
   v
CDN / WAF / DDoS Protection
   |
   v
Nginx or Managed Load Balancer :443
   |
   |----------------------|
   |                      |
Frontend SPA          NestJS Backend API
                          |
              |-----------|------------|
              |                        |
          PostgreSQL                 Redis
              |
              +------------------------------+
                                             |
                                      Internal Agent Gateway
                                             |
                                   Python Agent Worker Pool
                                             |
                                      MCP / Model Providers
```

核心要求：

- 公网只开放 443，80 仅用于跳转到 HTTPS。
- PostgreSQL、Redis、Backend 内部端口、Python Agent、MCP 不直接映射到公网。
- Python Agent 作为内部服务存在，不公开完整 Web UI。
- 图片与 ZIP 优先放对象存储，通过短期签名 URL 访问。
- 所有 Agent 写入操作经过策略检查、预算检查、人工审批与幂等控制。

## 4. P0 公网上线阻断项

以下项目必须全部完成，才可进入公网灰度。

### P0-01：生产环境禁止自动 Mock

涉及文件：

```text
docker-compose.prod.yml
后端/src/agents/agent.module.ts
后端/src/shared/config/env.ts
电商设计图保持产品一致性智能体/agent/web/routes/integration.py
```

要求：

```yaml
AGENT_API_KEY: ${AGENT_API_KEY:?AGENT_API_KEY must be set}
AGENT_WEBHOOK_SECRET: ${AGENT_WEBHOOK_SECRET:?AGENT_WEBHOOK_SECRET must be set}
COMMERCE_AGENT_MOCK: "0"
AGENT_ALLOW_MOCK: "false"
```

应用启动规则：

```text
NODE_ENV=production 且 Agent 配置不完整
  -> 启动失败

NODE_ENV=production 且 Mock 被开启
  -> 启动失败
```

禁止逻辑：

```text
生产配置错误
  -> 自动返回 Mock 数据
```

正确逻辑：

```text
生产配置错误
  -> fail closed
  -> 健康检查失败
  -> 告警
```

### P0-02：禁止公开完整 Python Agent Web

推荐做法：

```nginx
location ^~ /agent/ {
    return 404;
}
```

公网仅保留：

- NestJS API
- 前端静态资源
- 经签名授权的媒体下载地址

若业务暂时必须保留 Python Agent 页面，则至少要求：

- 强制 `WEB_ACCESS_PASSWORD` 或更强身份认证
- Cookie 使用 `Secure`、`HttpOnly`、`SameSite=Strict`
- 独立限流区
- 禁止公开 Session 调试接口和 Blackboard
- 禁止公开未授权 ZIP 下载
- 强制 HTTPS
- 增加用户、组织和 Session 绑定

### P0-03：修复 SSRF

涉及文件：

```text
电商设计图保持产品一致性智能体/agent/common/fetch_url.py
电商设计图保持产品一致性智能体/agent/web/routes/integration.py
```

必须拒绝：

- `localhost`
- `127.0.0.0/8`
- `::1`
- RFC1918 私网
- Link-local
- `169.254.169.254`
- 保留地址
- Multicast
- Unspecified 地址
- DNS 解析后指向私网的域名
- 重定向后指向私网的 URL

下载流程必须：

1. 校验协议仅为 HTTPS，必要时允许受控 HTTP 白名单。
2. 解析全部 A/AAAA 地址。
3. 校验每个目标 IP。
4. 禁止自动无限重定向。
5. 每次重定向重新验证目标地址。
6. 使用流式读取。
7. 超过大小上限立即中断。
8. 校验 Content-Type。
9. 用 Pillow `verify()` 检查真实图片格式。
10. 限制图片像素总量，防止解压炸弹。

### P0-04：统一文件系统安全边界

涉及文件：

```text
agent/mcp_server.py
agent/web/services/image_store.py
agent/web/services/session_store.py
agent/web/routes/integration.py
agent/web/routes/sessions.py
agents/blackboard.py 或相关持久化入口
```

Session ID 建议只允许：

```regex
^[A-Za-z0-9_-]{1,96}$
```

所有磁盘路径统一通过：

```python
safe_join(root, *parts)
```

内部要求：

- 使用 `realpath`
- 使用 `commonpath`
- 禁止 `..`
- 禁止绝对路径
- 禁止 Windows 盘符逃逸
- 禁止符号链接越界
- 不信任持久化文件里的任意 `output_dir`

### P0-05：Agent Proxy 强制租户身份一致性

涉及文件：

```text
后端/src/features/agent-proxy/agent-proxy.controller.ts
后端/src/features/agent-autonomy/agent-autonomy.service.ts
后端/src/features/agent-runs/agent-runs.service.ts
```

每次执行前必须验证：

```text
actorId
  -> 是 organizationId 下 ACTIVE Membership

workspaceId
  -> 属于同一个 organizationId

action
  -> 存在于服务端工具注册表

role
  -> 来源于真实 Membership
```

禁止：

- 缺少 actorId 时自动选择组织中的其他成员
- 把代理用户硬编码为 OWNER
- 接受调用方伪造角色
- 仅依赖 TypeScript DTO 作为租户授权

### P0-06：统一 BullMQ 失败语义

当前需要避免：

```text
Provider 抛错
  -> Worker catch
  -> DB 写 FAILED
  -> Worker 正常 return
  -> BullMQ 记录 completed
```

正确流程：

```text
可重试错误
  -> throw Error
  -> BullMQ attempts + backoff
  -> 最终失败进入 failed 事件与 dead-letter

不可重试错误
  -> UnrecoverableError 或项目等价错误
  -> 不继续重试
  -> 仍进入 failed 事件与审计
```

建议错误分类：

```text
AGENT_INPUT_INVALID
AGENT_AUTHORIZATION_FAILED
AGENT_PROVIDER_TIMEOUT
AGENT_PROVIDER_RATE_LIMITED
AGENT_PROVIDER_UNAVAILABLE
MCP_TIMEOUT
MCP_TOOL_REJECTED
OUTPUT_VERIFICATION_FAILED
BUDGET_EXCEEDED
```

### P0-07：修复 Python JobQueue 假超时

禁止使用“标记超时但线程继续跑”的方案作为最终实现。

推荐方案：

- 将长任务放入可终止子进程或独立 Worker。
- 每次任务持有 leaseToken 或 generationToken。
- 状态更新采用 Compare-And-Set。
- 超时后旧执行器的所有迟到写入失效。
- 终态不可从 FAILED、TIMEOUT 改回 COMPLETED。

合法状态迁移示例：

```text
QUEUED -> RUNNING
RUNNING -> COMPLETED
RUNNING -> RETRYING
RUNNING -> FAILED
RUNNING -> TIMEOUT
RETRYING -> QUEUED
```

禁止：

```text
FAILED -> COMPLETED
TIMEOUT -> COMPLETED
COMPLETED -> RUNNING
```

### P0-08：Kill Switch 必须绑定当前组织

涉及文件：

```text
后端/src/shared/agent-permissions/agent-kill-switch.controller.ts
后端/src/features/agent-proxy/agent-proxy.controller.ts
```

要求：

- pause、resume、status 使用 JWT 中的当前 `orgId`。
- 禁止由 body/query 指定其他组织。
- OWNER 与 ADMIN 均可操作本组织 Kill Switch。
- Agent Proxy、Planner、MCP 和 Worker 执行前统一检查暂停状态。
- Kill Switch 不是 UI 功能，而是执行边界的硬阻断器。

### P0-09：审批执行原子化

涉及文件：

```text
后端/src/features/notifications/notifications.service.ts
```

推荐状态：

```text
PENDING
EXECUTING
EXECUTED
DISMISSED
FAILED_RETRYABLE
FAILED_FINAL
```

执行步骤：

1. 数据库条件更新 `PENDING -> EXECUTING`。
2. 只有更新成功的请求获得执行权。
3. 使用独立 `externalActionId` 调用外部平台。
4. 成功后写 EXECUTED。
5. 失败时按错误类型写可重试或最终失败。

必须有并发测试证明两个确认请求只执行一次外部动作。

### P0-10：缩小服务密钥爆炸半径

最终目标不应继续使用一个全局静态 Key 控制所有能力。

推荐服务身份载荷：

```json
{
  "iss": "shopmate-backend",
  "aud": "shopmate-agent",
  "orgId": "org_xxx",
  "actorId": "user_xxx",
  "action": "keyword.analyze",
  "scope": ["agent:execute"],
  "iat": 0,
  "exp": 0,
  "nonce": "unique-value"
}
```

要求：

- 短有效期
- Audience 绑定
- Action 绑定
- Organization 绑定
- Actor 绑定
- Nonce 防重放
- Scope 最小授权
- 密钥可单服务轮换

## 5. Docker Compose 公网配置基线

### 5.1 只公开 Nginx

推荐端口：

| 服务 | 容器端口 | 公网映射 |
|---|---:|---|
| Nginx | 80/443 | 80/443 |
| Frontend | 80 | 无 |
| Backend | 3000 | 无 |
| Python Agent | 8080 | 无 |
| PostgreSQL | 5432 | 无 |
| Redis | 6379 | 无 |

### 5.2 生产环境变量

```yaml
backend:
  environment:
    NODE_ENV: production
    AGENT_BASE_URL: http://agent:8080
    AGENT_API_KEY: ${AGENT_API_KEY:?AGENT_API_KEY must be set}
    AGENT_WEBHOOK_SECRET: ${AGENT_WEBHOOK_SECRET:?AGENT_WEBHOOK_SECRET must be set}
    AGENT_ALLOW_MOCK: "false"
    JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET:?required}
    JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET:?required}
    ENCRYPTION_KEY: ${ENCRYPTION_KEY:?required}

agent:
  environment:
    AGENT_API_KEY: ${AGENT_API_KEY:?AGENT_API_KEY must be set}
    AGENT_WEBHOOK_SECRET: ${AGENT_WEBHOOK_SECRET:?AGENT_WEBHOOK_SECRET must be set}
    PLATFORM_CALLBACK_URL: http://backend:3000
    COMMERCE_AGENT_MOCK: "0"
    AGENT_RUNTIME_DIR: /app/agent/web/runtime
    FLASK_DEBUG: "0"
```

### 5.3 持久化目录统一

应用真实目录与 Compose 卷必须一致：

```yaml
volumes:
  - agent-runtime:/app/agent/web/runtime
```

必须持久化：

- jobs
- sessions
- outputs
- uploads
- 必要日志

不应继续把旧目录与新 runtime 目录混合挂载。

### 5.4 容器最小权限

Agent 与 Backend 应：

- 使用非 root 用户
- 根文件系统尽量只读
- `/tmp` 使用受限 tmpfs
- 禁止 Docker Socket
- 删除不需要的 Linux capabilities
- 设置 CPU、内存和 PID 限制
- 使用只读配置挂载
- 不把密钥放入镜像层或命令行参数

示例方向：

```yaml
read_only: true
security_opt:
  - no-new-privileges:true
cap_drop:
  - ALL
pids_limit: 256
```

## 6. Nginx 公网配置基线

### 6.1 HTTPS

必须实现：

- TLS 1.2/1.3
- 80 跳转 443
- HSTS
- 安全证书自动续期
- 禁止弱密码套件

### 6.2 路由优先级

避免 `/agent/api/image/...jpg` 被静态文件正则抢走：

```nginx
location ^~ /agent/ {
    return 404;
}
```

过渡期需要代理时：

```nginx
location ^~ /agent/ {
    limit_req zone=agent_api burst=5 nodelay;
    proxy_pass http://agent;
}
```

### 6.3 请求头

Nginx 必须覆盖可信客户端 IP 头，不应原样信任用户传入：

```nginx
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Forwarded-Proto $scheme;
```

### 6.4 请求体大小

不要给所有 API 统一放宽到 50MB。

推荐：

```text
普通 JSON API：1MB
图片上传：20MB 或业务明确上限
Agent base64 API：优先取消，改 multipart 或对象存储直传
```

### 6.5 安全响应头

至少包括：

```text
Strict-Transport-Security
Content-Security-Policy
X-Content-Type-Options
Referrer-Policy
Permissions-Policy
Frame-Ancestors 或 X-Frame-Options
```

CSP 应根据实际前端资源域名生成，不建议长期使用宽松 `unsafe-inline`。

## 7. 用户鉴权优化

### 7.1 Token 存储

当前前端将 access token 与 refresh token 放在 localStorage，公网环境应调整为：

```text
refresh token
  -> HttpOnly + Secure + SameSite Cookie

access token
  -> 前端内存
  -> 短有效期
```

收益：

- 降低 XSS 窃取长期凭证的风险
- 支持服务端撤销与轮换
- 减少 Refresh Token 暴露面

### 7.2 会话安全

要求：

- Refresh Token 轮换
- Token 家族复用检测
- 登出撤销服务端 Token
- 设备与 IP 风险提示
- 重要操作重新认证
- OWNER 的高风险操作支持 2FA

### 7.3 RBAC

敏感页面和 API：

| 功能 | 推荐角色 |
|---|---|
| MCP 工具控制台 | OWNER、ADMIN |
| Audit Log | OWNER、ADMIN |
| Billing | OWNER |
| Agent Kill Switch | OWNER、ADMIN |
| 外部平台写入审批 | OWNER、ADMIN，或专用审批角色 |
| 只读报表 | MEMBER、VIEWER |

前端门禁只负责体验，后端必须再次授权。

## 8. Agent 与 MCP 公网安全模型

### 8.1 工具注册元数据

每个工具必须包含：

```ts
{
  name: 'ozon.price.update',
  effect: 'write',
  riskLevel: 'high',
  requiresConfirmation: true,
  idempotent: false,
  retryPolicy: 'never',
  requiredRoles: ['OWNER', 'ADMIN'],
  maxCallsPerRun: 1,
  billable: true
}
```

### 8.2 工具分类

```text
read
  -> 默认可自动执行

write
  -> 需要策略检查与审计

publish / payment / refund
  -> 必须人工确认
```

### 8.3 MCP 输入验证

Python MCP Server 是最终边界，必须执行真实 Schema 校验：

- 必填字段
- 类型
- 范围
- 字符串长度
- 数组长度
- 禁止额外字段
- 请求总大小
- 单行 JSON-RPC 大小
- 工具调用次数

Node 端 Zod 校验是第一道门，Python 服务端校验是权威门。

### 8.4 常驻 MCP Gateway

当前每次 MCP 调用启动 Python 进程会带来冷启动与进程风暴风险。

推荐：

```text
NestJS
  -> MCP Gateway
      -> 有界 Worker Pool
      -> 工具白名单
      -> Schema 校验
      -> 限流
      -> 超时
      -> 审计
```

### 8.5 Planner 预算

代码层强制：

- 最大 6 步
- 最大工具调用数
- 最大模型调用数
- 最大 Token
- 最大费用
- 最大执行时间
- 最大重试次数
- 最大写操作数

超过预算：

```text
PAUSED_BUDGET
  -> 输出计划摘要
  -> 等待人工批准
```

## 9. 限流与配额基线

以下数值仅作为初始基线，应根据压测和套餐调整。

| 场景 | 初始建议 |
|---|---|
| 登录 | 每 IP + 账号 5 次/5 分钟 |
| Refresh | 每会话 30 次/分钟 |
| 普通 API | 每用户 120 次/分钟 |
| AgentRun 创建 | 每用户 10 次/分钟 |
| 每组织运行中 AgentRun | 3 到 5 个 |
| 图片生成 | 每组织 1 到 2 个并发 |
| MCP 只读工具 | 每组织 30 次/分钟 |
| MCP 写入工具 | 每 Run 1 次，且需审批 |
| 导出 ZIP | 每用户 5 次/分钟 |

限流维度应组合：

```text
IP
userId
organizationId
workspaceId
action
toolName
```

不能只按 IP，否则共享出口会误伤，攻击者也能通过代理绕过。

## 10. 数据与媒体安全

### 10.1 媒体访问

推荐：

```text
浏览器
  -> 请求 NestJS 授权
  -> 获取短期签名 URL
  -> 访问对象存储
```

签名 URL 要绑定：

- 文件 ID
- 用户或组织
- 过期时间
- 下载或预览用途
- 可选 IP/设备约束

### 10.2 存储键

建议：

```text
organizations/{orgId}/workspaces/{workspaceId}/agent-runs/{runId}/...
```

避免只使用 Session ID 作为隔离依据。

### 10.3 数据保留

建议定义：

- Agent 输入保留期
- Agent 输出保留期
- 原始图片保留期
- 审计日志保留期
- Dead-letter 保留期
- 删除与归档流程

高风险操作、成本和审计记录不应直接物理删除。

## 11. 可观测性

每条 Agent 调用链建议贯通：

```text
requestId
traceId
userId
organizationId
workspaceId
agentRunId
jobId
remoteRunId
mcpCallId
approvalId
externalActionId
```

### 11.1 指标

至少监控：

- AgentRun 成功率
- P50、P95、P99 延迟
- 排队时长
- Provider 429/5xx
- 重试率
- Dead-letter 数量
- 超时数量
- MCP 工具调用量与失败率
- 每模型 Token 与费用
- 每组织并发量与预算
- Mock 使用次数
- 审批创建、通过、拒绝和重复拦截次数
- SSRF 拒绝次数
- 租户边界拒绝次数

### 11.2 告警

建议立即告警：

- 生产出现 Mock 结果
- Agent API Key 缺失
- 同一 action 重复执行
- Dead-letter 突增
- Agent 成功率低于 SLO
- 跨租户访问被拒绝
- Python Agent 重启后大量任务中断
- 模型费用异常增长
- Kill Switch 被启用

### 11.3 日志脱敏

禁止写入日志：

- API Key
- Refresh Token
- Authorization Header
- 完整 base64 图片
- 渠道访问 Token
- 2FA Secret
- 完整客户隐私数据

审计 params 应做字段级脱敏和大小上限。

## 12. 公网安全测试矩阵

### 12.1 身份与租户

- 用户 A 不能访问组织 B 的 AgentRun。
- 用户 A 不能提交组织 B 的 workspaceId。
- 非 ACTIVE Membership 不能作为 actor。
- VIEWER 不能执行 MCP Console。
- 伪造 orgId、actorId、role 不生效。

### 12.2 SSRF

- localhost 被拒绝。
- IPv4 私网被拒绝。
- IPv6 私网与 loopback 被拒绝。
- 云元数据地址被拒绝。
- 公网 URL 重定向到私网被拒绝。
- DNS 解析为私网被拒绝。
- 超大响应在到达上限时立即中断。

### 12.3 文件系统

- `../` 被拒绝。
- `..\` 被拒绝。
- 绝对路径被拒绝。
- URL 编码路径穿越被拒绝。
- Symlink 逃逸被拒绝。
- 污染的 blackboard `output_dir` 被拒绝。

### 12.4 队列

- 可重试错误触发 BullMQ 重试。
- 最终失败进入 dead-letter。
- 超时任务不能覆盖终态。
- 相同 clientRequestId 只创建一个任务。
- 低分重生成使用新 attempt，真正执行新任务。

### 12.5 审批

- 两个并发确认只产生一次外部调用。
- 已拒绝动作不能再次执行。
- 已执行动作重复请求返回幂等结果。
- Kill Switch 开启后任何新写入动作均被拒绝。

### 12.6 Nginx

- HTTP 自动跳转 HTTPS。
- `/agent/` 不公开完整 Agent UI。
- `/agent/api/image/x/a.jpg` 不被前端静态正则错误接管。
- 普通 API 与重型 Agent API 使用不同限流。
- 用户伪造的 X-Forwarded-For 不影响真实限流键。

### 12.7 容器

- 缺少关键密钥时 `docker compose config` 失败。
- 容器重建后 jobs、sessions、outputs 仍存在。
- Agent 和 Backend 以非 root 用户运行。
- PostgreSQL、Redis、Agent、Backend 不存在公网监听端口。

## 13. 发布阶段

### 阶段 A：本地与 CI 安全修复

- 完成 P0 修复
- 补回归测试
- Build、Lint、Test 全通过
- 生成 SBOM
- 扫描依赖漏洞

### 阶段 B：内网集成环境

- 仅内网访问
- 验证 Agent、MCP、Webhook、队列和对象存储
- 执行 Redis、Agent、模型供应商故障演练
- 验证 Kill Switch

### 阶段 C：公网 Staging

- 使用独立测试域名与测试数据
- 接入 TLS、WAF、限流、日志与告警
- 做租户隔离、SSRF、路径穿越和审批并发测试
- 不连接真实支付、退款和生产店铺

### 阶段 D：生产灰度

- 先开放只读 Agent
- 再开放草稿生成
- 写入与发布继续保持人工确认
- 按组织白名单灰度
- 观察错误预算、成本和审批异常

### 阶段 E：全量

只有满足全部上线门禁后才扩大组织范围。

## 14. 回滚方案

上线前必须具备：

- 前一版本镜像
- 数据库向后兼容窗口
- Feature Flag
- Agent 全局 Kill Switch
- 组织级 Kill Switch
- Nginx 路由快速关闭 `/agent/`
- 模型 Provider 快速切换
- Queue 暂停与恢复
- 外部平台写操作停止开关

回滚原则：

```text
先停止新写入
  -> 暂停 Worker
  -> 切换流量
  -> 回滚应用
  -> 检查队列与数据库状态
  -> 人工处理不确定外部动作
```

## 15. 验证命令清单

以下命令需要在支持项目运行的环境中执行，命令名称按仓库实际脚本调整。

```bash
# Compose 配置检查
docker compose -f docker-compose.prod.yml config

# Nginx 配置检查
nginx -t

# 后端
pnpm build
pnpm test -- agent-proxy.spec.ts --runInBand
pnpm test -- agent-run-worker.spec.ts --runInBand
pnpm test -- tenant-isolation.e2e-spec.ts --runInBand

# 前端
pnpm build

# Python Agent
pytest agent/tests/test_w_round.py
pytest agent/tests/test_integration_api.py
pytest agent/tests/test_commerce_agent.py
```

需要额外增加：

```text
test_ssrf_security.py
test_session_path_security.py
test_job_queue_state_machine.py
test_mcp_schema_validation.py
test_planner_budget.py
```

## 16. 公网上线硬门槛

- [ ] 公网只开放 80/443，80 自动跳转 443
- [ ] PostgreSQL、Redis、Backend、Agent 无公网端口
- [ ] 生产禁止自动 Mock
- [ ] Agent Key 与 Webhook Secret 双端强制配置
- [ ] 完整 Python Agent Web 不对公网开放
- [ ] 图片使用签名 URL 或经过后端授权
- [ ] SSRF 测试全部通过
- [ ] 路径穿越和 Symlink 测试全部通过
- [ ] Agent Proxy actor/org/workspace 强一致性通过
- [ ] BullMQ 重试、最终失败和死信通过
- [ ] Python 超时任务不能复活
- [ ] 审批并发只执行一次
- [ ] Kill Switch 无跨组织问题且无法绕过
- [ ] MCP 服务端 Schema 真正执行
- [ ] Planner 有步骤、工具、时间、Token 和费用预算
- [ ] Refresh Token 使用 HttpOnly Cookie
- [ ] 敏感页面后端 RBAC 生效
- [ ] Agent 与 Backend 使用非 root 用户
- [ ] Runtime 数据卷与实际目录一致
- [ ] 容器重建后任务与产物保留
- [ ] 日志完成敏感字段脱敏
- [ ] 监控、告警和链路追踪可用
- [ ] 备份恢复演练通过
- [ ] 灰度与回滚流程验证通过

## 17. 推荐实施顺序

```text
1. 生产配置 fail closed
2. 关闭公网 Python Agent Web
3. SSRF 与文件系统边界
4. Agent Proxy 租户身份
5. BullMQ 与 Python JobQueue 状态机
6. 审批原子性与外部幂等
7. Kill Switch 执行边界
8. MCP Schema 与工具副作用元数据
9. Planner 预算与策略中心
10. Token、RBAC 与签名媒体
11. 监控、告警、容灾与灰度
```

## 18. 最终结论

当前项目具备继续演进为公网商业系统的基础，但不能把“内网能运行”误当成“公网可承受攻击与故障”。公网是一台永不下班的探测器，会持续敲击每个端口、路径、身份字段和资源上限。

本方案优先处理四个事实：

1. 任何结果都必须真实，生产不能静默 Mock。
2. 任何执行都必须绑定真实组织、真实操作人和真实 Workspace。
3. 任何失败、超时、重试和审批都必须只有一个权威状态。
4. 任何公网输入都必须被视为不可信，包括 URL、路径、JSON、模型输出和服务间参数。

完成本文件中的 P0 与上线硬门槛后，再进入缓存、模型路由、成本优化和更高自主权阶段。