# 本机服务器基线

状态：COMPLETED  
记录时间：2026-07-14 00:40 Asia/Shanghai

## 代码基线

- Git revision：`e7d248dbf7f5ff594e70f45edf8a701c9684f2f2`
- 扫描时工作区 dirty entries：378
- 结论：工作区原有大量用户改动。本次没有 reset、checkout 或清理无关文件。
- 本次重点修改：本机 Compose/PowerShell、每日选品恢复与工件目录、DeepSeek 中文 Ozon 术语解析、审批中心崩溃、Agent 可写运行目录、`uuid` 安全升级。

## 运行环境

- Windows 11 专业版 `10.0.26200`，build `26200`
- Docker Engine `29.5.3`
- Docker Compose `v5.1.4`
- Node `v24.15.0`
- npm `11.12.1`
- pnpm `11.5.0`
- Python `3.11.15`
- Git `2.54.0.windows.1`
- G 盘可用空间：约 `931.2 GB`
- 物理局域网 IPv4：`192.168.1.8`

## 当前部署

- 唯一宿主入口：Nginx `0.0.0.0:80`
- 内部服务：PostgreSQL、Redis、NestJS、Python Agent、React frontend
- 六个长期容器均为 `healthy`
- PostgreSQL / Redis / backend / Agent / frontend 均无宿主端口映射
- Prisma migrations：62 个，数据库 schema 已是最新
- PostgreSQL RLS policies：50
- `shopmate_app`：`superuser=false`、`bypassrls=false`

## 模型与数据边界

- 文本模型：`deepseek-chat`
- Agent 健康：`available`、`mockMode=false`、`fallbackActive=false`
- 供应商实际返回模型：`deepseek-v4-flash`（OpenAI 兼容网关返回值）
- 生图配置保持 `gpt-image-2-4k` 与原生图网关，不随文本模型切换
- Ozon 公开证据依赖可核验链接、抓取时间和至少两条 RUB 价格；不足时失败，不补数据
- 外部写边界：`externalStoreMutation=false`

