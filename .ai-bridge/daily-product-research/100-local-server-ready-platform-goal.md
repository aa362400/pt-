# 100 · 把 Windows 电脑变成可直接使用服务器的全功能平台交付目标提示词

> 使用对象：Codex 或具备本地文件、终端、浏览器和代码修改能力的开发型 AI。  
> 工作区：`G:\平台`。  
> 最终目标：不是再输出一份建议，而是把当前平台修到可以在这台 Windows 电脑上长期运行、局域网访问、登录使用、每日自动选品、查看报告和执行人工审批的可验收状态。

---

## 一、总任务

你现在是这个项目的交付负责人、全栈工程师、测试负责人、Windows 本机服务器运维负责人和跨境选品 Agent 负责人。

请直接在当前仓库中完成实现、测试、部署和验收，不要只写计划，不要在发现第一个失败后停止。持续修复，直到满足本文的完成标准，或只剩下真正依赖外部平台凭证、人工法务判断、路由器权限或不可逆第三方操作的阻塞项。

最终用户必须能够完成以下真实路径：

```text
Windows 电脑开机
→ 本地服务自动启动
→ 浏览器或同一局域网设备打开一个固定地址
→ 登录平台
→ 所有生产导航页面可以打开
→ 页面连接真实后端，不展示伪造业务数据
→ 配置店铺、来源、成本和评分
→ 手动启动一次每日选品
→ 查看运行进度、来源健康、候选和报告
→ 启用北京时间每天 08:00 自动运行
→ 选出 TEST_NOW / WATCH / HOLD / REJECT
→ 人工批准候选进入开发任务或 Listing 草稿
→ 正式上架、改价、广告、采购等外部写操作继续需要人工批准
→ 重启服务后数据、计划和报告仍然存在
```

最终交付必须达到：

```text
我可以直接登录并开始使用，不需要继续阅读代码才能知道怎么启动。
```

---

## 二、必须先读取的权威上下文

按顺序读取：

```text
.ai-bridge/daily-product-research/README.md
.ai-bridge/daily-product-research/00-shared-context.md
.ai-bridge/daily-product-research/99-master-orchestrator.md
.ai-bridge/daily-product-research/14-tests-security-observability.md
.ai-bridge/daily-product-research/15-release-rollout.md
.ai-bridge/daily-product-research/16-final-acceptance.md
本文件
```

随后读取当前代码和测试，不要根据目录名猜测完成度。

当前已知事实需要先验证而不是重建：

- 根目录已有 `docker-compose.prod.yml`，包含 PostgreSQL、Redis、NestJS 后端、React 前端、Python Agent 和 Nginx。
- 前端 `App.tsx` 已有 `/daily-product-research` 和大量业务路由。
- 后端已存在 `后端/src/features/product-research/daily/`，包含连接器、契约、报告、需求、竞争、利润、风险、评分、反馈和 Orchestrator。
- 运行模式已有 `DISABLED / DRY_RUN / SHADOW / PILOT / GENERAL`。
- `externalStoreMutation` 当前固定为 `false`，这个安全边界必须保留。
- 根目录已有 `verify-platform-release.mjs`，可验证后端、前端和 Python Agent。
- 前端仍能检索到 `PlaceholderPage`、`未接入`、禁用按钮、mock 文案和缺少真实后端合同的页面。
- 当前仓库有大量用户未提交修改，禁止清理、覆盖或大范围格式化。

---

## 三、本次授权边界

### 允许执行

你可以：

- 修改当前仓库中的后端、前端、Python Agent、Docker Compose、Nginx、测试、脚本和文档。
- 新增 Prisma 迁移，但不能手工修改生产数据库。
- 在本机启动 Docker、PostgreSQL、Redis、后端、前端、Agent 和 Nginx。
- 安装当前项目确实缺少且必要的依赖，并锁定版本。
- 创建本机安全环境配置、随机密钥和初始化管理员流程。
- 执行数据库迁移、种子、测试数据和本地备份恢复演练。
- 创建 Windows PowerShell 启动、停止、状态、日志、备份、恢复和开机自启脚本。
- 在本机运行浏览器 E2E、API、队列、调度、RLS 和每日选品测试。
- 为本机单用户或指定组织启用所有已验证的安全功能。

### 不允许自动执行

未经明确人工批准，不得：

- 正式向 Ozon、Etsy、Amazon、Temu、eBay 或其它平台发布商品。
- 自动改价、删除或上下架商品。
- 自动开启或调整广告。
- 自动采购、补货、退款、支付或执行其它不可逆第三方写操作。
- 将数据库、Redis、调试端口或管理端口暴露到公网。
- 自动配置路由器公网端口转发。
- 将真实密钥写入 Git、前端、日志、报告或聊天输出。
- 用模拟数字冒充真实市场、订单、利润、趋势或来源状态。

本次默认目标是：

```text
Windows 本机 + 家庭/办公室局域网可用
```

公网远程访问不属于默认完成条件。若发现用户确实需要公网，应只准备经过 TLS、2FA、VPN 或安全隧道的独立方案，不能直接暴露 80/3000/5432/6379。

---

## 四、执行状态文件

创建或维护：

```text
.ai-bridge/local-server-ready/
├── baseline.md
├── page-capability-matrix.md
├── implementation-plan.md
├── progress.md
├── verification-log.md
├── acceptance-evidence.json
├── final-acceptance.md
└── blockers.md
```

不要复制已有大量规划文档。这里仅记录本次“本机服务器可直接使用”冲刺的真实状态。

每次修改前记录：

```text
base revision
工作区 dirty 状态
当前修改文件
用户已有改动
避免覆盖的冲突
```

状态只允许：

```text
NOT_STARTED
IN_PROGRESS
FAILED
BLOCKED_EXTERNAL
COMPLETED
```

---

## 五、第一阶段：真实基线和缺口清单

在改代码前完成一次真实扫描。

### 1. 运行环境

确认并记录：

- Windows 版本。
- Docker Desktop / Docker Engine 是否可用。
- Docker Compose 版本。
- Node、npm、pnpm、Python 和 Git 版本。
- 可用磁盘空间和目标数据目录。
- 当前局域网 IP、网络类型和可用端口。
- 当前机器是否会睡眠、重启后 Docker 是否自动启动。
- PostgreSQL、Redis、后端、前端和 Agent 是否已有进程占用端口。

### 2. 代码和数据库

检查：

- 后端模块是否全部注册。
- Prisma schema 和迁移是否一致。
- 每日选品表和 RLS 是否存在。
- 队列和 Worker 是否真正启动。
- 调度服务是否真正注册。
- Nginx 是否正确代理前端、API、Agent、SSE 和静态资源。
- 本地存储、文件下载和报告工件是否可持久化。
- 是否已有可用管理员账号、组织和工作区。

### 3. 页面矩阵

从以下真实来源生成矩阵：

```text
智能体前端/src/App.tsx
侧边栏和顶部导航
CapabilityCenter / AgentRoadmap
所有 pages 和 pages-v2
所有前端 API 模块
对应后端 controller/service
```

矩阵格式：

| 路由 | 页面 | 后端 API | 数据真实性 | 主要按钮 | 权限 | 状态 | 缺口 |
|---|---|---|---|---|---|---|---|

状态只能是：

```text
READY
PARTIAL
PLACEHOLDER
BROKEN
EXTERNAL_NOT_CONFIGURED
```

必须搜索并处理：

```text
PlaceholderPage
未接入
暂无后端
mock
mockAiReply
TODO
coming soon
disabled=true
固定演示数据
假成功 Toast
空的点击处理器
```

不要机械删除“未接入”文字。必须判断缺的是页面、API、连接器、凭证还是业务不应支持的危险操作。

---

## 六、第二阶段：把 Windows 电脑做成稳定本机服务器

### 1. 采用 Docker Compose 作为默认运行方式

基于现有 `docker-compose.prod.yml` 创建或完善一个本机服务器配置，例如：

```text
docker-compose.local-server.yml
```

服务至少包括：

```text
postgres
redis
backend
agent
frontend
nginx
```

要求：

- 所有服务有 `restart: unless-stopped`。
- PostgreSQL、Redis、Agent 输出、上传、报告和日志使用持久卷或明确宿主目录。
- PostgreSQL 和 Redis 默认只在 Compose 内部网络访问，不映射到局域网。
- 只有 Nginx 对宿主机开放一个稳定端口。
- 后端、Agent 和前端不需要各自对局域网暴露调试端口。
- 添加可靠 healthcheck 和 depends_on 健康依赖。
- Nginx 正确代理 `/api`、认证、SSE、文件、Agent 和前端路由回退。
- 浏览器刷新任意 React 路由不能 404。
- 容器时区和业务时区明确，数据库时间保存 UTC，每日任务使用 `Asia/Shanghai`。

不要直接弱化现有生产 Compose。AWS KMS、S3 等生产配置若不适合个人本机，建立独立 local-server profile，复用项目已有本地加密和本地存储能力，不要把生产安全要求改成全局弱配置。

### 2. 环境配置

创建：

```text
.env.local-server.example
```

只放变量名和说明，不放真实密钥。

本地实际配置：

```text
.env.local-server
```

必须被 Git 忽略。脚本自动生成高强度随机值，并且：

- 不在终端回显完整密钥。
- 不在日志中打印。
- 不在前端构建参数中暴露服务端秘密。
- 使用已有本地密钥引导命令或安全 keyring。
- 记录密钥轮换办法，但不把密钥写进文档。

### 3. 单命令管理脚本

创建幂等 PowerShell 脚本：

```text
scripts/local-server/setup.ps1
scripts/local-server/start.ps1
scripts/local-server/stop.ps1
scripts/local-server/restart.ps1
scripts/local-server/status.ps1
scripts/local-server/logs.ps1
scripts/local-server/backup.ps1
scripts/local-server/restore.ps1
scripts/local-server/verify.ps1
scripts/local-server/install-autostart.ps1
scripts/local-server/remove-autostart.ps1
```

要求：

- `setup.ps1` 检查依赖、生成本地配置、构建镜像、迁移数据库、初始化管理员和工作区、启动服务。
- 重复运行不会破坏数据或创建重复管理员。
- `start.ps1` 一条命令启动平台。
- `status.ps1` 显示容器、健康状态、访问地址、磁盘、下一次每日任务。
- `logs.ps1` 支持按服务查看并默认脱敏。
- `backup.ps1` 备份数据库、报告和必要文件并生成 manifest/hash。
- `restore.ps1` 默认先验证备份，要求显式确认目标，不能误覆盖。
- `install-autostart.ps1` 使用 Windows 任务计划程序或现有可靠方式，在用户登录或 Docker 可用后启动 Compose。
- 开机自启失败时有日志和可诊断状态。

### 4. 局域网访问

自动检测本机局域网 IPv4，并生成实际地址，例如：

```text
http://192.168.x.x:<port>
```

要求：

- 从本机通过 localhost 和局域网 IP 都能访问。
- Windows 防火墙规则只允许 Private 网络配置文件和所需 Nginx 端口。
- 不开放 PostgreSQL、Redis、后端调试端口和 Python 调试端口。
- 若没有管理员权限，生成需要用户执行的一条明确 PowerShell 命令，并把状态记为 `BLOCKED_EXTERNAL`，不要假装已开放。
- 文档说明保持电脑通电、网络稳定和不进入睡眠的必要条件。
- 不自动修改路由器。

---

## 七、第三阶段：管理员、组织和首次使用

平台启动后必须能完成首次登录。

实现或验证：

- 创建一个本地 OWNER 管理员的安全引导流程。
- 首次密码随机生成或由用户在初始化时输入，不硬编码默认弱密码。
- 首次登录后要求修改密码。
- 创建默认 organization 和 workspace。
- 创建或引导创建 StoreAgentProfile。
- 管理员可以配置来源、工作区、阈值、成本和调度。
- 2FA 若已有则保持可用，不为了方便关闭安全机制。
- 初始化脚本输出登录 URL、用户名和“如何取得一次性密码”的方法，但不把密码写进长期日志。

从空数据卷开始必须能完成初始化。从已有数据卷启动不得重复创建组织或破坏账号。

---

## 八、第四阶段：补齐所有生产导航页面

### 总要求

所有在生产导航中可见的路由必须满足：

```text
页面真实存在
API 真实存在
加载状态存在
空状态存在
错误状态存在
权限状态存在
移动端或窄屏可用
没有浏览器控制台错误
没有未处理 Promise
没有假成功
没有本地伪造业务数字
```

### 禁止完成方式

禁止：

- 用新的漂亮 Placeholder 替代旧 Placeholder。
- 用静态卡片或随机数字假装后端完成。
- 仅删除禁用属性但按钮没有真实动作。
- 仅隐藏报错。
- 将外部连接器未配置误报为“健康”。
- 为了“页面全开”绕过权限和人工审批。

### 页面处理规则

1. **当前内部后端能力已经存在**  
   连接真实 API，补齐 DTO、API client、状态和交互。

2. **缺少内部 API，但可以在本机实现**  
   实现 controller、service、repository、Prisma/队列契约和测试，再连接页面。

3. **依赖外部平台凭证**  
   页面必须成为完整的“连接、状态、测试、重试、导入、错误诊断”页面。未配置时显示 `NOT_CONFIGURED`，不能显示假业务数据。

4. **依赖外部平台未开放的接口**  
   实现统一 adapter、能力声明、CSV/人工导入和安全空状态。生产导航可以保留，但必须让用户知道如何变为可用。

5. **危险外部写操作**  
   页面可以展示草稿、预览和审核流程，但最终动作必须经过 ReviewTask、RBAC、能力令牌和审计。

### 必须重点清零的缺口

扫描并处理当前已出现的类别：

- `PlaceholderPage` 路由。
- TopBar 中永久禁用的平台按钮。
- AgentInputDock 中深度研究、联网搜索、上传等无真实处理器的按钮。
- Customer Service 没有真实后端合同。
- Listing 的分享、反馈、A+、图片建议、多平台派生缺失。
- TEMU 商品和订单同步缺失。
- ProductResearch 视频上传、机会分、市场规模、竞争等级和销量字段缺失。
- ProfitCalculator 三情景和预测字段缺失。
- StoreMonitor 广告、流量、评价和结构化建议缺失。
- Marketing 页面静态卡片或未接真实数据。
- Automation 没有实时队列阶段进度。
- 各页面所有 mock 文案和演示数据。

对每一项选择并记录：

```text
IMPLEMENTED
CONNECTED
EXTERNAL_NOT_CONFIGURED
REMOVED_FROM_PRODUCTION_NAVIGATION
```

`REMOVED_FROM_PRODUCTION_NAVIGATION` 只能用于当前产品明确不应提供的功能，必须在矩阵中说明理由，不能用来逃避工作。

### 浏览器验收

对每个生产路由执行真实浏览器检查：

- 页面可打开。
- 刷新后可打开。
- 导航高亮正确。
- 关键 API 返回成功或真实空状态。
- 没有 404、白屏和 console error。
- 按钮有真实结果。
- 表单有校验。
- 权限不足时后端也拒绝。
- 关键流程保留截图或 E2E 证据。

---

## 九、第五阶段：启用全部“安全可用”功能

“全部打开”定义为：

```text
所有已实现、测试通过、不会造成未经批准外部写入的功能，对本机 OWNER 组织可见且可使用。
```

### 每日选品运行模式

本机单用户验收优先使用：

```text
PILOT
```

将实际 organizationId 加入 Pilot allowlist，并启用：

```text
scheduler
已配置的只读真实 connectors
CSV / 人工导入
Agent summaries
internal development actions
feedback learning
member visibility
```

全部通过后可评估切换 `GENERAL`，但不是为了隐藏 Pilot 配置问题而强行切换。

必须继续保持：

```text
externalStoreMutation = false
```

### Feature Flag

扫描所有功能开关，建立清单：

| Flag | 当前值 | 依赖 | 测试 | 本机目标值 | 原因 |
|---|---|---|---|---|---|

规则：

- 实现完整且测试通过的内部/只读功能可以启用。
- 需要真实凭证的功能只有在凭证校验通过后启用真实调用。
- 付费、高风险或外部写功能不能因为用户说“全开”而绕过人工确认。
- Flag 变更必须有审计。
- 配置服务失败时采用保守值。

---

## 十、第六阶段：让每日选品真正正常运行

### 1. 调度

目标配置：

```text
timezone = Asia/Shanghai
每日执行 = 08:00
candidateLimit = 300
topLimit = 10
```

要求：

- 时区不依赖 Windows 或容器默认时区。
- 数据库存储 UTC，businessDate 使用 Asia/Shanghai。
- 同 organization + workspace + businessDate + configVersion 只有一个有效 run。
- 多实例、重复 job、Worker 重启都不会重复运行。
- 服务错过 08:00 时按补偿窗口只补跑一次。
- 计划保存在数据库，容器重启不丢失。
- 后台可以启用、暂停并查看 nextRunAt。

### 2. 至少一个真实可执行来源路径

每日自动运行不能只依赖用户每次手工粘贴候选。

按优先级使用：

```text
已验证只读平台连接器
自有店铺数据
Ozon 证据缓存或当前已验证来源
供应链数据
已持久化并通过 schema 的 CSV/人工导入来源
```

若外部平台凭证缺失：

- 仍需让定时任务基于已持久化导入和内部数据运行。
- 报告明确来源数量和置信度。
- 不伪造 Amazon、Etsy、Temu 或其它来源成功。
- 来源状态显示 `NOT_CONFIGURED` 或 `CSV_ONLY`。

### 3. 完整流水线

一次 run 必须按数据库状态执行：

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

要求：

- 每阶段有开始、完成、失败、耗时和统计。
- 单来源失败不终止其它来源。
- 部分来源失败最终为 `PARTIAL`，报告继续生成。
- 所有来源失败最终为 `FAILED`，生成可诊断异常记录。
- LLM 摘要失败不能破坏确定性利润、风险和评分。
- 重试不重复写候选、信号、分数和报告。

### 4. 业务正确性

必须证明：

- 每个候选有稳定 candidateId 和 fingerprint。
- 同 fingerprint 不重复占 TOP。
- 近 30 天已进入 TOP 的完全相同产品不会再次占榜。
- `topLimit=10` 是上限，不是配额。
- 只有 3 个合格产品就输出 3 个。
- 零个合格产品时生成 `NO_TOP` 正常报告，不把 WATCH 提升为 TEST_NOW。
- 未知值是 null/待验证，不是 0。
- 只有播放或点赞的弱信号不能 TEST_NOW。
- HIGH/BLOCKED 风险无论利润多高都 REJECT。
- 关键成本或汇率缺失不能 TEST_NOW。
- 广告前毛利和广告后净利润分开。
- UV/激光产品包含工时、耗材、失败、报废和产能。

### 5. 报告

每次 run 至少生成并可在页面查看：

```text
daily-top10.md
daily-top10.json
watchlist.json
rejected.json
risk-report.json
source-health.json
run-log.json
```

要求：

- JSON 和 Markdown 来源于同一个不可变 snapshot。
- 工件持久化，重启后仍可读。
- 下载和查看受组织权限保护。
- Markdown 转义不可信文本和 URL。
- run-log 是安全摘要，不含密钥和敏感原始 payload。

### 6. 人工批准闭环

从 TEST_NOW 候选执行：

```text
查看证据
→ 查看需求、竞争、利润、风险和评分拆解
→ 输入批准理由
→ 创建内部产品开发任务或 Listing 草稿
→ 创建或关联 ReviewTask
→ 通知中心可见
```

重复点击应返回已有资源，不重复创建。

拒绝时：

- 原因必填。
- 写入反馈和审计。
- 30 天内不静默回到待审核。

全流程必须证明没有执行外部店铺写入。

---

## 十一、第七阶段：备份、恢复、日志和监控

### 备份

至少备份：

```text
PostgreSQL
报告工件
Agent profiles / outputs
本地上传文件
必要配置引用和版本清单
```

执行一次真实演练：

```text
创建测试数据
→ 备份
→ 在隔离数据库或卷恢复
→ 校验行数、关键对象、报告 hash
```

不要为了演练覆盖当前用户数据。

### 监控

本机可查看：

- `/health` 和 `/ready`。
- 后端指标。
- 队列积压。
- 每日运行成功率。
- 来源健康。
- Agent 调用错误和成本。
- 报告生成失败。
- 下次计划时间。
- 磁盘空间和数据卷大小。

复用现有 Prometheus/Grafana 时必须显示真实数据。若本机默认不启动完整监控栈，`status.ps1` 和平台 Enterprise Readiness 页面至少提供关键健康摘要。

### 告警

至少实现本地可见告警：

- 每日任务在宽限期后未运行。
- run FAILED。
- 所有来源失败。
- 队列长期积压。
- 数据库或 Redis 不健康。
- 报告无法生成。
- 磁盘空间不足。
- 评分版本无 ACTIVE。
- 风险规则过期。

---

## 十二、第八阶段：测试和修复循环

不要先把所有代码写完再测。每个缺口按以下循环：

```text
写失败测试
→ 确认失败原因正确
→ 最小实现
→ 定向测试
→ 集成测试
→ 浏览器验证
→ 记录证据
```

### 必须执行的验证

根据当前项目真实命令运行并记录完整结果：

```text
后端 build
后端 lint
Prisma validate
Prisma migrate deploy / status
后端完整测试
前端 lint
前端生产 build
前端测试
Python Agent 完整 pytest
平台发布门禁 verify-platform-release.mjs
Docker Compose config 校验
Docker 镜像构建
容器健康检查
API E2E
RLS 跨租户测试
队列重复和恢复测试
每日选品 synthetic E2E
真实本机手动 run
浏览器全路由 smoke/E2E
备份恢复演练
```

全量命令失败时：

1. 判断是否为本次修改引入。
2. 对本次引入的问题持续修复。
3. 对基线已有问题提供证据并尽量修复。
4. 不得把未运行、失败或被跳过写成通过。

### 浏览器测试要求

使用真实启动的平台，不仅测试组件：

- 登录。
- 导航全部生产路由。
- 触发页面主要动作。
- 检查 Network 失败。
- 检查 Console error。
- 检查 React 白屏和路由刷新。
- 记录关键页面截图。
- 从局域网 IP 地址而非只用 Vite 开发端口验证一次。

---

## 十三、强制验收场景

### 场景 A：首次安装

```text
空数据卷
→ setup.ps1
→ 服务健康
→ 创建管理员和默认组织/工作区
→ 登录成功
```

### 场景 B：重启持久化

```text
创建商品、配置和一次 run
→ restart.ps1 或重启容器
→ 登录
→ 数据、计划、候选和报告仍存在
```

### 场景 C：每日选品成功

```text
配置至少一个有效来源
→ 手动运行
→ PENDING → RUNNING → COMPLETED 或合理 PARTIAL
→ 候选可查看
→ 七类报告可查看
→ nextRunAt 为北京时间下一次 08:00
```

### 场景 D：来源故障

```text
一个来源超时
→ 其它来源继续
→ SourceHealth 记录失败
→ run PARTIAL
→ 报告继续生成
```

### 场景 E：硬风险

```text
高需求高利润候选 + HIGH 品牌/角色风险
→ REJECT
→ 不进入 TOP
→ 不允许创建上架动作
```

### 场景 F：弱信号

```text
只有播放/点赞
→ WATCH 或 INVALID
→ 不得 TEST_NOW
```

### 场景 G：TOP 去重和不凑数

```text
相同 fingerprint 的多个变体
→ TOP 只出现一个
合格候选不足 10
→ 不补低质量产品
```

### 场景 H：批准开发

```text
TEST_NOW 候选
→ 人工批准
→ 内部开发任务/Listing 草稿/ReviewTask
→ 通知可见
→ externalStoreMutation = false
```

### 场景 I：局域网访问

```text
服务只开放 Nginx 入口
→ localhost 可访问
→ 本机局域网 IP 可访问
→ DB/Redis 端口不对局域网开放
```

### 场景 J：备份恢复

```text
备份
→ 隔离恢复
→ 数据库对象、报告和 hash 一致
```

---

## 十四、最终完成标准

只有以下全部满足，才可以向用户说“平台可以直接开始使用”：

### 服务器

```text
[ ] 一条 setup 命令可完成初始化
[ ] 一条 start 命令可启动
[ ] 一条 status 命令可诊断
[ ] Windows 重启后可自动恢复服务
[ ] Nginx 是唯一局域网入口
[ ] PostgreSQL 和 Redis 不暴露到局域网
[ ] 数据卷持久化
[ ] 备份和隔离恢复演练通过
```

### 页面

```text
[ ] 所有生产导航路由可打开和刷新
[ ] 不再有通用 PlaceholderPage 出现在生产导航
[ ] 不再有可由本机实现却永久禁用的按钮
[ ] 页面没有固定假数据和假成功
[ ] 外部未配置功能有完整配置/导入/状态页面
[ ] 所有页面有 loading/empty/error/permission 状态
[ ] 浏览器无未处理 console error
```

### 每日选品

```text
[ ] 手动 run 成功
[ ] 每日 08:00 计划已启用
[ ] nextRunAt 正确
[ ] 同日幂等
[ ] Worker 可恢复
[ ] 单来源失败不终止全流程
[ ] 候选保留来源证据
[ ] 不编造缺失数据
[ ] 完整利润和产能可计算
[ ] HIGH/BLOCKED 风险一票否决
[ ] TOP 不重复、不凑数
[ ] 七类 MD/JSON 报告可查看
[ ] 人工批准可创建内部开发资源
[ ] 外部写操作没有自动执行
```

### 质量和安全

```text
[ ] 后端 release verify 通过
[ ] 前端 release verify 通过
[ ] Python Agent 完整测试通过
[ ] verify-platform-release.mjs 通过
[ ] Prisma migration 和 RLS 通过
[ ] API 鉴权和 RBAC 通过
[ ] 没有服务端密钥进入前端和日志
[ ] 没有高严重度未处理漏洞
[ ] 浏览器全路由 E2E 通过
```

### 用户交付

```text
[ ] 给出一个实际可访问 URL
[ ] 给出首次登录方法
[ ] 给出 start/stop/status/backup 命令
[ ] 给出当前已启用来源和未配置来源
[ ] 给出下一次每日运行时间
[ ] 给出一份真实完成的每日选品报告
[ ] 给出所有测试和验收证据
```

---

## 十五、外部阻塞的处理

以下可以标记 `BLOCKED_EXTERNAL`：

- 缺少某个平台正式 API 凭证。
- 平台没有提供所需接口或权限。
- 缺少路由器或 Windows 管理员权限。
- 需要人工法务判断。
- 需要真实经营成熟期才能计算的长期指标。

但即使存在外部阻塞，本机平台仍必须达到可接受状态：

- 页面完成。
- 连接配置完成。
- CSV/人工导入完成。
- 状态真实。
- 其它已配置来源正常运行。
- 每日选品可基于真实内部或导入数据完成。

以下不能标记外部阻塞：

- 可以从仓库读取的信息。
- 可以写代码实现的内部 API。
- 可以使用 PostgreSQL/Redis/Mock/CSV 验证的行为。
- 页面缺少 loading 或 error 状态。
- 测试失败。
- Docker Compose、脚本或 Nginx 配置缺失。

---

## 十六、最终输出格式

完成后生成：

```text
.ai-bridge/local-server-ready/final-acceptance.md
docs/ops/local-server-runbook.md
```

最终回复必须包含：

```markdown
# 本机服务器平台交付结果

## 判定
READY | CONDITIONAL_READY | NOT_READY

## 访问
- 本机地址：
- 局域网地址：
- 登录方式：
- 下一次每日选品：

## 一键命令
- 初始化：
- 启动：
- 停止：
- 状态：
- 日志：
- 备份：
- 恢复：
- 验收：

## 已启用功能
- ...

## 每日选品证据
- runId：
- 状态：
- 候选数：
- TEST_NOW：
- WATCH：
- HOLD：
- REJECT：
- 报告工件：
- nextRunAt：

## 页面验收
- 总路由数：
- READY：
- EXTERNAL_NOT_CONFIGURED：
- 失败：

## 验证命令
- command：
  result：passed | failed
  evidence：

## 外部阻塞
- ...

## 安全边界
- externalStoreMutation：false
- 对外开放端口：
- 数据库/Redis 是否仅内部：

## 回滚
- ...
```

判定规则：

- `READY`：所有本机平台、页面、每日选品、测试和交付标准通过。
- `CONDITIONAL_READY`：平台可直接使用，但存在明确的外部平台未配置项，不影响内部数据、CSV 或已配置来源的每日选品。
- `NOT_READY`：服务器无法稳定启动、核心页面失败、每日选品无法完成、数据不持久、关键测试失败或存在严重安全问题。

不得在没有实际 URL、真实登录、真实 run、报告、重启持久化、浏览器验证和测试证据时给出 `READY`。

---

## 十七、执行提醒

- 不要只写“建议使用 Docker”，要把 Compose 和脚本真正做出来并运行。
- 不要只写“页面需要补齐”，要逐路由完成并测试。
- 不要只写“每日任务应该运行”，要真实创建一次 run 并在页面看到结果。
- 不要为了全绿删除测试、放宽风险门槛或使用假数据。
- 不要覆盖用户已有未提交修改。
- 不要自动 commit、push 或部署公网。
- 遇到长任务时更新 `progress.md`，继续执行，不要提前结束交付。
- 证据优先于声明。没有证据就不是完成。
