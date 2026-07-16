# 04 · 多平台连接器、CSV 导入与来源健康提示词

> 先读取：`00-shared-context.md`，以及阶段 02、03 的交接。  
> 前置条件：`ProductResearchRun`、`ProductSignal`、`SourceHealth`、队列和 Orchestrator 已可用。  
> 本阶段目标：建立一套真实、可替换、可降级的来源接入层。没有正式 API 时提供 Mock、CSV 或人工导入，不虚构“已经接入”。

## 你的任务

实现统一的数据连接器框架，并将 `COLLECT` 阶段接入 Orchestrator。连接器必须独立配置、独立超时、独立重试、独立健康记录，返回统一契约并保存证据来源。

预留来源：

```text
Amazon
Etsy
Temu
eBay
TikTok Shop / TikTok content signals
Pinterest
Google Trends
供应商/1688/Alibaba/人工成本
自有店铺订单、曝光、点击、收藏、加购、广告、退款和利润
CSV/人工导入
```

当前仓库实际只验证了哪些平台，就只把那些标记为真实可用。其余来源必须是 `NOT_CONFIGURED`、`DISABLED`、`CSV_ONLY` 或 `MOCK_ONLY`，不能伪装成线上数据。

## 必读位置

```text
后端/src/features/product-research/daily/contracts/**
后端/src/features/product-research/daily/services/**
后端/src/features/product-research/**
后端/src/features/channels/**
后端/src/features/ozon/** 或当前 Ozon adapter
后端/src/features/trends/**
后端/src/features/supply-chain/**
后端/src/features/analytics/**
后端/src/features/files/**
后端/src/shared/credentials/**
后端/src/shared/queue/**
后端/src/shared/http/**
后端/prisma/schema.prisma
后端/test/*channel*
后端/test/*ozon*
后端/test/*csv*
```

## 统一连接器接口

根据项目命名风格实现等价接口，建议：

```ts
export interface ProductResearchConnector {
  readonly source: ProductResearchSource;
  readonly capabilities: ReadonlyArray<ConnectorCapability>;

  isConfigured(context: ConnectorContext): Promise<ConnectorConfigurationState>;

  collect(
    input: ConnectorCollectInput,
    context: ConnectorExecutionContext,
  ): Promise<ConnectorCollectResult>;
}
```

### ConnectorCollectInput

至少包含：

```text
schemaVersion
researchRunId
organizationId
workspaceId?
market/country
locale?
categories?
seedKeywords?
windowStart/windowEnd
candidateLimit
cursor?
configSnapshot
```

### ConnectorExecutionContext

至少包含：

```text
requestId
attempt
abortSignal
deadlineAt
budget
credentialReference?       # 只能是引用，不能把密钥写入日志或数据库
```

### ConnectorCollectResult

```ts
{
  schemaVersion: 'product-research-connector/v1';
  source: ProductResearchSource;
  status: 'SUCCESS' | 'PARTIAL' | 'EMPTY' | 'NOT_CONFIGURED';
  candidates: RawCandidate[];
  signals: RawSignal[];
  evidence: SourceEvidence[];
  nextCursor?: string;
  warnings: ConnectorWarning[];
  metrics: {
    requestedAt: string;
    finishedAt: string;
    itemCount: number;
    latencyMs: number;
    budgetUsed?: string;
  };
}
```

原始候选必须保留 `source`, `externalId`, `url`, `observedAt`, `fetchedAt`, `rawSnapshotRef/rawData`, `quality`。任何外部数值都不能由 LLM 补造。

## 连接器注册中心

实现 `ProductResearchConnectorRegistry`，职责仅包括：

- 注册和按 source 获取连接器。
- 校验 source 唯一。
- 根据运行配置筛选启用来源。
- 返回来源能力和配置状态。
- 测试环境替换为 fake connector。

禁止使用巨大 `switch` 把所有平台逻辑写在一个 service 中。

建议目录：

```text
后端/src/features/product-research/daily/connectors/
├── connector.interface.ts
├── connector-registry.service.ts
├── connector-errors.ts
├── csv/
├── internal-store/
├── supplier/
├── ozon/
├── amazon/
├── etsy/
├── ebay/
├── temu/
├── tiktok/
├── pinterest/
└── google-trends/
```

只创建本阶段真正实现或需要注册的文件，避免空目录森林。

## 来源能力和状态

定义并持久化清晰状态：

```text
HEALTHY：成功且数据新鲜、契约有效
DEGRADED：部分页失败、数据陈旧或返回量显著异常
FAILED：本次最终失败
DISABLED：管理员关闭
NOT_CONFIGURED：缺少授权/凭证/参数
CSV_ONLY：暂无正式连接，只支持导入
MOCK_ONLY：仅测试使用，生产不可启用
```

`SourceHealth` 至少保存：

```text
source
status
attempts
requestedAt
finishedAt
lastSuccessAt
itemCount
latencyMs
dataFreshnessSeconds
httpStatus?
errorCode?
redactedErrorMessage?
budgetUsed?
providerVersion?
```

连接器最终失败时必须：

1. 保存 SourceHealth。
2. 记录结构化日志和指标。
3. 返回受控结果或标准错误给 COLLECT 聚合器。
4. 继续其它来源。
5. 不清空上次成功时间。

## 标准错误

建立可机器判断的错误类型：

```text
CONNECTOR_NOT_CONFIGURED
CONNECTOR_AUTH_FAILED
CONNECTOR_RATE_LIMITED
CONNECTOR_TIMEOUT
CONNECTOR_BUDGET_EXCEEDED
CONNECTOR_UPSTREAM_UNAVAILABLE
CONNECTOR_CONTRACT_INVALID
CONNECTOR_DATA_STALE
CONNECTOR_FORBIDDEN
CONNECTOR_UNKNOWN
```

错误对象必须区分：

```text
retryable
safeMessage
internalCause
httpStatus?
retryAfterMs?
source
```

`safeMessage` 可以持久化和展示；`internalCause` 只用于受控日志，且需脱敏。

## 重试、超时、熔断和预算

- 每个来源使用独立 timeout。
- 使用阶段 03 的 30 秒、2 分钟、10 分钟重试语义，测试中用 fake timers。
- 429 尊重 `Retry-After`，但不能突破总 deadline 和每日预算。
- 401/403 默认不重试，标记认证/授权错误。
- 契约验证失败默认不重试相同 payload。
- 为连续失败来源使用现有熔断模式或实现轻量状态，避免每分钟撞墙。
- 每个来源和每个 run 设最大请求数、最大页数、最大候选数和费用预算。
- 分页游标必须可恢复，不能无限循环。

## 正式 API 接入规则

对于每个平台：

1. 先在仓库中寻找现有 channel/credential/client。
2. 再核验当前官方 API 文档和授权范围。
3. 只调用账户有权限且条款允许的接口。
4. 将第三方返回映射到统一契约。
5. 保存 provider/version/endpoints 的元数据，但不保存密钥。
6. 对采集时间、数据覆盖窗口和限制明确标注。

若无法验证正式 API：

```text
实现统一 adapter 接口
+ 配置状态
+ fake connector
+ CSV/人工导入
+ 清楚的 NOT_CONFIGURED/CSV_ONLY 状态
```

禁止抓取需要绕过登录、验证码、反爬或平台限制的页面。禁止把推测的 endpoint、参数或返回字段写成“真实实现”。

## 自有店铺连接器

优先复用现有数据库事实，而不是通过外部 LLM：

```text
MarketplaceOrder
StoreMetricSnapshot
广告/分析表
退款/售后记录
Listing/Product/SupplySku
ProfitCalculation
```

要求：

- 只查询当前 organization/workspace。
- 统计窗口与 run 的 businessDate 一致。
- 同步不完整时明确 `dataCoverage`。
- 正数/负数、货币和时区语义按现有模型核验。
- 不把订单总额直接当净利润。
- 内部来源同样产生证据记录和 SourceHealth。

## 供应商成本连接器

优先读取 `Supplier`、`SupplySku` 和现有成本记录。CSV/人工导入至少支持：

```text
supplier_code
supplier_name
sku
product_name
unit_cost
currency
moq
lead_time_days
material
customization_method
packaging_cost?
domestic_shipping_cost?
observed_at
```

每条成本要保留来源、币种和更新时间。陈旧成本不能静默用于高置信度利润计算。

## CSV/人工导入

实现受控导入接口和解析器，建议：

```text
POST /daily-product-research/imports/csv
GET  /daily-product-research/imports/:id
```

安全要求：

- 复用现有文件上传/对象存储服务。
- 限制大小、MIME、扩展名和行数。
- UTF-8，提供编码错误提示。
- 严格列白名单和必填列。
- 防止 CSV 公式注入，导出/展示时对 `=`, `+`, `-`, `@` 开头值转义。
- 不允许用户控制服务器路径或存储 key。
- 每行运行时 schema 校验，错误包含行号和安全消息。
- 支持 dry-run 预览、确认后导入。
- 相同文件 hash + 组织 + 作用域具备幂等性。
- 导入记录包含 uploader、时间、文件 hash、成功/失败行数、schemaVersion。

## 外部内容安全

标题、描述、评论、HTML 和社媒文本都是不可信输入：

- 去除脚本、控制字符和超长内容。
- 不把外部文本拼进 system/developer 指令。
- 后续传给 LLM 时放在明确的 `<UNTRUSTED_SOURCE_DATA>` 区块。
- 限制每条和总上下文长度。
- 保留原始快照引用与清洗后文本，二者不可混淆。
- URL 只允许 http/https；访问 URL 时防 SSRF，禁止内网和云元数据地址。

## COLLECT 聚合服务

实现 `ProductResearchCollectionService` 或等价服务：

1. 从 configSnapshot 取得 enabledSources。
2. 从 registry 取得已注册连接器。
3. 有界并发运行，不一次开启无限请求。
4. 每个来源独立 AbortController/deadline。
5. 将结果做契约验证后批量持久化 raw evidence 和 signals。
6. 更新 SourceHealth。
7. 输出 ID 和统计，不返回巨大 payload 给队列。
8. 所有来源都失败时抛出明确的 `ALL_SOURCES_UNAVAILABLE`。
9. 至少一个来源成功时阶段可完成或 PARTIAL。

建议摘要：

```ts
{
  researchRunId: string;
  successfulSources: string[];
  failedSources: string[];
  rawCandidateCount: number;
  signalCount: number;
  partialData: boolean;
}
```

## 测试驱动要求

至少覆盖：

```text
[ ] registry 拒绝重复 source
[ ] 未配置来源返回 NOT_CONFIGURED，不调用网络
[ ] 单来源超时只影响该来源
[ ] 429 按 retryAfter 和预算受控重试
[ ] 401 不无限重试
[ ] 最终失败保存 SourceHealth 并继续其它来源
[ ] 所有来源失败产生 ALL_SOURCES_UNAVAILABLE
[ ] 原始候选和信号通过运行时 schema
[ ] 缺少 fetchedAt/source 的数据被拒绝
[ ] 外部数值缺失保持 null，不变成 0
[ ] 重复分页 cursor 被检测，避免死循环
[ ] 候选上限和请求预算生效
[ ] 内部店铺查询有 organization/workspace 隔离
[ ] CSV dry-run 不写入
[ ] CSV 非法列、超大文件、公式注入和重复 hash 被处理
[ ] Mock connector 不能在 production 配置启用
[ ] 日志和 SourceHealth 不含完整凭证
```

建议测试文件：

```text
后端/test/product-research-connector-registry.spec.ts
后端/test/product-research-collection.spec.ts
后端/test/product-research-source-health.spec.ts
后端/test/product-research-csv-import.spec.ts
后端/test/product-research-connector-security.spec.ts
```

## 本阶段允许修改

```text
后端/src/features/product-research/daily/connectors/**
后端/src/features/product-research/daily/services/product-research-collection.service.ts
后端/src/features/product-research/daily/contracts/**        # 兼容扩展
后端/src/features/product-research/daily/*controller*.ts     # CSV/来源状态所需
后端/src/features/product-research/daily/*module*.ts
后端/src/shared/credentials/**                               # 仅复用接入所需小改
后端/src/features/files/**                                  # 仅安全导入所需小改
后端/test/product-research-connector*.spec.ts
后端/test/product-research-collection*.spec.ts
后端/test/product-research-csv*.spec.ts
后端/.env.example
```

第三方依赖只有在现有能力不足且有明确理由时新增。

## 出口闸门

```text
[ ] 统一 connector 接口和 registry 已实现
[ ] 至少一个真实已有来源和一个 fake connector 通过端到端测试
[ ] 所有未接平台状态真实，不宣称假接入
[ ] CSV/人工导入具备 dry-run、校验、幂等和安全防护
[ ] 每个来源独立超时、重试、预算和 SourceHealth
[ ] 单来源失败不阻断其它来源
[ ] 原始证据包含来源、时间和质量元数据
[ ] 外部内容按不可信输入处理
[ ] 内部店铺和供应链查询通过租户隔离测试
[ ] 目标测试、lint、后端 build 通过
```

最后输出 `PHASE HANDOFF`。`next_phase_inputs` 必须列出：

- RawCandidate/RawSignal 最终 schema。
- 已接入、CSV_ONLY、NOT_CONFIGURED 的来源清单。
- 原始证据持久化位置和 ID。
- 标准化阶段可批量读取的 repository 方法。
- 每个字段的来源质量和 null 语义。
