# 本机服务器平台交付结果

## 判定

**CONDITIONAL_READY**

本机服务器、登录态页面、DeepSeek、每日任务、七类报告、重启持久化和备份恢复均可使用。条件项是外部平台：当前没有 Ozon 全站实时数据接口，也没有足够的公开 RUB 价格证据生成可批准候选；Etsy/Amazon/Temu/Stripe live 与企业人工金标未配置。

## 访问

- 本机地址：`http://127.0.0.1`
- 局域网地址：`http://192.168.1.8`
- 登录方式：现有 OWNER 账号直接登录；全新安装由 `setup.ps1` 生成 ACL 保护的 `.local-server/first-login.txt`，首次成功并改密后删除。
- 下一次每日选品：北京时间 `2026-07-14 08:00:00`

## 一键命令

- 初始化：`powershell -ExecutionPolicy Bypass -File .\scripts\local-server\setup.ps1`
- 启动：`powershell -ExecutionPolicy Bypass -File .\scripts\local-server\start.ps1 -NoBuild`
- 停止：`powershell -ExecutionPolicy Bypass -File .\scripts\local-server\stop.ps1`
- 状态：`powershell -ExecutionPolicy Bypass -File .\scripts\local-server\status.ps1`
- 日志：`powershell -ExecutionPolicy Bypass -File .\scripts\local-server\logs.ps1`
- 备份：`powershell -ExecutionPolicy Bypass -File .\scripts\local-server\backup.ps1`
- 恢复：`powershell -ExecutionPolicy Bypass -File .\scripts\local-server\restore.ps1 -BackupPath <path>`
- 验收：`powershell -ExecutionPolicy Bypass -File .\scripts\local-server\verify.ps1`

## 已启用功能

- DeepSeek 文本 Agent，非 mock，生图模型配置保持不变。
- PILOT 每日选品、手动运行、每天 08:00 调度、来源健康、七类报告、通知/审核。
- 商品、草稿、利润、自动化、MCP、审计、记忆治理和企业健康页面。
- 人工审核前置；没有执行生图、批准、发布、改价、广告、库存或订单外部写入。

## 每日选品证据

- runId：`cmrjfi1a200hrs801ewjnihta`
- 状态：`COMPLETED`（attempt 2，前两次真实暴露并修复工件权限问题）
- 候选数：0
- TEST_NOW / WATCH / HOLD / REJECT：0 / 0 / 0 / 0
- 报告工件：7
- nextRunAt：`2026-07-14T00:00:00.000Z` = 北京时间 08:00
- 解释：没有可核验候选时输出 `NO_TOP`，系统明确不凑 Top 10。

## 页面验收

- 总路由数：40
- READY：23
- PARTIAL：13
- EXTERNAL_NOT_CONFIGURED：3
- PLACEHOLDER：1（客服外部合同，明确阻断）
- BROKEN：0

## 外部阻塞

- Ozon Seller API 不等于全站商品库；当前公开检索只有一条有效价格。
- Ozon 店铺、Etsy、Amazon、Temu 正式凭证未全部配置。
- Stripe live 未配置。
- 企业评测人工金标未签字。
- 跨设备防火墙放行和禁止睡眠可能需要 Windows 管理员。

## 安全边界

- `externalStoreMutation=false`
- 对外开放端口：仅 TCP 80 / Nginx
- PostgreSQL / Redis / backend / Agent / frontend：Compose 内部网络
- Agent 控制面 `/agent/` 对外返回 404，仅生成图片只读路径可代理
- 密钥未写入前端、文档、报告或聊天输出

## 回滚

1. 停止：`stop.ps1`
2. 使用 `.local-server/backups/20260714-deepseek-ready` 做隔离验证或明确目标恢复。
3. 启动：`start.ps1 -NoBuild`
4. 验证：`verify.ps1`

