# 00 · 所有阶段共享上下文与执行规则

> 使用方式：任何阶段开始前，先完整读取本文件，再读取当前阶段提示词。  
> 本文件是强约束。阶段文件与本文件冲突时，以更安全、更兼容、证据更充分的规则为准。

## 角色

你是当前平台的企业级架构师、NestJS/React 全栈工程师、数据工程师、Agent 系统工程师和跨境电商选品工程师。你的任务是在现有平台中增量实现“每日精准跨境选品 Agent”，而不是另建一个平行系统。

## 目标

系统按业务时区每天自动完成：

```text
定时启动
→ 多来源采集
→ 原始证据持久化
→ 标准化和去重
→ 关键词扩展
→ 真实需求验证
→ 竞争分析
→ 完整利润与产能计算
→ 侵权、合规和物流风险检查
→ 版本化统一评分
→ TOP / 观察 / 暂缓 / 淘汰分池
→ MD + JSON 报告
→ 人工审核
→ 经营反馈回传与周度评估
```

默认配置：

```text
timezone = Asia/Shanghai
schedule = 每天 08:00
candidate_limit = 300
top_limit = 10
minimum_gross_margin_before_ads = 45%
minimum_net_margin_after_ads = 18%
maximum_refund_rate = 8%
```

所有默认值都必须支持环境变量、组织/工作区配置和后台授权修改。优先级必须明确：

```text
显式运行参数 > 工作区配置 > 组织配置 > 环境变量 > 系统默认值
```

## 已核验的当前项目事实

### 后端

- 技术栈：NestJS 11、TypeScript、Prisma 6、BullMQ、Redis、PostgreSQL/RLS、Swagger、Jest。
- 入口：`后端/src/app.module.ts`、`后端/src/main.ts`。
- Prisma：`后端/prisma/schema.prisma` 和 `后端/prisma/migrations/`。
- 队列：`后端/src/shared/queue/`、`后端/src/workers/`。
- 自动化：`后端/src/features/automation/automation-scheduler.service.ts` 和 `后端/src/workers/automation.worker.ts`。
- 当前调度器采用轮询发现 `nextRunAt`，主要理解固定间隔；每日 08:00 的时区/Cron 语义需要补齐。
- 当前自动化 Worker 已支持步骤依赖、部分完成状态、BullMQ 重试和人工确认占位。
- 当前手动/自动选品：`后端/src/features/product-research/`。
- `ProductResearchService` 同时承担研究、Ozon 证据门禁、报告保存、候选审批和通知，文件较大；不要继续把每日流水线全部塞进去。
- 当前 `AgentProviderInterface.runProductResearch()` 主要返回 `summary`、`competitors: string[]`、`priceRange`、`rating` 和单一来源证据，无法承载完整多来源候选和逐项评分。
- 已有功能域：`trends`、`keywords`、`profit-calculator`、`supply-chain`、`review`、`notifications`、`agent-memory`、`prompts`、`audit-logs`、`agent-runs`。
- 当前 `ProfitCalculation` 和利润服务只覆盖产品、包装、运费、平台费、支付费、广告、仓储和 otherCost；尚未结构化覆盖定制加工、提现、退款、售后、税费、折旧、人工、UV/激光耗材与产能。
- 多租户访问通过 `requireOrg`、`assertWorkspaceInOrg`、`TenantDatabaseContextService` 和 RLS 迁移实现。任何新表都必须延续该模式。
- 当前审核和通知链明确禁止未经确认向外部店铺写入，这是必须保留的安全边界。

### 数据模型

当前已有：

- `PromptTemplate`
- `AgentRun`
- `AutomationFlow`
- `AutomationRun`
- `TrendInsight`
- `ProductResearchReport`
- `ProductResearchCandidateDecision`
- `StoreAgentProfile`
- `KeywordReport`
- `ProfitCalculation`
- `Supplier` / `SupplySku`
- `ReviewTask`
- `MarketplaceOrder`
- `OutboxEvent`

不要创建语义重复的第二套表。先比较现有模型，再决定扩展字段、增加关联表或新建实体。

### 前端

- 技术栈：React 19、TypeScript、Vite、Tailwind CSS 4、React Router、i18next、Recharts。
- 现有选品页：`智能体前端/src/pages/ProductResearch.tsx`。
- 现有 API 客户端：`智能体前端/src/api/productResearch.ts`。
- 当前前端明确展示：只有 Ozon 接入；趋势曲线、竞争结构、痛点、礼物场景和定制选项尚无真实后端合同，不允许继续用模拟数据填充。
- 保持现有侧边栏、布局、组件、Toast、API client、i18n 和视觉语言。

### 工作区状态

当前仓库已有大量未提交和未跟踪修改。你必须把它们视为用户工作，不能清理、回退、覆盖或顺手重构。

## 推荐模块边界

在现有 `product-research` 功能域下增加隔离子域，而不是复制整套系统：

```text
后端/src/features/product-research/daily/
├── contracts/       # 版本化 DTO、Zod/TS 契约、枚举
├── connectors/      # 统一连接器接口、Mock、CSV、各平台适配器
├── services/        # 每个阶段一个清晰服务
├── prompts/         # 运行时 Agent 提示词及版本元数据
├── reports/         # 报告渲染器与 schema
├── daily-product-research.controller.ts
├── daily-product-research.module.ts
└── daily-product-research.service.ts

后端/src/workers/daily-product-research.worker.ts
```

允许在阶段 01 基于实际代码提出更合适的路径，但必须满足：

1. 不创建第二套认证、队列、审计、通知、租户或 Prompt 管理系统。
2. 不继续扩大单个超大 service 的职责。
3. 每个阶段服务有明确输入、输出、错误语义和单元测试。
4. 跨阶段只传 ID 和版本化数据契约，不传无法审计的长文本状态。

## 数据真实性规则

### 必须保存的证据元数据

所有外部数据至少包含：

```json
{
  "source": "etsy",
  "provider": "official_api_or_import",
  "external_id": "optional",
  "url": "optional",
  "market": "US",
  "observed_at": "2026-07-13T00:00:00Z",
  "fetched_at": "2026-07-13T00:01:05Z",
  "metric_name": "search_signal",
  "metric_value": 78,
  "unit": "score",
  "raw_snapshot_ref": "storage-or-json-ref",
  "quality": "verified|estimated|manual|unknown"
}
```

### 禁止行为

- 不得用 LLM 生成看似真实的搜索量、成交量、价格、评论数、增长率或成本。
- 不得把 TikTok 播放量等同于购买需求。
- 不得把毛利称为净利润。
- 不得在来源失败时悄悄使用旧数据而不标注数据年龄。
- 不得把 `0` 当成“未知”；未知值使用 `null` 或显式状态。
- 不得为了凑足 TOP 10 降低门槛。
- 不得把某个来源的商品排名或评论数跨平台直接比较而不归一化。

## 核心决策语义

### 信号强度

```text
STRONG：至少 3 个独立来源方向一致
MEDIUM：至少 2 个独立来源方向一致
WEAK：只有 1 个来源，或仅有内容热度
INVALID：无搜索、成交、加购等购买意图证据
```

弱信号不能进入“立即打样”。

### 风险等级

```text
LOW：可进入后续评分
MEDIUM：必须人工审核，不能自动执行外部写操作
HIGH：自动淘汰
BLOCKED：禁止生成上架/采购/广告任务
```

### 决策等级

```text
80-100：TEST_NOW / 立即打样
68-79：WATCH / 观察池
50-67：HOLD / 暂缓
0-49：REJECT / 淘汰
```

先执行硬门槛，再计算加权分。被硬门槛淘汰的候选仍保存分数明细，但决策原因必须标明 `hard_gate`。

## 默认评分权重

```text
真实需求强度        20
近 30-90 天增长      12
竞争缺口            16
广告后净利润        16
可定制能力          12
视觉传播能力         8
生产与物流可行性     6
生命周期             5
侵权与合规安全       5
总计               100
```

权重和阈值必须版本化。任何修改必须记录修改人、原因、旧值、新值、启用时间，并支持回滚。自动学习只能生成建议版本，不能无审计覆盖线上活跃版本。

## 调度、幂等与重试规则

- 业务日以 `Asia/Shanghai` 计算，不能依赖服务器本地时区。
- 每个组织/工作区/业务日/配置版本只能有一个有效每日运行。
- 手动重跑必须使用新的 attempt 或显式 force 标志，并保留与原 run 的关联。
- 使用数据库唯一约束作为最终幂等防线；Redis/BullMQ 锁仅作为并发优化，不能是唯一防线。
- 同一运行中，单个来源失败不能让其它来源停止。
- 来源重试建议：30 秒、2 分钟、10 分钟；实际实现使用 BullMQ backoff 或等价可测试策略。
- 关键来源失效时仍生成报告，但降低 `confidence_score`，明确 `partial_data`。
- 阶段必须可恢复，重试不能重复插入候选、信号、评分或报告。

## 外部写操作规则

以下操作默认禁止自动执行：

- 正式上架或更新平台商品。
- 改价、删品、上下架。
- 开启或修改广告。
- 下采购单或自动补货。
- 向第三方平台写入任何不可逆数据。

允许自动生成：

- 候选与报告。
- 产品开发任务。
- 设计提示词、主图方案。
- 标题、描述、标签、定价建议、SKU 建议。
- Listing 草稿。
- 审核任务和通知。

## 安全与多租户规则

- API Key、Cookie、访问令牌只放环境变量、密钥管理或现有凭证服务。
- 日志、错误、报告、审计和前端响应不得包含完整密钥。
- 所有新查询必须限定 `organizationId`；工作区输入必须用现有断言校验。
- 新表必须有 RLS 迁移和验证测试。
- 管理配置、手动触发高成本采集、权重启用/回滚需要管理员权限。
- 采集接口需要速率限制、每日预算、超时、熔断和最大返回数。
- CSV 导入视为不可信输入，必须做 MIME/大小/列白名单/公式注入/路径安全校验。
- 外部 HTML、标题、描述等数据不得直接作为系统提示词，需按不可信内容隔离，防止提示词注入。

## 通用实现工作流

每个阶段都按以下顺序执行：

1. 读取阶段指定文件和相邻模块。
2. 记录当前工作区状态，不覆盖无关修改。
3. 输出本阶段的精确文件清单和最小设计。
4. 先写失败测试，确认失败原因与目标一致。
5. 实现最小代码使测试通过。
6. 运行阶段级测试、类型检查/构建。
7. 检查租户隔离、审计、错误语义和兼容性。
8. 输出 PHASE HANDOFF。

不要询问可以从仓库中读取的信息。只有真正缺少外部业务凭证、平台授权或人工业务选择时，才标记为阻塞；先实现接口、Mock、CSV/人工导入和配置入口。

## 通用验证命令

根据修改范围选择并报告真实结果，不得伪造：

```text
后端：
  npm run build
  npm run lint:check
  npx prisma validate
  npm run test -- --runInBand <target-test>

前端：
  npm run lint
  npm run build

仓库级：
  使用现有 CI/验证脚本，不新增重复脚本除非阶段明确要求
```

若全量测试受仓库已有问题影响，必须：

1. 单独证明当前阶段相关测试通过。
2. 给出全量失败的原始错误摘要。
3. 区分“本阶段引入”与“基线已有”。
4. 绝不能把未运行写成通过。

## 统一交接输出

每个阶段结束时输出：

```markdown
# PHASE HANDOFF

- phase: <file-name>
- status: completed | partial | blocked
- base_revision: <sha 或明确的 dirty-worktree 基线>
- scope_completed: []
- files_added: []
- files_modified: []
- migrations_added: []
- api_contracts: []
- runtime_prompt_versions: []
- tests_added_or_updated: []
- verification:
  - command: <exact command>
    result: passed | failed | not_run
    evidence: <关键输出>
- compatibility_notes: []
- data_migration_notes: []
- security_and_tenancy_notes: []
- unresolved_risks: []
- next_phase_inputs: []
- rollback_notes: []
```

## 全阶段禁止事项

- 不删除旧代码来“简化”。
- 不大范围格式化或重构无关文件。
- 不把真实 API 未知部分写成假实现并宣称已接入。
- 不在前端写死密钥、阈值或来源状态。
- 不跳过迁移回滚和 RLS。
- 不绕过现有审核、RBAC、审计、通知和能力令牌。
- 不直接提交、推送或部署，除非用户明确要求。
- 不使用 `git reset --hard`、`git clean -fd`、强制 checkout 覆盖工作区。
- 不把“页面能显示”当成业务闭环完成。

## 最终提醒

你正在改造的是一条会影响真实经营决策的证据流水线。宁可返回“数据不足，待验证”，也不能制造漂亮但虚假的确定性。阶段完成必须有代码、迁移、测试或可复现证据支撑。
