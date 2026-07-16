# 跨境电商 Agent 企业级验收证据矩阵

验收日期：2026-07-13  
验收环境：本地服务器（后端 3000、Agent 8080、前端 5175）  
验收原则：只记录真实证据；任何外部凭证、连续观测时间或真实交易缺失时均不得显示通过。

## 一、当前结论

当前平台已具备可运行的本地企业级基础设施与真实 Ozon 只读链路，但尚未满足“企业级总验收通过”。

- 本地代码、数据库隔离、审计链、Ozon 只读、前后端与 Agent 服务：通过。
- 真实图片生成：失败，主 Key 额度不足且备用 Key/模型不可用，已准确落库为 `MODEL_PROVIDER_FALLBACK_EXHAUSTED`，未生成图片、未写入 Ozon。
- AWS KMS、S3 Object Lock、外部渗透测试、Stripe 真实支付退款、14 天 SLO：未满足，不得显示通过。

## 二、已通过证据

| 验收项 | 状态 | 真实证据 |
|---|---|---|
| 后端全量测试 | 通过 | 61 suites passed，1 skipped；358 tests passed，2 skipped |
| Python Agent 全量测试 | 通过 | 569 passed |
| 前端生产构建 | 通过 | TypeScript + Vite 构建成功 |
| 前端静态检查 | 通过（有警告） | lint 退出码 0；Figma 原型目录仍有未使用导入警告 |
| 服务健康 | 通过 | `/api/v1/health`、`/api/v1/ready`、Agent `/api/health`、前端均为 HTTP 200 |
| PostgreSQL RLS | 通过 | 39 张租户表全部启用并强制 RLS；运行角色非 superuser、无 bypassRls |
| RLS 跨租户验收 | 通过 | 所有受测业务表 `foreignRows=0`、`rowsWithoutContext=0` |
| 审计哈希链 | 通过 | Ozon 回归时 109 条链式记录，0 未链记录，0 断点 |
| Ozon 凭据 | 通过 | Seller API 凭据真实可用 |
| Ozon 商品目录 | 通过 | 实时读取成功；账户商品总数 409，验收抽取 5 条 |
| Ozon FBS 订单 | 通过 | 实时只读接口可访问，验收抽取 5 条 |
| Ozon FBO 订单 | 通过 | 实时只读接口可访问，当前返回 0 条 |
| Ozon 外部写入保护 | 通过 | 验收记录 `externalMutation=false` |
| Agent Mock 保护 | 通过 | `AGENT_ALLOW_MOCK=false`，后端使用真实 HttpAgentProvider |
| 模型状态同步 | 通过 | Agent 健康状态为 `unavailable`，错误为 `primary_quota_exhausted_fallback_unavailable`；前端显示主额度不足、备用不可用 |
| 模型与密钥容灾 | 通过（机制） | 文本、视觉分析和图片生成均按主 Key、备用 Key、主模型、备用模型顺序切换；真实配置当前无可用备用额度 |
| 容灾终态中文提示 | 通过 | 前端识别模型/图片额度不足及 fallback exhausted 错误码，不再直接展示内部英文错误码 |
| 不可恢复错误重试 | 通过 | 额度不足立即转为不可重试错误；不再执行三次无效供应商调用 |
| Agent 任务终态 | 通过 | 不可恢复错误即使剩余重试次数也会落库为 FAILED，不再卡在 RUNNING |
| 双仓任务契约 | 通过 | 根目录、后端、Python Agent 三份 contract SHA-256 完全一致 |
| 测试运行隔离 | 通过 | 测试使用独立 runtime/session/log 目录，不与本地服务器互相覆盖 |

## 三、真实失败与阻断

| 企业门禁 | 当前状态 | 必须满足的条件 |
|---|---|---|
| 真实非 Mock Agent 完成任务 | 失败 | 给当前模型供应商充值或配置真正可用的备用模型/备用 Key，再完成一次非 Mock 图片任务；当前真实终态为 `MODEL_PROVIDER_FALLBACK_EXHAUSTED` |
| 图片生成 | 失败 | 当前供应商明确返回 `insufficient_user_quota`；不能假通过 |
| 14 天 SLO | 失败 | 当前仅观测 1 天，0 天达标；必须连续采集满 14 天并满足阈值 |
| AWS KMS | 未配置 | 配置真实 KMS，完成 GenerateDataKey/Decrypt 往返验收 |
| S3 Object Lock | 未配置 | 配置开启 Object Lock 的桶，完成 COMPLIANCE 保留、版本、SSE-KMS 回读验收 |
| 外部渗透测试 | 未配置 | 提供第三方报告、报告哈希、日期、机构和高危/严重问题清零证据 |
| Stripe 真实支付退款 | 未配置 | 使用 live 模式完成支付与退款，并保存脱敏回执证据 |
| Etsy/Amazon/Temu 真实连接器 | 未完成 | 分别完成官方授权、只读回归、权限范围和审计；Temu 按当前决策继续暂缓 |

## 四、证据文件与命令

- Ozon 只读证据：`G:\平台\后端\.agent-runtime\ozon-readonly-regression.json`
- Agent 非 Mock 证据：`G:\平台\后端\.agent-runtime\agent-nonmock-regression.json`
- 企业门禁：`npm run enterprise:readiness:verify`
- Ozon 回归：`npm run acceptance:ozon-readonly`
- Agent 回归：`npm run acceptance:agent-nonmock`
- RLS 结构：`npm run security:rls:verify`
- RLS 跨租户：`npm run security:rls:channel-acceptance`

## 五、严格上线判定

当前判定：**不允许标记“企业级全部通过”**。

允许继续本地使用的范围：Ozon 数据读取、商品/订单同步、只读分析、研究报告、通知、人工审核、本地草稿与审计。

继续禁止自动执行的范围：商品发布、Ozon 改价、库存修改、广告操作、订单动作、付款退款以及任何缺少人工确认的高风险写操作。
