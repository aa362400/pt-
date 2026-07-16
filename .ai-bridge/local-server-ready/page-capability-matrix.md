# 页面能力矩阵

浏览器验收：2026-07-14，登录态逐路由 `goto + DOM snapshot`，40 个路由均非空且无检测到的 React 崩溃文本。

| 路由 | 能力 | 数据/API | 状态 | 缺口或边界 |
|---|---|---|---|---|
| `/assistant` | 运营总览 | 真实后端健康/任务 | READY | 无 |
| `/team` | 团队设置 | RBAC/成员 API | READY | 无 |
| `/team/operations` | 协作操作 | 真实 API | READY | 无 |
| `/automation` | 自动化总览 | 流程/队列 API | READY | 高风险动作仍需审核 |
| `/automation/operations` | 自动化操作 | 真实 API | READY | 同上 |
| `/store-monitor` | 平台连接 | 连接状态 API | EXTERNAL_NOT_CONFIGURED | 当前无有效 Ozon 店铺连接 |
| `/store-monitor/operations` | 店铺监控 | Ozon 店铺 API | EXTERNAL_NOT_CONFIGURED | 需 Client-Id/API-Key |
| `/trend-radar` | 趋势证据 | Ozon 公开证据 | PARTIAL | 非 Ozon 未接；不得视为全站数据 |
| `/product-research` | 真实选品 | Agent + Ozon 证据 | PARTIAL | 当前公开价格不足会阻断 |
| `/daily-product-research` | 每日精准选品 | run/source/artifact/schedule API | READY | 当前 NO_TOP |
| `/products` | 商品管理 | 商品 API | READY | 外部发布需批准 |
| `/products/operations` | 商品操作 | 商品/草稿 API | READY | 外部写关闭 |
| `/orders` | 订单总览 | 本地订单 API | PARTIAL | Ozon 店铺未连接时无实时订单 |
| `/orders/operations` | 订单同步 | Ozon API | EXTERNAL_NOT_CONFIGURED | 需店铺凭证 |
| `/profit-calculator` | 利润计算 | 确定性本地工具 | READY | 费率需按业务维护 |
| `/marketing` | 营销分析 | 本地/连接状态 | PARTIAL | 广告平台 API 未配置 |
| `/customer-service` | 客服总览 | 能力声明/空状态 | PARTIAL | Ozon 消息合同未接 |
| `/customer-service/operations` | 客服业务接入 | 无消息合同 | PLACEHOLDER | 明确阻断，未伪造会话 |
| `/listing-generator` | Listing 草稿 | Agent/草稿 API | READY | 发布需审核 |
| `/listing-generator/operations` | Listing 操作 | 真实草稿 API | READY | 外部写关闭 |
| `/keyword-analysis` | 关键词 | Agent/Ozon 证据 | PARTIAL | 其它平台未接 |
| `/image-prompt` | 内容与图片 | 提示词/生图配置 | PARTIAL | 本轮未执行付费生图 |
| `/image-prompt/operations` | 图片工作台 | Agent API | PARTIAL | 必须先人工确认参考图 |
| `/opportunity` | 机会视图 | 真实总览 API | READY | 无 |
| `/hot-products` | 热品视图 | 真实总览 API | READY | 无 |
| `/mcp-tools` | MCP 工具 | 工具注册/调用 API | READY | 外部 MCP 依配置 |
| `/review` | 审批中心 | ReviewTask API | READY | 已修复崩溃 |
| `/review/operations` | 审核详情 | 报告/候选/证据 API | READY | 不自动批准 |
| `/audit-logs` | 审计日志 | 审计 API | READY | 无 |
| `/billing` | 计费 | 本地计费 API | PARTIAL | Stripe live 未配置 |
| `/agent-roadmap` | Agent 中心 | 健康/契约/队列 API | READY | 无 |
| `/agent-roadmap/operations` | Agent 详情 | 真实 API | READY | 无 |
| `/operations-center` | 功能操作中心 | capability API | READY | 外部能力按状态展示 |
| `/enterprise-team` | AI 运营团队 | Agent API | READY | 无 |
| `/supply-chain` | 供应链 | 本地数据/API | PARTIAL | 外部供应链连接未配置 |
| `/enterprise-readiness` | 企业验收 | readiness API | PARTIAL | 人工金标未签字 |
| `/memory-governance` | 记忆治理 | memory API | READY | 无 |
| `/competition` | Ozon 竞品 | Ozon 公开证据 | PARTIAL | 非全站实时库 |
| `/market` | 数据分析 | 本地指标 API | READY | 无 |
| `/market/operations` | Ozon 市场分析 | Ozon 公开证据 | PARTIAL | 来源覆盖有限 |

汇总：READY 23，PARTIAL 13，EXTERNAL_NOT_CONFIGURED 3，PLACEHOLDER 1，BROKEN 0。

