# ShopMate AI Agent / MCP 后续优化路线图

> 文档类型：阶段性工程路线图  
> 版本：1.0  
> 日期：2026-07-12  
> 工作区：`G:\平台`  
> 前置文档：`代码深度审查修复报告.md`、`代码深度审查修复报告_Agent-MCP第一轮.md`

## 1. 文档目标

本路线图用于指导 Agent 核心链路与 MCP 第一轮高风险问题修复完成后的持续优化工作。

当前修复工作的核心目标是阻止以下事故：

- 生产环境返回 Mock 假结果
- 跨租户调用与身份冒用
- 重复发布、重复调价、重复扣费
- BullMQ 失败任务被错误记为完成
- Python 超时任务继续执行并覆盖终态
- MCP 工具绕过权限与人工审批
- SSRF、目录穿越和本地文件越界读取
- 全局 Agent Key 泄露后控制所有租户

这些问题解决后，系统仍需要继续建设任务状态机、幂等体系、工具策略、预算控制、可观测性、成本治理和发布保障。

本路线图按依赖关系排序。前一里程碑未通过验收时，不建议启动依赖它的后续能力。

---

## 2. 总体原则

### 2.1 安全优先于自主性

在审批、幂等、租户隔离和 Kill Switch 未完成闭环前，不增加新的真实店铺写入型工具。

### 2.2 服务端是最终安全边界

前端禁用按钮只能改善体验，不能代替后端权限检查。MCP、Agent、队列和外部写入都必须在服务端再次验证。

### 2.3 状态必须只有一个事实来源

数据库、BullMQ、Python JobQueue、Webhook 和前端不能各自维护互相矛盾的任务状态。

### 2.4 所有外部副作用必须可追踪、可去重

发布、调价、退款、库存、广告、技能安装和付费接口都必须具备：

- 明确的操作人
- 明确的组织与 Workspace
- 风险等级
- 人工审批记录
- 幂等键
- 执行前后快照
- 结果与失败原因
- 可检索的审计记录

### 2.5 估算值不能伪装成真实数据

系统必须清楚区分：

- 真实平台数据
- 第三方来源数据
- 模型推断
- 规则计算
- 估算结果
- Mock 结果
- 人工审核结果

### 2.6 每个修复都必须有回归测试

修复顺序遵循：

```text
写失败测试
  ↓
确认测试因目标缺陷失败
  ↓
最小修改
  ↓
确认测试通过
  ↓
运行相关回归测试与构建
  ↓
记录验证证据
```

---

## 3. 优先级总览

| 里程碑 | 优先级 | 目标 | 完成标志 |
|---|---|---|---|
| M0 | 阻断级 | 当前 P0/P1 修复验收闭环 | 所有阻断项有测试与运行证据 |
| M1 | 最高 | 任务状态机与幂等体系 | 重复请求、重试、超时和终态一致 |
| M2 | 最高 | MCP 工具策略中心 | 每个工具拥有统一风险与执行策略 |
| M3 | 高 | Planner 计划、审批与预算分离 | Planner 无法越权或无限执行 |
| M4 | 高 | 模型路由、缓存与成本治理 | 每次调用成本可见且可限制 |
| M5 | 高 | 可观测性与运营看板 | 可从用户请求追到模型和外部动作 |
| M6 | 中高 | 数据库、归档与数据生命周期 | 大表、JSON、审计和敏感数据可治理 |
| M7 | 中高 | 前端运行中心与审批体验 | 用户能理解任务为何运行、暂停或失败 |
| M8 | 最高 | 灰度、容灾与上线演练 | 故障、回滚、密钥轮换均有演练证据 |

---

# 4. M0：当前修复验收闭环

## 4.1 目标

证明第一轮发现的 P0/P1 问题已经被真正修复，而不是只修改了代码表面。

## 4.2 必做验证

### Agent Proxy 与多租户

- 缺少 `actorId` 的服务调用被拒绝
- `actorId` 不是目标组织 ACTIVE Membership 时被拒绝
- `workspaceId` 不属于目标组织时被拒绝
- UI Console 只能使用 JWT 中的组织和用户身份
- 服务端不得自动回退到组织内其他成员
- 不得伪造 OWNER 身份执行动作
- OWNER、ADMIN、MEMBER、VIEWER 的路由权限符合设计

### BullMQ 与 AgentRun

- 临时网络错误触发 BullMQ retry
- 429、502、503 和超时进入可重试分类
- 参数错误和权限错误不会无意义重试
- 最终失败进入 dead-letter
- 数据库状态与 BullMQ 状态一致
- 失败任务不会触发 completed 事件
- 失败指标不会重复计数

### Python JobQueue

- 超时任务不能在稍后覆盖 FAILED
- 同一个幂等请求并发提交只能生成一个执行实例
- 失败后的显式新 attempt 可以真正重新执行
- 服务重启后的未完成任务状态可解释
- jobs、sessions、outputs、uploads 在容器重建后仍存在

### MCP

- 错误字段类型被拒绝
- 缺少必填字段被拒绝
- 额外字段按策略拒绝
- 超长字符串、超大数组、越界数值被拒绝
- 单条 JSON-RPC 请求大小受限
- 畸形 JSON 返回规范错误
- 工具执行错误不泄露服务器路径和堆栈

### 文件系统与 SSRF

- `../`、`..\`、绝对路径和编码变体全部被拒绝
- 持久化的 `output_dir` 无法逃逸 runtime 根目录
- localhost、私网、link-local、保留地址和云元数据地址全部被拒绝
- 重定向到私网被拒绝
- DNS 解析到私网被拒绝
- 超大响应在读取过程中立即中止
- 伪造图片 Content-Type 被识别
- 符号链接不能逃逸允许目录

### 生产配置

- 缺少 Agent Key 时生产配置直接失败
- 生产环境禁止自动 Mock
- 后端和 Python Agent 使用一致的身份配置
- `/agent/` 不再默认公开完整 Python Web UI
- Nginx Agent 路由不会被静态文件正则抢走
- Webhook 有签名、时间窗和防重放机制

## 4.3 输出文件

```text
Agent-MCP修复验证报告.md
```

报告必须包含：

- 实际运行命令
- 运行日期与环境
- 通过和失败的测试数量
- 构建结果
- Docker/Nginx 验证结果
- 尚未解决的问题
- 相关日志和截图位置

## 4.4 验收门槛

- [ ] P0 数量为 0
- [ ] 关键 P1 数量为 0
- [ ] 跨租户测试通过
- [ ] 重复外部写入测试通过
- [ ] Worker 重试与死信测试通过
- [ ] SSRF 与目录穿越测试通过
- [ ] 生产 Mock 使用次数为 0
- [ ] 后端、前端和 Python 构建通过

---

# 5. M1：任务状态机与幂等体系

## 5.1 目标

建立统一、可验证、不可随意倒退的任务状态机，使数据库、队列、远端 Agent 和前端对同一任务保持一致理解。

## 5.2 推荐状态模型

```text
PENDING
  ↓
ENQUEUING
  ↓
QUEUED
  ↓
RUNNING
  ├── RETRYING
  ├── WAITING_APPROVAL
  ├── COMPLETED
  ├── FAILED
  ├── TIMEOUT
  ├── CANCELLED
  └── DEAD_LETTERED
```

## 5.3 状态迁移规则

必须明确禁止以下迁移：

```text
COMPLETED -> RUNNING
FAILED_FINAL -> RUNNING
CANCELLED -> COMPLETED
TIMEOUT -> COMPLETED
```

允许的重新执行必须创建新的 attempt，而不是复活旧终态。

## 5.4 数据模型建议

AgentRun 增加：

```text
clientRequestId
idempotencyKey
attempt
maxAttempts
queueJobId
remoteRunId
statusVersion
leasedBy
leaseExpiresAt
lastHeartbeatAt
retryable
failureClass
cancelRequestedAt
```

外部动作增加：

```text
externalActionId
approvalId
idempotencyKey
executionStatus
beforeSnapshot
requestedAfterSnapshot
actualAfterSnapshot
externalReference
```

## 5.5 Outbox 模式

创建 AgentRun 与投递队列应通过事务 Outbox 解耦：

```text
数据库事务
├── 创建 AgentRun
└── 创建 OutboxEvent

Outbox Publisher
└── 投递到 BullMQ
```

需要处理：

- Redis 暂时不可用
- Publisher 重复投递
- BullMQ 成功但 Outbox 未标记
- 数据库提交失败
- 服务重启后的未发送事件

## 5.6 三类幂等键

### 用户请求幂等

```text
organizationId + clientRequestId
```

用于阻止重复点击、前端超时重发和网络重试产生多个任务。

### Agent attempt 幂等

```text
agentRunId + attempt
```

每次重试拥有独立 attempt，不复用旧的远端终态结果。

### 外部动作幂等

```text
organizationId + actionName + externalActionId
```

用于发布、调价、退款、库存和广告等副作用操作。

## 5.7 并发控制

- 状态更新使用条件更新或乐观锁
- 审批使用 `PENDING -> EXECUTING` 原子抢占
- Worker 使用 lease，过期后才允许其他实例接管
- 迟到执行器写入时必须校验 `statusVersion` 或 lease token
- 终态写入必须幂等

## 5.8 验收标准

- [ ] 相同 clientRequestId 只创建一个 AgentRun
- [ ] 相同 attempt 只产生一个远端执行
- [ ] 两个 Worker 不能同时拥有同一任务 lease
- [ ] 超时后的迟到结果无法覆盖终态
- [ ] 两个并发审批只能执行一次外部动作
- [ ] Redis 中断不会制造永久 PENDING 孤儿
- [ ] 所有状态迁移都有单元测试

---

# 6. M2：MCP 工具策略中心

## 6.1 目标

把工具安全策略从散落的 `switch`、字符串判断和提示词，收敛为一个服务端权威策略中心。

## 6.2 工具元数据模型

每个工具建议声明：

```ts
interface ToolPolicy {
  name: string;
  version: string;
  description: string;
  effect: 'read' | 'draft' | 'write' | 'paid';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  requiresConfirmation: boolean;
  idempotent: boolean;
  retryPolicy: 'never' | 'safe-read-only' | 'explicit';
  requiredRoles: Array<'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'>;
  requiredScopes: string[];
  maxCallsPerRun: number;
  timeoutMs: number;
  inputSchemaVersion: string;
  outputSchemaVersion: string;
  costClass: 'free' | 'low' | 'medium' | 'high';
  auditMode: 'summary' | 'full-redacted';
}
```

## 6.3 工具分类示例

| 工具 | effect | 风险 | 审批 | 重试 |
|---|---|---|---|---|
| `profit.analyze` | read | low | 否 | 可安全重试 |
| `keyword.analyze` | read | low | 否 | 可安全重试 |
| `listing.draft` | draft | medium | 可选 | 显式重试 |
| `image.generate` | paid | medium | 按预算 | 显式重试 |
| `product.update` | write | high | 是 | 禁止自动重试 |
| `listing.publish` | write | critical | 是 | 禁止自动重试 |
| `price.adjust` | write | critical | 是 | 禁止自动重试 |
| `order.refund` | write | critical | 是 | 禁止自动重试 |

## 6.4 输入输出契约

工具调用必须经过：

```text
JSON-RPC 解析
  ↓
请求大小检查
  ↓
工具存在性检查
  ↓
版本检查
  ↓
输入 Schema 验证
  ↓
身份与租户检查
  ↓
工具策略检查
  ↓
预算检查
  ↓
审批检查
  ↓
执行
  ↓
输出 Schema 验证
  ↓
审计与指标
```

## 6.5 工具注册规则

- 同名工具默认禁止覆盖
- 工具名称必须稳定且版本化
- 写入型工具必须声明副作用
- 未声明策略的工具默认拒绝执行
- 工具输出不能直接被当成可信业务数据
- 所有外部响应均需运行时验证

## 6.6 MCP Gateway

逐步将每次启动 Python 进程的方式升级为：

```text
NestJS
  ↓
MCP Gateway
  ↓
受控 Python Worker Pool
```

Gateway 负责：

- 工具注册
- 权限与策略
- 超时
- 限流
- 熔断
- 审计
- 结果 Schema
- 指标
- Worker 池并发

## 6.7 验收标准

- [ ] 所有工具都有 ToolPolicy
- [ ] 未注册工具无法执行
- [ ] 未声明副作用的写工具无法注册
- [ ] 写入和付费工具不能自动重试
- [ ] 输出 Schema 不通过时不会写入业务数据
- [ ] 工具调用日志可按 org、user、run、tool 检索
- [ ] 单个工具无法突破 maxCallsPerRun

---

# 7. M3：Planner、审批与执行分离

## 7.1 目标

防止 Planner 同时承担计划、授权和执行三种职责。

## 7.2 推荐架构

```text
Planner
  ↓
生成结构化计划
  ↓
Policy Engine
  ↓
检查租户、权限、风险、预算和工具策略
  ↓
Approval Gate
  ↓
必要时等待人工确认
  ↓
Executor
  ↓
执行已批准步骤
  ↓
Verifier
  ↓
验证结果、证据和状态
```

## 7.3 计划硬限制

代码层必须强制：

- 最大步骤数
- 最大工具调用数
- 最大计划 JSON 大小
- 唯一步骤 ID
- 无循环依赖
- 依赖项必须存在
- 只允许本次策略授予的工具
- 写入型步骤必须等待审批
- 付费调用达到阈值时等待审批

## 7.4 预算模型

每个计划建议具备：

```text
maxSteps
maxToolCalls
maxDurationMs
maxInputTokens
maxOutputTokens
maxModelCost
maxPaidToolCost
maxRetries
maxExternalWrites
```

达到预算时：

```text
暂停执行
  ↓
生成已完成步骤摘要
  ↓
列出剩余成本与风险
  ↓
等待人工继续或取消
```

## 7.5 上下文最小化

当前执行链不应把完整 `global_context` 注入每个工具。

应为每个工具定义允许字段：

```text
profit.analyze
  -> price, cost, shipping, fee, currency

keyword.analyze
  -> seedKeywords, marketplace, locale

listing.draft
  -> productName, verifiedAttributes, approvedKeywords
```

敏感字段默认不传递。

## 7.6 重试策略

- 只读且幂等的工具可以退避重试
- 写入工具禁止自动重试
- 付费工具只能在未收到供应商确认时谨慎重试
- 重试必须生成独立 attempt
- 每次重试记录原因、延迟和成本

## 7.7 结果验证

Verifier 需要检查：

- 输出 Schema
- 来源证据
- 数值范围
- 禁止词
- 平台规则
- 价格与利润假设
- 图片一致性
- 是否要求人工复核

## 7.8 验收标准

- [ ] 超过最大步骤的计划被拒绝
- [ ] 循环依赖计划被拒绝
- [ ] Planner 无法调用未授权工具
- [ ] Planner 无法直接执行真实店铺写入
- [ ] 预算超限会暂停并等待确认
- [ ] 写入工具不会被自动重试
- [ ] 每个步骤都有可追踪输入、输出和审批状态

---

# 8. M4：模型路由、缓存与成本治理

## 8.1 目标

让不同任务使用合适的模型，并使每一笔模型与工具成本都可见、可限制、可解释。

## 8.2 模型路由建议

```text
格式化、分类、简单抽取
  -> 轻量模型

Listing、关键词、摘要、常规问答
  -> 中型模型

Planner、复杂研究、异常诊断、关键审核
  -> 高能力模型
```

路由维度：

- 任务类型
- 输入长度
- 风险等级
- 证据要求
- 组织套餐
- 当日预算
- 历史成功率
- 延迟要求

## 8.3 AgentRun 成本字段

建议记录：

```text
provider
model
inputTokens
outputTokens
cachedTokens
latencyMs
costAmount
currency
fallbackCount
retryCount
mcpCostAmount
externalApiCostAmount
```

## 8.4 预算层级

- 单次 AgentRun 预算
- 单个计划预算
- 单用户日预算
- 单 Workspace 日预算
- 单组织月预算
- 单工具调用预算

预算动作：

```text
未超限 -> 正常执行
接近上限 -> 使用较低成本模型或减少步骤
超过上限 -> 暂停并请求确认
严重超限 -> 拒绝执行并告警
```

## 8.5 缓存策略

适合缓存：

- 关键词分析
- 类目趋势快照
- 平台规则
- 商品基础特征分析
- 相同输入的只读 MCP 计算
- 相同图片 Hash 的产品特征

推荐缓存键：

```text
organizationId
workspaceId
taskType
inputHash
schemaVersion
sourceVersion
```

缓存要求：

- 不跨组织复用私有结果
- 包含 Schema 版本
- 包含数据来源版本
- 显示命中缓存
- 设置过期时间
- 写入型操作绝不缓存执行结果来代替真实执行

## 8.6 验收标准

- [ ] 每个 AgentRun 都有模型、Token、延迟和成本记录
- [ ] 组织预算可以阻止超额执行
- [ ] 缓存不会跨租户泄露
- [ ] 结果界面显示缓存、估算和真实来源
- [ ] 模型 fallback 可追踪
- [ ] 成本异常有告警

---

# 9. M5：可观测性与运营看板

## 9.1 统一追踪标识

一个请求从前端到外部平台应串联：

```text
requestId
traceId
organizationId
workspaceId
userId
agentRunId
queueJobId
remoteRunId
mcpCallId
approvalId
externalActionId
```

## 9.2 核心指标

### 运行指标

- AgentRun 成功率
- P50 / P95 / P99 延迟
- 排队时间
- 执行时间
- 重试率
- 超时率
- 取消率
- Dead Letter 数量

### MCP 指标

- 每个工具调用次数
- 每个工具失败率
- 每个工具平均耗时
- Schema 拒绝次数
- 权限拒绝次数
- 审批等待数量
- 幂等拦截数量

### 成本指标

- 按组织成本
- 按 Workspace 成本
- 按用户成本
- 按模型成本
- 按 Agent 类型成本
- 按工具成本
- fallback 额外成本

### 安全指标

- 跨租户校验失败次数
- SSRF 拦截次数
- 路径穿越拦截次数
- 无效 Agent Token 次数
- Webhook 重放拦截次数
- Kill Switch 启动次数
- 高风险审批拒绝率

## 9.3 错误分类

统一错误码：

```text
AGENT_INPUT_INVALID
AGENT_PROVIDER_TIMEOUT
AGENT_PROVIDER_RATE_LIMITED
AGENT_PROVIDER_UNAVAILABLE
AGENT_BUDGET_EXCEEDED
AGENT_CANCELLED
MCP_TOOL_NOT_ALLOWED
MCP_INPUT_INVALID
MCP_OUTPUT_INVALID
MCP_TIMEOUT
MCP_PROCESS_FAILED
TENANT_SCOPE_INVALID
WORKSPACE_SCOPE_INVALID
APPROVAL_REQUIRED
APPROVAL_REJECTED
APPROVAL_ALREADY_DECIDED
IDEMPOTENCY_CONFLICT
OUTPUT_VERIFICATION_FAILED
EXTERNAL_WRITE_FAILED
```

## 9.4 审计日志脱敏

审计中不得直接保存：

- 完整 base64 图片
- API Key
- access token
- refresh token
- 密码与验证码
- 渠道密钥
- 超长 Prompt 全文

审计应保存：

- 参数摘要
- Hash
- 字段白名单
- 脱敏前后快照
- 受控对象存储引用

## 9.5 告警规则

- Agent 成功率快速下降
- P95 延迟超过阈值
- 组织预算异常增长
- 单工具错误率异常
- Dead Letter 持续增加
- Mock 在生产被触发
- 跨租户校验失败
- 同一外部动作出现多个执行尝试
- Webhook 回调连续失败

## 9.6 验收标准

- [ ] 可从一次前端请求追到外部动作
- [ ] 所有失败都有标准错误码
- [ ] 日志中没有密钥和完整 base64
- [ ] 成本可按组织和模型统计
- [ ] Dead Letter 和预算异常有告警
- [ ] 生产 Mock 触发会立即告警

---

# 10. M6：数据库、归档与数据生命周期

## 10.1 组合索引

按真实查询补充：

```prisma
@@index([organizationId, createdAt])
@@index([organizationId, status, createdAt])
@@index([workspaceId, agentType, createdAt])
@@index([organizationId, userId, createdAt])
```

是否增加索引必须结合查询计划和数据规模验证，避免盲目堆索引。

## 10.2 大型 JSON 治理

以下内容不建议长期完整存入主数据库：

- 大型模型输出
- 图片 base64
- 详细执行轨迹
- 大型 Web 搜索证据
- 大型 Planner 中间上下文

推荐模式：

```text
数据库
  -> 状态、摘要、Hash、Schema 版本、对象存储 URL

对象存储
  -> 完整输入、输出、证据和归档文件
```

## 10.3 数据保留策略

为不同数据定义：

- 在线保留期
- 归档期
- 删除期
- 法务保留例外
- 用户主动删除流程

建议重点覆盖：

- AgentRun
- AgentWorkMemory
- AuditLog
- Notification
- DeadLetterJob
- 图片与导出 ZIP
- Session 消息

## 10.4 软删除与审计

AgentRun、审批、外部动作和成本记录不建议直接物理删除。

建议字段：

```text
deletedAt
archivedAt
deletedBy
retentionClass
```

## 10.5 敏感字段

- 渠道凭证继续字段级加密
- 两步验证密钥加密
- Prompt 中可能包含客户信息，需要数据分级
- 对象存储使用私有 Bucket 与短期签名 URL

## 10.6 验收标准

- [ ] 高频查询有真实查询计划证据
- [ ] 大型 JSON 不再无限膨胀主表
- [ ] 数据保留策略有自动任务
- [ ] 关键审计记录不能被普通删除
- [ ] 对象存储文件默认私有
- [ ] 数据归档与恢复经过验证

---

# 11. M7：前端运行中心与审批体验

## 11.1 Agent 运行中心

展示：

- 当前状态
- 排队位置
- 当前步骤
- 正在调用的工具
- 是否正在重试
- 已用时间
- 已用 Token 与费用
- 是否等待审批
- 失败原因
- 可执行的下一步操作

## 11.2 结果可信度标签

每个结果显示：

```text
真实数据
模型推断
规则计算
估算
Mock
缓存
有来源证据
无来源证据
人工已审核
自动生成未审核
```

## 11.3 审批中心

高风险动作必须展示：

- 动作名称
- 执行组织与 Workspace
- 操作人
- 执行前值
- 请求修改后的值
- 影响商品数量
- 外部平台
- 预计成本
- 风险说明
- 幂等编号
- 审批有效期

用户确认时必须明确：

```text
执行
拒绝
返回修改
```

不使用模糊按钮。

## 11.4 角色门禁

- OWNER：组织级控制与费用
- ADMIN：运营管理和 Agent 控制
- MEMBER：业务操作和低风险工具
- VIEWER：只读

前端门禁与后端规则保持一致，但后端仍是最终边界。

## 11.5 SSE 与实时状态

补充：

- 断线重连
- 指数退避
- heartbeat
- Last-Event-ID
- 401 刷新
- 事件 Schema 验证
- 缓冲区上限
- 页面卸载取消订阅

## 11.6 Token 安全

推荐：

- Refresh Token 使用 HttpOnly、Secure、SameSite Cookie
- Access Token 短期存于内存
- 页面刷新时通过 Cookie 换取新 Access Token
- CSP 和输出编码降低 XSS 风险

## 11.7 验收标准

- [ ] 用户能看见任务当前步骤与重试状态
- [ ] 结果明确显示数据来源与可信度
- [ ] 未授权角色看不到敏感控制台
- [ ] 不允许的工具按钮不可执行
- [ ] 高风险审批展示前后差异和成本
- [ ] SSE 断线后可恢复且不重复完成事件
- [ ] Refresh Token 不再存入 localStorage

---

# 12. M8：灰度、容灾与上线演练

## 12.1 发布策略

- Feature Flag
- 按组织灰度
- 按 Workspace 灰度
- 按 Agent 类型灰度
- 新模型小流量验证
- 新 MCP 工具默认关闭
- 写入型工具单独开关

## 12.2 必做故障演练

- Redis 不可用
- PostgreSQL 短暂不可用
- Python Agent 不可用
- 模型供应商 429
- 模型供应商 5xx
- MCP Worker 卡死
- Webhook 回调失败
- 对象存储不可用
- 外部平台超时
- Agent Key 轮换
- 数据库迁移回滚
- 容器重建

## 12.3 Kill Switch

需要三层停止能力：

```text
全局停止
组织停止
单工具停止
```

停止后必须：

- 阻止新任务
- 阻止新外部写入
- 对运行中任务发取消信号
- 保留审计
- 前端显示停止原因

## 12.4 SLO 建议

根据真实业务量定义：

- AgentRun 成功率
- API 可用性
- P95 延迟
- 队列等待时间
- Webhook 成功率
- 外部写入重复率
- 跨租户事故数
- 生产 Mock 次数

其中：

```text
跨租户事故数 = 0
重复外部写入 = 0
生产 Mock 次数 = 0
```

必须作为硬约束。

## 12.5 上线硬门槛

- [ ] P0 为 0
- [ ] 关键 P1 为 0
- [ ] 跨租户测试通过
- [ ] 幂等与并发审批测试通过
- [ ] Redis 和 Agent 故障演练通过
- [ ] 数据库恢复演练通过
- [ ] 密钥轮换演练通过
- [ ] 回滚流程验证通过
- [ ] 生产 Mock 为 0
- [ ] 真实外部写入有幂等与审批证据

---

# 13. 推荐实施顺序

```text
M0  修复验收闭环
  ↓
M1  任务状态机与幂等体系
  ↓
M2  MCP 工具策略中心
  ↓
M3  Planner、审批与预算分离
  ↓
M4  模型路由、缓存和成本治理
  ↓
M5  可观测性与运营看板
  ↓
M6  数据库与生命周期治理
  ↓
M7  前端运行中心与审批体验
  ↓
M8  灰度、容灾与上线演练
```

当前最优先的三个建设项：

1. **任务状态机与幂等体系**
2. **MCP 工具策略中心**
3. **Planner 预算与审批分离**

这三项完成后，系统才适合继续增加更多自动发布、自动调价、广告和订单处理能力。

---

# 14. 建议拆分的工程任务

## EPIC-A：任务可靠性

- A-01 AgentRun 状态机定义
- A-02 状态条件更新与乐观锁
- A-03 Outbox 表与 Publisher
- A-04 clientRequestId 幂等
- A-05 attempt 与 regenerationId
- A-06 Worker lease 与 heartbeat
- A-07 超时终态保护
- A-08 Dead Letter 恢复流程

## EPIC-B：MCP 安全策略

- B-01 ToolPolicy 数据结构
- B-02 MCP 输入 Schema 验证
- B-03 MCP 输出 Schema 验证
- B-04 工具副作用元数据
- B-05 工具调用审计
- B-06 工具限流与预算
- B-07 MCP Gateway
- B-08 Python Worker Pool

## EPIC-C：Planner 治理

- C-01 最大步骤硬限制
- C-02 DAG 校验
- C-03 工具 allowlist
- C-04 上下文字段投影
- C-05 写工具审批
- C-06 计划费用预算
- C-07 只读工具重试策略
- C-08 Verifier 结果门禁

## EPIC-D：成本与运营

- D-01 Token 与成本字段
- D-02 模型路由器
- D-03 组织预算
- D-04 只读结果缓存
- D-05 成本看板
- D-06 成本异常告警

## EPIC-E：用户体验

- E-01 Agent 运行中心
- E-02 可信度标签
- E-03 审批差异视图
- E-04 角色门禁
- E-05 SSE 重连
- E-06 HttpOnly Refresh Token

## EPIC-F：生产保障

- F-01 Feature Flag 灰度
- F-02 全局、组织、工具 Kill Switch
- F-03 故障注入脚本
- F-04 数据库恢复演练
- F-05 密钥轮换
- F-06 回滚 Runbook

---

# 15. 每个任务的完成定义

每个工程任务只有同时满足以下条件才算完成：

- [ ] 有明确问题描述和影响范围
- [ ] 有失败回归测试
- [ ] 修改范围最小且符合现有架构
- [ ] 单元测试通过
- [ ] 相关集成测试通过
- [ ] 类型检查或构建通过
- [ ] 新增日志已脱敏
- [ ] 新增指标不会产生高基数失控
- [ ] 文档已更新
- [ ] 回滚方式明确
- [ ] 未解决风险已记录

---

# 16. 最终目标架构

```text
React Frontend
  ↓
NestJS API Gateway
  ↓
Tenant / RBAC / Quota / Budget
  ↓
AgentRun State Machine + Outbox
  ↓
BullMQ Worker
  ↓
Planner
  ↓
Policy Engine
  ↓
Approval Gate
  ↓
Executor
  ├── LLM Provider Router
  ├── MCP Gateway
  └── External Platform Adapter
  ↓
Verifier
  ↓
Audit / Metrics / Trace / Cost
```

该架构的核心不是让 Agent 调用更多工具，而是确保每次调用都具备：

- 正确身份
- 正确租户
- 明确权限
- 明确预算
- 明确副作用
- 明确审批
- 明确幂等
- 明确证据
- 明确审计

只有这些要素形成闭环后，Agent 的自主执行能力才从“能运行”升级为“可托付”。
