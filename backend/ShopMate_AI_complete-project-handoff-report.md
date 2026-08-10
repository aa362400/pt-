# ShopMate AI — 完整项目交接报告（0→1 全量复查用）

> 生成日期：2026-07-05  
> 项目规模：前端 10 页面 + 后端 25 模块  
> 构建状态：前端 ✅ npm run build 通过 | 后端 ✅ nest build 通过  
> 参考设计图：01.png ~ 10.png（位于 C:\Users\1\Desktop\ShopMate AI 图片\）

---

## 第一章：项目概览

| 维度 | 前端 | 后端 |
|------|------|------|
| **路径** | D:\智能体前端 | D:\后端 |
| **技术栈** | React 19 + TS6 + Vite 8 + Tailwind v4 + Recharts + lucide-react | NestJS 11 + TS5.9 + Prisma 6 + PostgreSQL + BullMQ + Redis |
| **启动命令** | pnpm run dev → :5173 | pnpm run start:dev → :3000 |
| **构建命令** | pnpm run build ✅ | nest build ✅ |
| **设计语言** | 主色 #6C63FF 紫蓝系 / 背景 #F8F9FF / 白卡片 + 1px 圆角边框 | — |
| **智能体边界** | 全部 AI 区域为占位 UI + 空回调 | AgentProvider 接口 + Mock 实现，HttpAgentProvider 可替换 |

---

## 第二章：前端 — 14 个页面路由

| 路由 | 页面名 | 对应设计 | 页面文件 | 已实现功能 |
|------|--------|---------|---------|-----------|
| /assistant | 智能助手首页 | 05.png | Dashboard.tsx | Hero 欢迎 + 6 快捷按钮(点击写入输入框+Toast) + 4 指标卡(今日机会/爆品洞察/利润预估/关键词建议) + 趋势洞察 3 列(季节性/地区/飙升词) + 成就卡(渐变奖杯) + AI 输入 dock + send→mock 对话 |
| /team | 团队协作与知识库中心 | 01.png | TeamCollaboration.tsx | Hero 渐变横幅(含 3 浮动标签) + AI 团队助手(快捷提示→写入输入框，send→mock 回复) + 我的提示词(新建弹窗含标题+内容 textarea) + 4 卡片(知识库/SOP/动态/任务) + 最近项目空间 |
| /automation | 自动化流程与 Agent 执行台 | 02.png | Automation.tsx | 机器人插画 + 4 指标卡 + 创建流程卡片(从模板创建→Modal+自定义流程→Toast) + 流程列表(Tab 筛选/搜索过滤/开关切换/更多操作下拉) + Agent 控制台(指令+send→mock 回复) + 执行队列进度 + 模板中心 |
| /store-monitor | 店铺监控与预警中心 | 03.png | StoreMonitor.tsx | 6 指标条(健康分/订单/销售额/转化率/ACOS/差评率) + 核心指标趋势 3 折线 + 预警列表(点击查看详情 Modal) + 店铺表现表 + 关键词洞察 4 卡 + 库存预警表 + AI 智能助手(一键优化/补货计划/详情 Modal + mock 对话) |
| /trend-radar | 趋势洞察与市场雷达 | 04.png | TrendInsight.tsx | 4 Tab(欧美市场/节日趋势/礼品场景/定制元素，各切换数据集) + 趋势总览折线图(双线) + 季节机会地图(4 区域浮层) + 飙升品类 Top5(进度条) + 社媒话题 3 卡 + 场景圆环图 + 区域增长榜 + AI 输入 dock + send→mock 回复 |
| /product-research | 选品研究工作台 | 06.png | ProductResearch.tsx | 4 能力按钮 + 大输入卡(快捷→写入搜索框) + 开始研究→loading→结果更新 + 平台 Tab(4 平台) + 筛选下拉(全部类目/近 30 天) + 5 洞察卡(市场需求趋势折线、竞争格局圆环、痛点进度条、礼品标签、定制标签) + 高潜力选品 4 卡(详情 Modal) |
| /profit-calculator | 利润计算与定价助手 | 07.png | ProfitCalculator.tsx | 5 Tab(利润计算/定价建议/盈亏平衡/情景模拟/历史记录，各切换内容) + 成本输入(8 项可编辑+实时重算 totalCost/profit/margin/ROI) + 定价计算器(建议售价区间+利润分布圆环图) + 推荐定价区间 + 盈亏平衡折线图(平衡点标注) + 利润趋势预测(3 情景折线) + 情景模拟 + AI 生成情景 |
| /listing-generator | AI Listing 生成中心 | 08.png | ListingGenerator.tsx | 5 步进度条 + 左侧模块菜单 5 项(标题/五点/卖点/SEO/多平台，切换联动内容) + 聊天生成区(历史记录 Modal+重新生成轮换+润色 Toast+翻译 Toast+更多操作下拉) + 实时预览(Amazon 商品详情模拟) + 底部操作条(保存草稿/一键生成全部/导出 CSV→Toast) |
| /keyword-analysis | 关键词分析中心 | 09.png | KeywordAnalysis.tsx | 欢迎区 + 搜索框 + Chip 6 个(点击→写入搜索框+更新表头，换一批轮换 3 组) + 平台筛选 Tab 5 + 类目/国家/筛选 Dropdown + 关键词表(check 框+搜索量+趋势 sparkline+难度进度条+机会分+平台+操作) + 搜索趋势折线图(5 词) + 机会圆环图 + 长尾词列表 + 推荐上架词 + 洞察卡 + AI 深度分析(mock 对话) |
| /image-prompt | AI 图片与 Prompt 工作台 | 10.png | ImageWorkbench.tsx | 3 模式卡(亚马逊主图/生活场景/细节图，切换联动聊天+预览) + 聊天工作区(消息气泡+结果预览+生成按钮 mock→loading→完成) + Prompt 编辑器(复制 Toast+优化改写) + 风格预设 6 个(点击选中态) + 场景建议 4 个(点击追加到 textarea) + 图片设置(尺寸/数量/质量/背景) + 应用设置 Toast |
| /opportunity | 今日机会 | — | Dashboard 特化 | 复用 Dashboard 今日机会卡片区 |
| /hot-products | 爆品洞察 | — | Dashboard 特化 | 复用 Dashboard 爆品洞察卡片区 |
| /competition | 竞品分析 | — | PlaceholderPage | 4 指标卡(监控 128 竞品/均价差/上新/份额) + 竞品数据表格(名称/份额/价格/评分/趋势) |
| /market | 市场大盘 | — | PlaceholderPage | 4 指标卡(规模/卖家数/客单价/增长率) + 区域市场数据表格(区域/增长/体量) |

---

## 第三章：前端 — 组件体系

### 3.1 Shell 组件
**Sidebar** (components/sidebar/Sidebar.tsx)：
- Logo: 渐变 S 图标 + ShopMate AI + Pro 标签
- 14 个导航项：智能助手、今日机会、爆品洞察、选品研究、关键词分析、Listing 生成、利润计算器、店铺监控、趋势洞察、团队协作、自动化流程、图片工作台、竞品分析、市场大盘
- 当前导航：浅紫背景(#F0EEFF) + 紫色文字(#6C63FF)
- 销售渠道：Amazon(黑底)，Etsy(橙底)，TikTok Shop(黑底)，Temu(橙底)，独立站(蓝底)+ 添加更多渠道按钮
- 管理按钮→渠道管理 Modal(已连接列表)
- 添加更多渠道→添加 Modal(5 平台可选)
- 底部升级卡：浅紫渐变 + 火箭图标 + 3 行权益 + 立即升级按钮→升级 Modal(6 项权益对比+付费按钮)

**TopBar** (components/topbar/TopBar.tsx)：
- 左侧：闪光图标 + 当前页面标题 + 页面说明
- 右侧：邀请有礼(Toast 通知) + 通知铃铛(红点+Toast) + 语言切换(Dropdown: 简体中文/English) + 分割线 + 圆形渐变头像 + "你好，Olivia 👋" + "专业版 剩余 12 天"

### 3.2 UI 组件库（11 个可复用组件）

| 组件 | 文件 | Props | 用途 |
|------|------|-------|------|
| StatsCard | ui/StatsCard.tsx | icon, value, label, trend?, color? | 指标卡(大数字+趋势箭头) |
| MetricCard | ui/MetricCard.tsx | title, value, change?, changeLabel?, icon? | 指标卡(变化百分比) |
| ChartCard | ui/ChartCard.tsx | title, subtitle?, children, action? | 图表容器(标题+内容) |
| StatusBadge | ui/StatusBadge.tsx | status: running/success/warning/danger/pending/paused | 状态标签(圆点+文字) |
| AgentInputDock | ui/AgentInputDock.tsx | placeholder?, onSendMessage?, onUploadFile?, extraButtons?, value?, onValueChange? | AI 输入栏(输入框+5 快捷按钮+发送) |
| AssistantPanel | ui/AssistantPanel.tsx | title?, messages?, onSendMessage? | AI 助手面板(消息列表+输入) |
| AgentConsoleSlot | ui/AgentConsoleSlot.tsx | quickCommands?, onCommand? | Agent 控制台(指令+输入+在线状态) |
| RobotIllustration | ui/RobotIllustration.tsx | size?, variant?: default/welcome/working | SVG 机器人插画(3 形态) |
| Toast | ui/Toast.tsx | ToastProvider + useToast() | 全局通知组件(success/error/info/warning) |
| Modal | ui/Modal.tsx | open, onClose, title, children, width? | 通用弹窗(ESC+遮罩关闭) |
| Dropdown | ui/Dropdown.tsx | trigger, children, align? + DropdownItem | 下拉菜单 |

### 3.3 交互状态覆盖
- 所有按钮 hover/active/focus 状态 ✅
- 输入框 focus 紫色边框 + 轻微外发光 ✅
- 按钮点击 → Toast / Modal / Dropdown ✅
- Tab 切换 → 内容联动更新 ✅
- 搜索输入 → 列表实时过滤 ✅
- 生成类按钮 → Loading 态 → Toast 完成 ✅
- 发送消息 → user bubble + assistant bubble(mock) ✅
- 成本编辑 → 实时重算 totalCost/profit/margin/ROI ✅
- data-testid 部署在关键交互元素 ✅

---

## 第四章：后端 — 架构

### 4.1 目录结构
```
D:\后端\
├── prisma/
│   ├── schema.prisma         # 26 数据模型 + 25 枚举(925 行)
│   └── seed.ts               # 模拟种子数据
├── src/
│   ├── main.ts               # 启动(bootstrap)：Helmet + CORS + Swagger + ValidationPipe
│   ├── app.module.ts          # 根模块(导入全部子模块)
│   ├── agents/                # 智能体接入层
│   │   ├── agent-provider.interface.ts  # 7 方法接口定义
│   │   ├── mock-agent.provider.ts       # Mock 实现(返回静态数据)
│   │   └── agent.module.ts             # AGENT_PROVIDER token 注入
│   ├── features/              # 25 个业务模块
│   │   ├── auth/              # ✅ 真实 JWT 认证(register/login/refresh/me/logout)
│   │   └── 24 个模块骨架      # controller + service + repository + dto + module
│   ├── shared/                # 共享基础设施(8 个子系统)
│   │   ├── auth/              # JWT 策略 + 守卫 + @CurrentUser() 装饰器
│   │   ├── config/            # Zod 环境变量校验(19 个变量)
│   │   ├── database/          # PrismaService + 全局 PrismaModule
│   │   ├── errors/            # 全局异常过滤器 + 6 种自定义异常
│   │   ├── logging/           # 结构化 JSON 日志
│   │   ├── middleware/        # UUID requestId(AsyncLocalStorage)
│   │   ├── queue/             # BullMQ 队列(agent-runs/automation-runs/exports/notifications)
│   │   ├── rbac/              # @Roles() 装饰器 + RolesGuard(owner/admin/member/viewer)
│   │   └── storage/           # StorageProvider 接口 + LocalStorage 实现(可切 S3)
│   └── workers/               # 3 个队列消费者
│       ├── agent-run.worker.ts
│       ├── automation.worker.ts
│       └── export.worker.ts
├── .env.example               # 环境变量模板
└── dist/                      # 构建产物 ✅
```

### 4.2 技术决策
| 决策 | 选择 | 原因 |
|------|------|------|
| 框架 | NestJS 11 | 企业级 Node.js 框架，内置 DI/Guard/Interceptor |
| 模块结构 | feature-first | 每个模块 5 文件独立，不混用分层 |
| ORM | Prisma 6 | 类型安全，迁移方便 |
| 数据库 | PostgreSQL | 稳定成熟 |
| 缓存/队列 | Redis + BullMQ | 任务调度 + 幂等 + 重试 |
| 认证 | JWT(access 15m + refresh 7d) | 无状态，httpOnly cookie 存储 refresh token |
| 密码 | Argon2 | 内存硬哈希，抗 GPU 攻击 |
| 校验 | class-validator(DTO) + Zod(env) | 运行时 + 启动时双重校验 |
| API 文档 | Swagger/OpenAPI | 自动生成 |
| 存储 | 接口注入 | LocalStorage 默认，S3 配置即切 |
| 智能体 | DI token | 通过 AGENT_PROVIDER 注入，业务代码不依赖实现 |

### 4.3 25 个业务模块

| # | 模块 | 目录 | 关键端点 | 状态 |
|---|------|------|---------|------|
| 1 | Auth | features/auth | POST register/login/refresh, GET me, POST logout | ✅ 完整实现 |
| 2 | Users | features/users | GET / PATCH profile | 骨架 |
| 3 | Organizations | features/organizations | CRUD + members + invitations | 骨架 |
| 4 | Workspaces | features/workspaces | CRUD + connect-channel + sync | 骨架 |
| 5 | Channels | features/channels | CRUD | 骨架 |
| 6 | Products | features/products | CRUD | 骨架 |
| 7 | Files | features/files | presign-upload, complete-upload | 骨架 |
| 8 | KnowledgeBase | features/knowledge-base | CRUD | 骨架 |
| 9 | SOPs | features/sops | CRUD + publish | 骨架 |
| 10 | Tasks | features/tasks | CRUD + complete | 骨架 |
| 11 | Prompts | features/prompts | CRUD | 骨架 |
| 12 | Assistant | features/assistant | sessions + messages + runs | 骨架 |
| 13 | AgentRuns | features/agent-runs | status + events(SSE) | 骨架 |
| 14 | Automation | features/automation | flows + runs + enable/disable | 骨架 |
| 15 | StoreMonitoring | features/store-monitoring | summary + metrics + alerts | 骨架 |
| 16 | Trends | features/trends | overview + categories + analyze | 骨架 |
| 17 | ProductResearch | features/product-research | reports + refresh | 骨架 |
| 18 | Keywords | features/keywords | reports + export | 骨架 |
| 19 | Listings | features/listings | drafts + generate + approve + export | 骨架 |
| 20 | ProfitCalculator | features/profit-calculator | calculations + scenarios | 骨架 |
| 21 | ImagePrompt | features/image-prompt | projects + optimize + generate | 骨架 |
| 22 | Billing | features/billing | plan + usage + checkout | 骨架 |
| 23 | Notifications | features/notifications | list + read | 骨架 |
| 24 | AuditLogs | features/audit-logs | list | 骨架 |
| 25 | Dashboard | features/dashboard | overview + opportunities | 骨架 |

### 4.4 智能体接口

```typescript
// agent-provider.interface.ts
export interface AgentProviderInterface {
  runAssistant(input: AgentRunOptions): Promise<string>;
  runListingGeneration(input: ListingGenerationInput): Promise<ListingResult>;
  runKeywordAnalysis(input: KeywordAnalysisInput): Promise<KeywordResult>;
  runProductResearch(input: ProductResearchInput): Promise<ResearchResult>;
  runTrendAnalysis(input: TrendAnalysisInput): Promise<TrendResult>;
  runImagePrompt(input: ImagePromptInput): Promise<ImagePromptResult>;
  runAutomationStep(input: AutomationStepInput): Promise<unknown>;
}
```

默认实现 `MockAgentProvider` 返回结构化静态数据。设置环境变量 `AGENT_BASE_URL` 后可切换为 `HttpAgentProvider`。

---

## 第五章：后端 — 数据模型（26 个）

完整 Prisma Schema 位于 `prisma/schema.prisma`（925 行），包含 26 个模型和 25 个枚举。

| # | 模型 | 关键字段 | 关系 |
|---|------|---------|------|
| 1 | User | id, email, passwordHash, name, avatarUrl, locale, timezone, status | →Membership, →Session, →AgentRun |
| 2 | Organization | id, name, slug, plan, trialEndsAt | →Membership, →Workspace |
| 3 | Membership | userId, orgId, role(owner/admin/member/viewer), status | User ↔ Organization |
| 4 | Workspace | orgId, name, channelType, marketplace, currency | →ChannelConnection, →Product |
| 5 | ChannelConnection | workspaceId, provider, tokens(加密), syncStatus | →Workspace |
| 6 | Product | workspaceId, title, sku, asin, images, cost, price, metadata | →Workspace, →ListingDraft |
| 7 | FileAsset | orgId, storageKey, mimeType, size, purpose | →Organization |
| 8 | KnowledgeDocument | orgId, title, content, tags, visibility | →Organization |
| 9 | Sop | orgId, title, steps(jsonb), status | →Organization |
| 10 | TeamTask | orgId, title, priority, status, dueAt, assigneeId | →Organization |
| 11 | PromptTemplate | orgId, title, category, content, variables(jsonb) | →Organization |
| 12 | AssistantSession | orgId, userId, title, status | →Message |
| 13 | AssistantMessage | sessionId, role, content, attachments(jsonb) | →Session |
| 14 | AgentRun | orgId, agentType, status, input/output(jsonb), tokenUsage | →Organization |
| 15 | AutomationFlow | orgId, name, triggerType, steps(jsonb), status | →AutomationRun |
| 16 | AutomationRun | flowId, status, result/error(jsonb) | →Flow |
| 17 | StoreMetricSnapshot | workspaceId, date, healthScore, orders, revenue, acos | →Workspace |
| 18 | Alert | orgId, type, severity, title, status, source | →Organization |
| 19 | TrendInsight | orgId, market, category, keyword, score, growthRate, data(jsonb) | →Organization |
| 20 | ProductResearchReport | orgId, query, platform, summary, opportunities(jsonb) | →Organization |
| 21 | KeywordReport | orgId, query, platforms, keywords(jsonb), charts(jsonb) | →Organization |
| 22 | ListingDraft | orgId, workspaceId, platform, title, bullets, seoTags, status | →Workspace |
| 23 | ProfitCalculation | orgId, salePrice, 8 项成本, totalCost, profit, margin, roi, scenarios(jsonb) | →Organization |
| 24 | ImagePromptProject | orgId, mode, prompt, settings(jsonb), generatedAssets(jsonb) | →Organization |
| 25 | Notification | orgId, userId, type, title, body | →User |
| 26 | AuditLog | orgId, actorId, action, resourceType, before/after(jsonb) | →Organization |

**枚举（25 个）**：Plan, MembershipRole, MembershipStatus, ChannelType, ChannelSyncStatus, ProductStatus, FilePurpose, DocumentVisibility, SopStatus, TaskPriority, TaskStatus, SessionContextType, SessionStatus, MessageRole, AgentType, AgentRunStatus, AutomationFlowStatus, TriggerType, AlertType, AlertSeverity, AlertStatus, ListingStatus, ImageMode, ImageProjectStatus, NotificationType

---

## 第六章：API 设计规范

### 6.1 通用规范
- 前缀：`/api/v1`
- 认证：JWT Bearer Token（Auth 模块除外）
- 成功响应：`{ "data": ..., "meta": { "page": ..., "total": ... } }`
- 错误响应：`{ "error": { "code": "...", "message": "...", "details": ... }, "requestId": "..." }`
- 分页：所有列表接口支持 `page`, `limit`, `search`, `sort`, `filter`

### 6.2 核心 API 清单

**Auth 模块（已实现）**
```
POST /api/v1/auth/register    # Body: { email, password, name }
POST /api/v1/auth/login       # Body: { email, password }
POST /api/v1/auth/refresh     # Body: { refreshToken }
GET  /api/v1/auth/me          # Header: Bearer token
POST /api/v1/auth/logout      # Header: Bearer token
```

**Admin/Org（骨架）**
```
GET    /api/v1/organizations/current
PATCH  /api/v1/organizations/current
GET    /api/v1/organizations/current/members
POST   /api/v1/organizations/current/invitations
PATCH  /api/v1/organizations/current/members/:memberId
DELETE /api/v1/organizations/current/members/:memberId
```

**Workspace（骨架）**
```
GET    /api/v1/workspaces
POST   /api/v1/workspaces
GET    /api/v1/workspaces/:id
PATCH  /api/v1/workspaces/:id
DELETE /api/v1/workspaces/:id
POST   /api/v1/workspaces/:id/connect-channel
POST   /api/v1/workspaces/:id/sync
```

**Dashboard（骨架）**
```
GET /api/v1/dashboard/overview
GET /api/v1/dashboard/opportunities
GET /api/v1/dashboard/recent-projects
```

**智能体模块（骨架）**
```
GET    /api/v1/assistant/sessions
POST   /api/v1/assistant/sessions
GET    /api/v1/assistant/sessions/:id/messages
POST   /api/v1/assistant/sessions/:id/messages
GET    /api/v1/assistant/runs/:runId
GET    /api/v1/agent-runs/:id/events   # SSE
```

**自动化（骨架）**
```
GET    /api/v1/automation/flows
POST   /api/v1/automation/flows
GET    /api/v1/automation/flows/:id
PATCH  /api/v1/automation/flows/:id
POST   /api/v1/automation/flows/:id/enable
POST   /api/v1/automation/flows/:id/disable
POST   /api/v1/automation/flows/:id/run
GET    /api/v1/automation/runs
GET    /api/v1/automation/runs/:id
```

**业务模块（骨架）**
```
店铺监控: GET summary/metrics/alerts + POST acknowledge/resolve
趋势:     GET overview/categories/regions + POST analyze
选品:     POST reports + GET reports/:id + POST refresh
关键词:   POST reports + GET reports/:id + POST export
Listing:  POST drafts + PATCH/:id + POST generate/approve/export
利润:     POST calculations + GET/:id + POST scenarios
图片:     POST projects + PATCH/:id + POST optimize-prompt/generate-images
文件:     POST presign-upload + POST complete-upload + DELETE/:id
通知:     GET notifications + POST/:id/read + POST read-all
计费:     GET plan/usage + POST checkout-session
```

---

## 第七章：智能体接入完整说明

### 7.1 前端接入点（占位组件 + 空回调）
```
搜索代码中 "TODO: 接入智能体" 可找到所有接入点
```

| 页面 | 位置 | 方法 | 触发方式 |
|------|------|------|---------|
| 全部 | AgentInputDock 发送按钮 | onSendMessage | 点击发送或 Enter |
| 全部 | AgentInputDock 快捷按钮 | 5 个按钮各自回调 | 点击按钮 |
| /automation | AgentConsoleSlot 输入 | onCommand | 发送指令 |
| /automation | AgentConsoleSlot 热门指令 | onCommand | 点击指令按钮 |
| /store-monitor | AI Assistant 输入 | onSendMessage | 发送消息 |
| /store-monitor | 一键优化/补货/详情 | 独立按钮 | 点击 |
| /product-research | 开始研究 | onRunAgent | 点击 |
| /profit-calculator | AI 生成情景 | onRunAgent | 点击 |
| /listing-generator | 生成相关操作 | onGenerateListing | 点击 |
| /keyword-analysis | AI 深度分析 | onAnalyzeKeyword | 发送 |
| /image-prompt | 生成按钮 | onGenerateImage | 点击 |
| /image-prompt | 优化 Prompt | onOptimizePrompt | 点击 |

### 7.2 后端接入层
```
AgentProviderInterface (src/agents/agent-provider.interface.ts)
    ↑  implements
MockAgentProvider (src/agents/mock-agent.provider.ts)     ← 默认
HttpAgentProvider (未实现，设 AGENT_BASE_URL 后切换)     ← 生产

注入方式 (src/agents/agent.module.ts):
  providers: [{ provide: AGENT_PROVIDER, useClass: MockAgentProvider }]
  exports: [AGENT_PROVIDER]
```

所有智能体调用通过 BullMQ 异步队列，HTTP 请求不阻塞。AgentRun 状态流转：
```
queued → running → succeeded
queued → running → failed
queued / running → cancelled
```

---

## 第八章：启动与验证

### 8.1 启动前端
```bash
cd "D:\智能体前端"
pnpm run dev
# → http://localhost:5173
```

### 8.2 启动后端
```bash
cd "D:\后端"
# 1. 配置环境变量
cp .env.example .env
# 编辑 .env 填入 DATABASE_URL / REDIS_URL / JWT_*

# 2. 数据库初始化
npx prisma db push
npx ts-node prisma/seed.ts

# 3. 启动 API + Worker
pnpm run start:dev
# → http://localhost:3000
# → Swagger: http://localhost:3000/api/docs
# → Prisma Studio: npx prisma studio
```

### 8.3 检查命令
```bash
# 前端
cd "D:\智能体前端"
pnpm run build              # 构建检查
pnpm run dev                # 启动开发服务器

# 后端
cd "D:\后端"
pnpm run build              # 构建检查
pnpm run start:dev          # 启动 API
npx prisma studio           # 数据库可视化
```

---

## 第九章：复查检查清单

### 前端
- [ ] pnpm run build 通过（无 TypeScript 错误）
- [ ] 14 个路由都可从左侧导航进入
- [ ] 每个页面无控制台 error/warn
- [ ] 所有按钮 hover 状态正确
- [ ] 所有页面 Tab 切换联动内容变化
- [ ] Toast 通知：邀请有礼 / 导出 / 保存等场景
- [ ] Modal 弹窗：升级 / 详情 / 新建等场景
- [ ] Dropdown 下拉：语言 / 筛选 / 更多操作
- [ ] 搜索输入实时过滤列表
- [ ] 利润计算器成本编辑实时重算
- [ ] agent-input-dock 发送后有 mock 回复气泡
- [ ] 1440-1600px 宽桌面无横向溢出
- [ ] sidebar 底部升级卡完整可见
- [ ] 所有 AI 区域为占位，不调用真实 API
- [ ] data-testid 属性存在

### 后端
- [ ] nest build 通过
- [ ] .env 配置正确
- [ ] npx prisma db push 执行通过
- [ ] npx prisma generate 执行通过
- [ ] pm2 start 或 pnpm run start:prod 可启动
- [ ] GET /health 返回 200
- [ ] GET /ready 返回 200
- [ ] POST /api/v1/auth/register 注册成功
- [ ] POST /api/v1/auth/login 登录返回 token
- [ ] GET /api/v1/auth/me 返回用户信息
- [ ] Swagger：/api/docs 可访问
- [ ] AGENT_PROVIDER token 注入正确
- [ ] 队列：4 个 BullMQ 队列注册正确
- [ ] worker：3 个 worker 可启动

### 端到端主链路
- [ ] 注册 → 登录 → 创建组织 → 创建工作区 → 创建关键词报告 → 查询 AgentRun → 获取报告

---

## 第十章：参考文档索引

| 文档 | 路径 |
|------|------|
| 原始 UI 规格（含 10 张设计图描述） | C:\Users\1\Desktop\ShopMate AI 图片\ShopMate_AI_1比1前端复刻提示词.md |
| 纯文字 UI 规格（不依赖图片可见性） | outputs\ShopMate_AI_纯文字版前端复刻提示词.md |
| 首轮前端完善整改规格 | outputs\ShopMate_AI_前端完善整改提示词.md |
| 桌面端全功能测试整改规格 | outputs\ShopMate_AI_桌面端全功能测试整改提示词.md |
| 后端完整业务逻辑规格 | outputs\ShopMate_AI_完整后端逻辑提示词.md |
| 设计图（10 张 PNG） | C:\Users\1\Desktop\ShopMate AI 图片\01.png ~ 10.png |
