# ShopMate AI

ShopMate AI 是一个面向跨境电商运营的 AI SaaS 平台原型，重点覆盖 Ozon 等 marketplace 的选品、利润核算、Listing 生成、人工审核、Agent 编排、审计与本地化部署。

这个仓库不是单点脚本，而是一套可运行的全栈工作台：

- NestJS + Prisma 后端，提供认证、组织/工作区、多租户隔离、Agent run、审批、审计、渠道连接、商品、订单、Listing、关键词、利润、供应链和通知等 API。
- React + TypeScript + Vite 前端控制台，覆盖选品、Agent 中心、审核中心、商品/订单/Listing、Ozon 观察、核价、团队与系统健康页面。
- 独立商品设计一致性 Agent，可作为平台内的图片/视觉 QA 执行服务。
- Chrome 浏览器扩展，用于在用户确认后采集 Ozon 公开页面证据。
- Docker Compose、Kubernetes、Nginx、监控、RLS、安全扫描、发布验收和本地服务脚本。

## 为什么值得看

跨境电商工具常见问题是“自动化看起来很强，但证据、审批和安全边界不清楚”。ShopMate AI 的实现把自动化放在可治理流程里：

- **证据先行**：Ozon 公开页面观察、候选商品、关键词、利润、供应链和 Listing 结果都保留来源、置信度或审核状态。
- **人工闸门**：外部写操作、上架、改价、图片和 Listing 草稿进入审核中心，不默认自动发布。
- **多租户治理**：Prisma 迁移、RLS 验证、组织/工作区模型和能力令牌用于隔离平台数据。
- **本地优先**：提供 `docker-compose.local-server.yml` 和 `scripts/local-server/*.ps1`，适合单机试用、演示和离线验收。
- **工程证据完整**：CI、Snyk、gitleaks、发布验证、负载测试脚本、运维 runbook 和企业级验收矩阵都在仓库内。

## 功能地图

| 模块 | 路径 | 说明 |
|---|---|---|
| 后端 API | `后端/` | NestJS、Prisma、BullMQ、Redis、PostgreSQL、Swagger、JWT、RLS 和业务 API |
| 前端控制台 | `智能体前端/` | React 运营控制台，包含 Agent、审核、选品、Listing、Ozon、核价、团队和健康页面 |
| 商品设计 Agent | `电商设计图保持产品一致性智能体/` | 图片一致性、视觉 QA 和 Agent 服务 |
| Ozon 证据扩展 | `browser-extension/` | 用户主动触发的公开页面证据采集器 |
| 平台契约 | `contracts/` | Agent task/lifecycle JSON contract |
| 运维文档 | `docs/ops/` | 本地运行、上线、回滚、监控、迁移和真实运营回路说明 |
| 发布证据 | `release/` | RC manifest、测试报告、迁移、镜像、回滚和 Ozon 分析样例 |
| 本地服务脚本 | `scripts/local-server/` | setup/start/status/verify/backup/restore/stop PowerShell 脚本 |

## 快速开始

推荐在 Windows PowerShell 下使用本地服务脚本。

```powershell
# 1. 复制并生成本地环境配置
.\scripts\local-server\setup.ps1

# 2. 启动本地平台
.\scripts\local-server\start.ps1

# 3. 查看状态
.\scripts\local-server\status.ps1

# 4. 运行本地验收
.\scripts\local-server\verify.ps1
```

默认本地入口取决于 `.env.local-server`：

- 前端：`http://localhost`
- 后端 API：`http://localhost/api/v1`
- Swagger：`http://localhost/api/docs`
- Agent：`http://localhost/agent`

也可以分别运行后端和前端：

```powershell
cd 后端
pnpm install
pnpm exec prisma generate
pnpm run start:dev
```

```powershell
cd 智能体前端
npm install
npm run dev
```

## 验证命令

根目录发布闸门：

```powershell
node .\verify-platform-release.mjs
```

后端：

```powershell
cd 后端
pnpm run release:verify
pnpm run security:rls:verify
pnpm run enterprise:readiness:verify
```

前端：

```powershell
cd 智能体前端
npm run release:verify
```

浏览器扩展：

```powershell
cd browser-extension
npm test
```

## 安全边界

- 不在仓库内提交真实平台密钥、JWT secret、Ozon token 或模型 API key。
- `.env.local-server.example` 中的 `__GENERATE__` 占位值应由本地 setup 脚本生成。
- Ozon 浏览器扩展只读取用户当前可见的公开页面信息，不读取 Cookie、LocalStorage 或卖家后台。
- 自动化结果进入审核/审计流程；对外部平台的写入必须显式授权。

## 文档入口

- [后端说明](./后端/README.md)
- [前端说明](./智能体前端/README.md)
- [Ozon 证据采集扩展](./browser-extension/README.md)
- [本地服务运维](./docs/ops/README.md)
- [每日精准跨境选品 Agent 设计](./.ai-bridge/daily-product-research/README.md)
- [企业级验收证据矩阵](./企业级验收证据矩阵_2026-07-13.md)

## 当前状态

本仓库更适合作为“可验证的工程原型/候选开源项目”评审材料，而不是已完成商业化 SaaS。已具备完整模块、运行脚本、测试闸门和验收材料；真实店铺接入、外部渠道授权、生产密钥和长期运行数据需要在部署环境中单独配置与验证。
