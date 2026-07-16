# 跨境电商 Agent 平台真实基线报告（2026-07-16）

## 结论

当前平台具备可运行的前端、后端、Python Agent、PostgreSQL、Redis、Worker、定时任务和 Ozon 只读同步，但端到端自动选品与自动上架 **未通过验收**。

阻塞原因不是单一服务故障，而是证据、经济性、风控和发布四个门禁尚未形成同一条可复核链路：真实供应商报价与图片证据为 0，市场观察批次为 0，商品风险记录为 0，发布任务、发布快照、沙箱报告和外部提交均为 0。另有若干运行路径会把模型估计、固定分数或缺省费用包装成可用结果，必须先修复。

本报告以实际 HTTP、容器、数据库、Redis、日志、浏览器操作和生成文件为依据；没有把单元测试通过当成线上能力通过。

## 基线环境与回滚点

- 工作区：`G:\平台`
- Git 基线：`e7d248dbf7f5ff594e70f45edf8a701c9684f2f2`
- 修复前平台备份：`G:\平台\.local-server\backups\20260716-144451`
- 备份内容：PostgreSQL dump、Agent runtime、后端 uploads、校验 SQL、SHA-256 manifest
- 数据库备份 SHA-256：`e8b63e71a8cd2d4b416f0dd24f085a0a2a0afa09c025b014fe9cf707074c012e`
- Agent runtime SHA-256：`81c9576218c582195c1d5c51e7975d260854a4068d0316438cd47399f596be23`
- 历史状态回填 forward / rollback SQL 均保存在同一备份目录，并分别有 SHA-256 校验值。

## 1. 当前可以正常运行的功能

### 运行基础设施

- `shopmate-local-agent`、`backend`、`frontend`、`nginx`、`postgres`、`redis` 六个容器均可启动并达到 healthy。
- `http://127.0.0.1/`、`/api/v1/health`、`/api/v1/ready` 和局域网入口均返回 HTTP 200。
- PostgreSQL、Redis、BullMQ、对象存储检查和 Agent 基础心跳可通过后端 readiness。
- 每日选品计划为 `ACTIVE`，时区 `Asia/Shanghai`，每天 08:00；Windows 当前用户启动项存在。

### 登录与前端真实调用

- 已通过真实浏览器页面注册隔离 QA 用户，数据库存在对应 User、Organization、Membership。
- 登录会进入 `/assistant`，受保护路由会拦截未登录访问。
- 新增的“退出登录”按钮会调用真实 AuthContext logout；点击后跳转 `/login`，再次直接访问 `/assistant` 仍返回登录页；重新登录成功。
- 前端测试 20/20、lint、TypeScript/Vite build 均通过；端口 80 的容器静态资源已重建为当前源代码，而非旧 bundle。

### Agent 鉴权、队列与状态

- 固定 Agent API key 已写入本地受保护配置并同步到 backend/agent 容器；所有证据仅比较布尔结果，不输出密钥。
- backend 容器使用 `X-Api-Key` 对 Agent 发起安全 POST，`/api/v1/agent/autonomy/scan` 返回 HTTP 200。
- 失败任务用原 requestId 重提后会创建新的 attempt，而不是返回旧失败任务。真实运行证据：attempt 1 与 attempt 2 的 runId 不同，attempt 2 保存 `root_job_id` 和 `previous_job_id`。
- Redis 模式下重试通过原子 compare-and-set 防止多实例并发创建多个 attempt；queued/running/completed 仍保持幂等。
- 受控 Agent 停机故障注入后，研究 API 返回 422、创建人工审核任务；新 AgentRun 为 `FAILED / FAILED / FATAL_ERROR / RESEARCH_AGENT_FAILED`，前后端状态不再分叉。

### Ozon 当前可读能力

- 数据库有 2 条 `OZON / SUCCESS` channel connection。
- 当前后台定时同步真实调用 `Ozon Seller API`：每个连接最近每轮 fetched=5、synced=5、warningCount=0、externalMutation=false。
- `marketplace_orders` 中有 14 条 Ozon 订单记录，当前轮时间内有更新。
- 该证据只证明 **当前只读连接可用**；不能证明发布写权限或自动上架已通过。

### 安全失败路径

- 最近一轮日研处理 4 个候选，因售价、供应商成本、平台费、支付费、广告费、退款预留等关键证据缺失，4 个全部阻断，topCount=0。
- Python Agent 的 Ozon 利润工具现已在缺售价、采购成本、类目、物流、重量或三维时返回 `BLOCKED / DATA_INSUFFICIENT / publishable=false / result=null`。
- 数据库中的 18 条 `status=FAILED / lifecycleStatus=CREATED` 历史记录已在完整备份后条件回填；回填后该不一致计数为 0，并保留精确 rollback SQL。

## 2. 无法运行或存在假连接的功能

### 尚未形成真实闭环

- `supplier_quote_evidence`：0
- `supplier_image_search_evidence`：0
- `market_observation_batches`：0
- `market_observation_items`：0
- `product_risk_records`：0
- `product_launches`：0
- `listing_publish_snapshots`：0
- `listing_sandbox_reports`：0
- `approval_decisions`：0
- `external_submissions`：0

因此“真实供应成本 → 风险记录 → 不可篡改快照 → Ozon 提交 → 回读确认”尚未运行过一次。

### 已实测并封堵的错误真实数据拼接

- QA 查询 `codex-qa-verification-nonexistent-product-20260716` 本应证据不足，实际却返回 200 COMPLETED。
- 持久化报告 `cmrn5picx00h7pa01p9lniwbh` 把 5 个空气滤芯 Ozon 页面当作该查询的竞品。
- 原因是第一轮无关搜索结果被用来抽取“空气滤芯”重复词，再用这个新词扩大搜索，形成自我强化的错误证据链。
- 这是实时公开页面，不是 mock，但查询与证据不相关，等价于不可用结论。
- Python Agent 已取消由无关结果反向生成搜索词的自强化逻辑，并要求结果同时覆盖原始/翻译查询词；后端增加独立相关性门禁，至少两条结果须覆盖受控查询词。
- 使用完全相同的 QA 查询回归后，接口从错误 HTTP 200 改为 HTTP 422，未新增成功报告，AgentRun 为 `FAILED / FAILED / VERIFICATION_FAILED / RESEARCH_EVIDENCE_UNVERIFIABLE`；旧错误报告未删除，关联审核已通过真实 API 标记为 REJECTED 以保留审计轨迹。

### 仍会产生看似真实结果的路径

- 关键词分析正常 LLM 路径要求模型估算月搜索量和竞争难度，后端持久化后前端又称其为“真实关键词数据”。关闭 mock 也不会阻止该行为。
- Listing 生成允许模型在没有采购成本、物流、佣金和税费依据时返回 suggested USD price。
- 主后端利润 API/Worker 的部分入口会把缺失包装、运输、平台费、支付费、广告、仓储或其他费用按 0 继续计算；Python 工具层修复不能替代后端所有入口修复。
- 日研候选可出现 `risks: []`；合规扫描在没有授权风险证据时存在默认 LOW/无需人工的路径。
- “运行真实验收链路”存在写入固定 91/92 分、COMPLETED/APPROVED 记录并启用 autonomy 的路径，不能作为真实验收证据。
- Python Agent 保留显式 `COMMERCE_AGENT_MOCK` 测试分支；当前容器该变量未设置，实时路径未启用 mock，但必须持续在健康/报告中暴露该事实。

## 3. 前后端接口不一致的位置

- 后端已设置全局 `/api/v1` 前缀，但 feature flags controller 又声明 `api/v1/flags`，实际 Swagger 路径为 `/api/v1/api/v1/flags`。
- browser extension 默认后端地址是 `http://127.0.0.1:3000/api/v1`；当前 root compose 只对外暴露 nginx 80，默认连接不可达。
- AI Agent Center 的创建、启动、暂停、设置、复制、删除等多个按钮只导航到同一验收页，并未调用对应后端动作。
- 后端 Swagger 启动有重复 DTO 名 `CreateBusinessOutcomeDto` 警告，存在 schema 覆盖风险。
- Agent readiness 只验证心跳和自治线程；LLM、搜索源、供应商证据源和 Ozon 写权限不可用时仍可能返回 ready。后端 readiness 也不会因为历史 failed jobs 或这些业务门禁缺失而失败。

## 4. 使用模拟数据或静态数据的位置

- `agent/web/services/platform_tasks.py` 有显式 mock payload；当前 `COMMERCE_AGENT_MOCK` 未启用，但其中固定价格、固定关键词量、固定趋势和固定质量分说明必须避免误配置。
- 同文件的非 mock 关键词提示词仍要求模型估算 volume/difficulty，属于模型推测，不得标记为真实市场指标。
- Agent roadmap acceptance 路径存在固定 91/92 分和固定完成/批准状态。
- Ozon 核价页预填 SKU、采购成本、重量、尺寸、售价、汇率和费率，且默认 `persist=true`；本地规则快照没有 `effectiveAt/importedAt/expiresAt` 新鲜度门禁。
- AI Agent Center 把健康检查项渲染成 Agent，创建、启动、暂停、设置、复制和删除均只跳转到同一操作页，不会创建任务或改变状态。
- `智能体前端/src/figma-exact` 含静态销售额/订单/利润数组；必须保证这些设计样稿组件不进入生产路由或被标成真实数据。
- 前端若干纯导航按钮和占位页看似可操作但没有业务调用，需要逐页验收并明确禁用/开发中状态。

## 5. 阻塞自动选品和自动上架的问题

1. 公开搜索证据尚未完全绑定原始商品意图，已出现无关类目劫持。
2. 没有任何真实供应商报价或供应商图片证据，采购成本无法复核。
3. 主后端经济性入口尚未统一 fail-closed，税费、退款损耗、汇率、国内/国际物流等字段也未形成完整可追溯输入集。
4. Prisma schema 已定义候选经济性证据/评估/输入三个模型及关联字段，但 87 条迁移均未创建对应表；实时数据库缺表，且 RLS readiness 已因此失败。必须使用外科式迁移补齐，不能直接应用包含无关漂移的全量 diff。
5. 风控在“无证据”情况下不能稳定转为 BLOCKED/人工审核，且风险记录表目前为 0。
6. 没有任何不可篡改发布快照、沙箱报告、批准决策或外部提交记录。
7. 虽然 Ozon 只读订单同步实时可用，但尚未验证当前连接的商品发布 scope、预检、提交、幂等账本和提交后回读。
8. 当前没有合格候选；历史 136 个候选全部 REJECTED，最新 4 个也全部因费用证据不足被阻断。
9. 尚未连续完成 3 轮端到端测试，无法证明没有重复上架、状态错乱或任务丢失。

## 6. P0 / P1 / P2 修复清单

### P0：必须在真实选品或写入 Ozon 前完成

- [x] 固定 Agent POST token 配置漂移；备份、重建、布尔校验、真实 POST 验证。
- [x] 5173 开发代理指向无监听 3100；已改为当前 nginx 入口并验证三条 HTTP 200。
- [x] 前端无退出入口；已 TDD 修复、重建容器、浏览器回归。
- [x] 研究失败 AgentRun 状态分叉；已 TDD 修复、新记录故障注入验证、18 条历史记录可回滚回填。
- [x] Python 利润工具使用 29.99、35%、0 运费和 12% 费率回退；已改为缺数据硬阻断并进入新容器。
- [x] 失败 Agent job 无法按原 requestId 真正重试；已实现 attempt 链和 Redis 原子幂等，并做真实双 attempt 验证。
- [x] 修复 Ozon 证据与原查询无关时仍通过的问题；Agent 与后端双重相关性门禁已测试、重建并使用原错误查询完成真实 422 回归。
- [ ] 主后端所有利润入口统一缺数据硬阻断，补齐税、退款损耗、汇率、包装、国内/国际物流和费用版本证据。
- [ ] 为候选经济性证据/评估/输入模型补齐外科式 Prisma migration、关联字段、索引和强制 RLS；备份后部署并做运行时回归。
- [ ] 风控“无证据”改为 BLOCKED/人工审核，禁止默认 LOW；持久化可追踪 risk record。
- [ ] 移除/隔离模型估算关键词量、无成本建议售价、固定验收分等伪真实数据路径。
- [ ] 清空 Ozon 核价页面的业务预填值，并为规则来源增加权威性、版本、生效/导入/过期时间硬门禁；过期规则不得返回 PASS。
- [ ] 将 AI Agent Center 的假动作改为真实任务 API，或在功能实现前明确禁用，禁止用导航冒充启动/暂停/删除成功。
- [ ] 接入并验证真实供应商报价/图片证据；缺失时继续标记 DATA_INSUFFICIENT。
- [ ] 验证 Ozon 当前连接的发布 scope，在不发布商品的前提下完成只读 diagnostics/preflight；发布必须等完整快照和人工/策略授权。
- [ ] 关闭 23 条 OPEN dead letter 的根因并验证重放/安全终止。

### P1：核心流程稳定性与一致性

- [ ] 修正 `/api/v1/api/v1/flags` 双前缀并做前后端合同测试。
- [ ] 修正 browser extension 默认 3000 端口；评估 access token 存入 `chrome.storage.local` 的风险并改为最小暴露方案。
- [ ] 为 readiness 增加业务依赖明细和 degraded/blocking 语义，不能把“进程活着”等同“可自动选品/发布”。
- [ ] 修复重复 Swagger DTO 名称。
- [ ] 将多个纯导航/占位按钮改为真实动作或明确禁用，不得伪装成功。
- [ ] 为搜索证据保存不可变 raw snapshot/reference；当前 511 条 signal 均有 sourceHash 和 rawData，但 `rawSnapshotRef` 全部为空，缓存来源中多数 rawData 只有 schemaVersion。
- [ ] 对 Stripe 未配置、图片供应商未配置、模型配额耗尽建立明确告警和人工介入状态。

### P2：上线治理

- [ ] 清理旧子项目 compose 与 root compose 的配置漂移，统一运行真相源。
- [ ] 固定 K8s 镜像 digest，补齐非 root、只读文件系统、资源限额、业务探针和 Secret/KMS 验证。
- [ ] 完成生产签名、灾备恢复演练、SLO 告警和容量验证。
- [ ] 完成全部前端页面/按钮逐项浏览器回归和截图归档。

## 当前验收状态

- 候选商品：历史 136 个，全部 REJECTED；最近一批 4 个，全部阻断。
- 通过审核：0
- 已上架：0
- 连续端到端通过轮次：0 / 3
- 当前结论：**BLOCKED，继续修复 P0；禁止宣布测试完成或进入自动上架。**
