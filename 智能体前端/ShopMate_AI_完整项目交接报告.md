# ShopMate AI — 完整项目交接报告（0→1 全量复查用）

> 生成日期：2026-07-05  
> 项目规模：前端 10 页面 + 后端 25 模块  
> 构建状态：前端 ✅ `npm run build` 通过 | 后端 ✅ `nest build` 通过  
> 参考设计图：01.png ~ 10.png（位于 `C:\Users\1\Desktop\ShopMate AI 图片\`）

---

## 第一章：项目概览

| 维度 | 前端 | 后端 |
|------|------|------|
| **路径** | `D:\智能体前端` | `D:\后端` |
| **技术栈** | React 19 + TS6 + Vite 8 + Tailwind v4 + Recharts + lucide-react | NestJS 11 + TS5.9 + Prisma 6 + PostgreSQL + BullMQ + Redis |
| **启动命令** | `pnpm run dev` → :5173 | `pnpm run start:dev` → :3000 |
| **构建命令** | `pnpm run build` ✅ | `nest build` ✅ |
| **设计语言** | 主色 `#6C63FF` 紫蓝系 / 背景 `#F8F9FF` / 白卡片 + 1px 圆角边框 | — |
| **智能体边界** | 全部 AI 区域为占位 UI + 空回调 | AgentProvider 接口 + Mock 实现，HttpAgentProvider 可替换 |

**产物清单：**
- 前端：34 个源文件（11 个组件 + 11 个页面 + 路由 + 类型 + Mock 数据）
- 后端：125+ 个源文件（25 个 feature 模块 × 5 文件 + 18 个共享文件 + 3 个 worker + Prisma）

---

## 第二章：前端 — 页面路由（14 个）

| 路由 | 页面名 | 对应设计图 | 页面文件 | 已实现功能 |
|------|--------|-----------|---------|-----------|
| `/assistant` | 智能助手首页 | 05.png | `Dashboard.tsx` | Hero 欢迎 + 6 快捷按钮(写入输入框) + 4 指标卡 + 趋势洞察 3 列 + 成就卡 + AI 输入栏 + mock 对话 |
| `/team` | 团队协作与知识库中心 | 01.png | `TeamCollaboration.tsx` | Hero 横幅(渐变+标签) + AI 团队助手(快捷写入/发送mock回复) + 我的提示词(新建弹窗) + 知识库/SOP/动态/任务 4 卡 + 项目空间 |
| `/automation` | 自动化流程与 Agent 执行台 | 02.png | `Automation.tsx` | 4 指标卡 + 创建流程(模板弹窗) + 流程列表(Tab 筛选/搜索/开关/更多下拉) + Agent 控制台 + 执行队列 + 模板中心 |
| `/store-monitor` | 店铺监控与预警中心 | 03.png | `StoreMonitor.tsx` | 6 项指标 + 核心趋势小折线 + 预警列表(可点详情弹窗) + 店铺表现表 + 关键词洞察 + 库存预警 + AI 助手(一键优化/补货计划/详情弹窗 + mock对话) |
| `/trend-radar` | 趋势洞察与市场雷达 | 04.png | `TrendInsight.tsx` | 4 Tab(各切换数据集) + 趋势折线图 + 季节机会地图 + 飙升品类 Top5 + 社媒话题 + 场景圆环图 + 区域增长 + AI 输入 |
| `/product-research` | 选品研究工作台 | 06.png | `ProductResearch.tsx` | 4 能力按钮 + 输入区(快捷写入) + 平台 Tab + 5 洞察卡(开始研究 loading) + 高潜力选品机会(详情弹窗) + 筛选下拉 |
| `/profit-calculator` | 利润计算与定价助手 | 07.png | `ProfitCalculator.tsx` | 5 Tab(各切换内容) + 成本输入(可编辑实时重算 totalCost/profit/margin/ROI) + 定价计算器 + 推荐定价 + 盈亏平衡图 + 情景模拟(AI 生成) |
| `/listing-generator` | AI Listing 生成中心 | 08.png | `ListingGenerator.tsx` | 5 步进度条 + 左侧模块菜单(切换联动内容) + 聊天生成区(历史记录弹窗/重新生成轮换/润色/翻译/更多操作) + 实时预览 + 底部操作条(保存/一键生成/导出 Toast) |
| `/keyword-analysis` | 关键词分析中心 | 09.png | `KeywordAnalysis.tsx` | 欢迎区 + Chip(点击写入搜索框/换一批轮换) + 平台筛选 + 类目/国家/筛选下拉 + 关键词表 + 搜索趋势图 + 机会分布圆环图 + 长尾词 + 洞察卡 + AI 深度分析对话 |
| `/image-prompt` | AI 图片与 Prompt 工作台 | 10.png | `ImageWorkbench.tsx` | 3 模式卡(切换内容) + 聊天工作区 + 结果预览 + Prompt 编辑器(复制/优化 Toast) + 风格预设(选中态) + 场景建议(点击追加) + 图片设置 + 生成按钮 mock 流程 |
| `/opportunity` | 今日机会 | — | Dashboard 特化 | 跳转 Dashboard 焦点区 |
| `/hot-products` | 爆品洞察 | — | Dashboard 特化 | 跳转 Dashboard 焦点区 |
| `/competition` | 竞品分析 | — | `PlaceholderPage.tsx` | 4 指标卡(128竞品监控) + 竞品数据表格 |
| `/market` | 市场大盘 | — | `PlaceholderPage.tsx` | 4 指标卡 + 区域市场数据表格 |

---

## 第三章：前端 — 组件体系

### 3.1 Shell（2 个）
| 组件 | 路径 | 功能 |
|------|------|------|
| **Sidebar** | `components/sidebar/Sidebar.tsx` | Logo(ShopMate AI + Pro) + 14 导航项(激活紫底) + 销售渠道(管理弹窗/添加弹窗) + 升级卡(专业版弹窗含 6 项权益) |
| **TopBar** | `components/topbar/TopBar.tsx` | 页面标题+说明 + 邀请有礼(Toast) + 通知铃铛(红点+Toast) + 语言切换(Dropdown) + 用户头像+你好Olivia+专业版剩余12天 |

### 3.2 UI 组件库（11 个）
| 组件 | 类型 | 用途 |
|------|------|------|
| `StatsCard` | 指标卡 | 图标 + 大数字 + 标签 + 趋势箭头 |
| `MetricCard` | 指标卡 | 标题 + 数值 + 变化百分比 |
| `ChartCard` | 容器 | 标题 + 筛选 + 图表内容 |
| `StatusBadge` | 标签 | 运行中/成功/警告/异常/待处理/已暂停 |
| `AgentInputDock` | AI 占位 | 输入框 + 快捷按钮 + 发送(空回调) |
| `AssistantPanel` | AI 占位 | 聊天消息列表 + 输入框 |
| `AgentConsoleSlot` | AI 占位 | 热门指令 + 输入 + 在线状态 |
| `RobotIllustration` | 插画 | SVG 机器人(3 种形态: default/welcome/working) |
| `Toast` | 交互 | 全局通知(success/error/info/warning + 3s 自动消失) |
| `Modal` | 交互 | 弹窗(ESC + 遮罩关闭) |
| `Dropdown` | 交互 | 下拉菜单 + DropdownItem |

### 3.3 统一交互模式
- 所有按钮点击 → Toast / Modal / Dropdown
- Tab 切换 → 内容联动
- 输入框 Enter / 发送 → Mock 对话气泡
- 搜索 → 列表实时过滤
- 生成按钮 → Loading → Toast 完成
- 关键元素有 `data-testid` 属性

---

## 第四章：前端 — Mock 数据与类型

### 4.1 类型定义（`types/index.ts`）
User, NavItem, MetricData, StatsData, StatusType, AutomationFlow, FlowTemplate, StoreHealthMetrics, AlertItem, StorePerformance, InventoryAlert, TrendDataPoint, TrendCategory, HotTopic, RegionGrowth, ProductInsight, ProductOpportunity, CostInput, PricingResult, ScenarioSimulation, ListingModule, TitleCandidate, ListingPreview, KeywordData, LongTailKeyword, ImageMode, StylePreset, AgentCallbacks 等 30+ 类型

### 4.2 Mock 数据（`data/mockData.ts`，1000+ 行）
覆盖全部 10 页面所需的测试数据：趋势月度数据、利润分布、热销榜单、自动化流程、店铺指标、预警、库存、团队消息、知识库、提示词、SOP、活动、任务、项目空间、关键词、Listing、成本输入、情景模拟、热门话题、区域增长、场景数据等。

---

## 第五章：后端 — 整体架构

### 5.1 目录结构
```
D:\后端\
├── prisma/
│   ├── schema.prisma      # 26 模型 + 25 枚举（925 行）
│   └── seed.ts            # 种子数据
├── src/
│   ├── main.ts            # NestJS 启动 + Helmet + CORS + Swagger + ValidationPipe
│   ├── app.module.ts      # 根模块(导入全部)
│   ├── agents/            # 智能体接入层
│   │   ├── agent-provider.interface.ts   # 7 方法接口
│   │   ├── mock-agent.provider.ts        # Mock 实现
│   │   └── agent.module.ts               # 通过 AGENT_PROVIDER token 注入
│   ├── features/          # 25 个业务模块
│   │   ├── auth/          # ✅ 真实实现：register/login/refresh/me/logout
│   │   └── 24 个 CRUD 骨架（controller + service + repository + dto + module）
│   ├── shared/            # 共享基础设施
│   │   ├── auth/          # JwtStrategy + JwtAuthGuard + @CurrentUser()
│   │   ├── config/        # Zod 环境变量校验（19 项）
│   │   ├── database/      # PrismaService + PrismaModule(全局)
│   │   ├── errors/        # GlobalExceptionFilter + 6 自定义异常
│   │   ├── logging/       # 结构化 JSON 日志
│   │   ├── middleware/    # requestId (AsyncLocalStorage)
│   │   ├── queue/         # BullMQ 4 队列
│   │   ├── rbac/          # @Roles() 装饰器 + RolesGuard
│   │   └── storage/       # StorageProvider 接口 + LocalStorage 实现
│   └── workers/           # 3 个队列消费者
│       ├── agent-run.worker.ts
│       ├── automation.worker.ts
│       └── export.worker.ts
├── .env / .env.example
└── dist/                  # ✅ 构建通过
```

### 5.2 核心设计决策
| 决策 | 选择 | 理由 |
|------|------|------|
| 目录结构 | feature-first | 每个模块独立 controller/service/repository/dto |
| 认证 | JWT (access 15m + refresh 7d) | 无状态 + httpOnly cookie |
| 密码 | Argon2 | 最安全的内存硬哈希 |
| 校验 | class-validator + Zod | DTO 校验 + 环境变量校验 |
| 队列 | BullMQ | 成熟稳定，支持延迟/重试/指数退避 |
| 存储 | 接口注入 | LocalStorage ↔ S3 一键切换 |
| 智能体 | DI token 注入 | `AGENT_PROVIDER` 替换实现 |

---

## 第六章：后端 — 数据模型（26 个）

| 模型 | 关键字段 | 用途 |
|------|---------|------|
| User | email, passwordHash, name, avatarUrl, locale, timezone, status | 用户账户 |
| Organization | name, slug, plan, trialEndsAt | 组织/团队 |
| Membership | userId, organizationId, role(owner/admin/member/viewer), status | 成员关系 |
| Workspace | organizationId, name, channelType, marketplace, currency | 店铺空间 |
| ChannelConnection | workspaceId, provider, externalShopId, tokens(加密) | 渠道授权 |
| Product | workspaceId, title, sku, asin, images[], cost, price, metadata | 商品 |
| FileAsset | organizationId, storageKey, mimeType, size, purpose | 文件资产 |
| KnowledgeDocument | organizationId, title, content, tags, visibility | 知识文档 |
| Sop | organizationId, title, steps(jsonb), status | SOP 流程 |
| TeamTask | organizationId, title, priority, status, dueAt, assigneeId | 任务 |
| PromptTemplate | organizationId, title, category, content, variables(jsonb) | 提示词模板 |
| AssistantSession | organizationId, userId, title, contextType, status | AI 会话 |
| AssistantMessage | sessionId, role, content, attachments(jsonb) | 会话消息 |
| AgentRun | organizationId, agentType, provider, status, input/output/error(jsonb), tokenUsage | 智能体执行记录 |
| AutomationFlow | organizationId, name, triggerType, triggerConfig, steps(jsonb) | 自动化流程定义 |
| AutomationRun | flowId, status, result/error(jsonb) | 流程执行记录 |
| StoreMetricSnapshot | workspaceId, date, healthScore, orders, revenue, acos, reviewRate | 店铺指标快照 |
| Alert | organizationId, type, severity, title, status(source) | 预警 |
| TrendInsight | organizationId, market, category, keyword, score, growthRate | 趋势洞察 |
| ProductResearchReport | organizationId, query, platform, summary, opportunities(jsonb) | 选品报告 |
| KeywordReport | organizationId, query, platforms[], keywords(jsonb), charts(jsonb) | 关键词报告 |
| ListingDraft | organizationId, workspaceId, platform, title, bullets, description, seoTags | Listing 草稿 |
| ProfitCalculation | organizationId, salePrice, 8 项成本字段, totalCost, profit, margin, roi | 利润计算 |
| ImagePromptProject | organizationId, mode, prompt, settings(jsonb), generatedAssets(jsonb) | 图片项目 |
| Notification | organizationId, userId, type, title, body | 通知 |
| AuditLog | organizationId, actorId, action, resourceType, before/after(jsonb) | 审计日志 |

---

## 第七章：后端 — API 端点

### Auth（✅ 已实现）
| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/api/v1/auth/register` | 注册(Argon2) + 返回 JWT |
| POST | `/api/v1/auth/login` | 登录验证 + 返回 JWT |
| POST | `/api/v1/auth/refresh` | 刷新 access token |
| GET | `/api/v1/auth/me` | 当前用户信息 |
| POST | `/api/v1/auth/logout` | 登出 |

### 其余 24 个模块（CRUD 骨架已生成，待完善业务逻辑）
| 模块 | 前缀 | 主要端点 |
|------|------|---------|
| Users | `/api/v1/users` | GET/PATCH profile |
| Organizations | `/api/v1/organizations` | CRUD + members + invitations |
| Workspaces | `/api/v1/workspaces` | CRUD + connect-channel + sync |
| Channels | `/api/v1/channels` | CRUD |
| Products | `/api/v1/products` | CRUD |
| Files | `/api/v1/files` | presign-upload / complete-upload |
| KnowledgeBase | `/api/v1/knowledge-documents` | CRUD |
| SOPs | `/api/v1/sops` | CRUD + publish |
| Tasks | `/api/v1/tasks` | CRUD + complete |
| Prompts | `/api/v1/prompt-templates` | CRUD |
| Assistant | `/api/v1/assistant` | sessions + messages |
| AgentRuns | `/api/v1/agent-runs` | status + events |
| Automation | `/api/v1/automation` | flows + runs + enable/disable |
| StoreMonitoring | `/api/v1/store-monitoring` | summary + metrics + alerts |
| Trends | `/api/v1/trends` | overview + categories + regions + analyze |
| ProductResearch | `/api/v1/product-research` | reports + refresh |
| Keywords | `/api/v1/keyword-reports` | CRUD + export |
| Listings | `/api/v1/listing-drafts` | CRUD + generate + approve + export |
| ProfitCalculator | `/api/v1/profit-calculations` | CRUD + scenarios |
| ImagePrompt | `/api/v1/image-prompt-projects` | CRUD + optimize-prompt + generate-images |
| Billing | `/api/v1/billing` | plan + usage + checkout |
| Notifications | `/api/v1/notifications` | list + read |
| AuditLogs | `/api/v1/audit-logs` | list |
| Dashboard | `/api/v1/dashboard` | overview + opportunities + recent-projects |

统一前缀 `/api/v1`，统一响应格式 `{ data, meta }` / `{ error: { code, message }, requestId }`。

---

## 第八章：智能体接入说明

### 前端接入位
所有 AI 区域使用占位组件，搜索 `TODO: 接入智能体` 可找到全部接入点：

| 组件名 | 页面 | 回调 Props |
|--------|------|-----------|
| `AgentInputDock` | 全部页面 | `onSendMessage`, `onUploadFile` |
| `AssistantPanel` | /store-monitor | `onSendMessage` |
| `AgentConsoleSlot` | /automation | `onCommand` |
| inline buttons | 全部页面 | `onRunAgent`, `onGenerateListing`, `onAnalyzeKeyword`, `onGenerateImage`, `onOptimizePrompt` |

### 后端接入层
```
AgentProviderInterface (接口层)
  ├── runAssistant()       → 智能助手对话
  ├── runListingGeneration() → Listing 生成
  ├── runKeywordAnalysis() → 关键词分析
  ├── runProductResearch()  → 选品研究
  ├── runTrendAnalysis()   → 趋势分析
  ├── runImagePrompt()     → 图片 Prompt 生成
  └── runAutomationStep()  → 自动化步骤执行

MockAgentProvider (默认)   → 返回静态数据
HttpAgentProvider (备选)   → 通过 AGENT_BASE_URL 调用真实智能体
```

---

## 第九章：启动方式

### 前端
```bash
cd "D:\智能体前端"
pnpm run dev
# 浏览器打开 http://localhost:5173
```

### 后端
```bash
cd "D:\后端"
# 需要本地 PostgreSQL + Redis
npx prisma db push          # 创建数据库表
npx ts-node prisma/seed.ts  # 填充种子数据
pnpm run start:dev          # 启动 API 服务
# http://localhost:3000
# Swagger: http://localhost:3000/api/docs
# Prisma Studio: npx prisma studio
```

---

## 第十章：复查检查清单

### 10.1 前端检查项
- [ ] `pnpm run build` 通过，无 TS 错误
- [ ] 14 个路由均可导航进入（左侧导航全部可点击）
- [ ] `/assistant`：6 个快捷按钮写入输入框 + Toast；发送后显示 mock 对话
- [ ] `/team`：我的提示词「新建」弹窗；知识库/SOP/数据/上传按钮有 Toast
- [ ] `/automation`：Tab 切换过滤列表；搜索过滤；开关切换状态；「从模板创建」弹窗
- [ ] `/store-monitor`：「一键优化/补货计划/详情」弹窗；预警列表可点击查看详情
- [ ] `/trend-radar`：4 个 Tab 切换不同数据集；图表渲染正常
- [ ] `/product-research`：「开始研究」→ loading → 结果更新；Tab 切换；详情弹窗
- [ ] `/profit-calculator`：5 Tab 内容切换；成本输入编辑实时重算；
- [ ] `/listing-generator`：模块切换联动；重新生成轮换；保存/导出 Toast
- [ ] `/keyword-analysis`：Chip 点击写入搜索框；换一批轮换；导出 Toast
- [ ] `/image-prompt`：模式切换联动；生成按钮 mock 流程；Prompt 复制/优化
- [ ] `/competition`、`/market`：指标卡 + 数据表格完整
- [ ] 控制台无 error/warn
- [ ] 1440-1600px 无横向溢出
- [ ] AI 能力均为占位，不调用真实 API

### 10.2 后端检查项
- [ ] `nest build` 通过（已验证 ✅）
- [ ] 环境变量：复制 `.env.example` 为 `.env`，填写 DATABASE_URL / REDIS_URL / JWT_SECRET
- [ ] `npx prisma db push` 执行通过
- [ ] `npx ts-node prisma/seed.ts` 种子数据写入正常
- [ ] `pnpm run start:dev` 启动后 `/health` 和 `/ready` 可访问
- [ ] `POST /api/v1/auth/register` 返回 JWT token
- [ ] `POST /api/v1/auth/login` 返回 JWT token
- [ ] Swagger 文档可访问 `http://localhost:3000/api/docs`
- [ ] 搜索 `AGENT_PROVIDER` token 确认注入点正确
- [ ] 设置 `AGENT_BASE_URL` 后 MockAgentProvider 可切换为 HttpAgentProvider

---

## 第十一章：参考文档索引

| 文档 | 路径 |
|------|------|
| 原始 UI 规格（含 01-10.png 说明） | `C:\Users\1\Desktop\ShopMate AI 图片\ShopMate_AI_1比1前端复刻提示词.md` |
| 纯文字 UI 规格（不依赖图片） | `outputs\ShopMate_AI_纯文字版前端复刻提示词.md` |
| 首轮前端整改规格 | `outputs\ShopMate_AI_前端完善整改提示词.md` |
| 桌面端全功能测试整改规格 | `outputs\ShopMate_AI_桌面端全功能测试整改提示词.md` |
| 后端完整逻辑规格 | `outputs\ShopMate_AI_完整后端逻辑提示词.md` |
| 设计图文件夹 | `C:\Users\1\Desktop\ShopMate AI 图片\`（01.png ~ 10.png） |
