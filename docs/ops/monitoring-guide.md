# ShopMate AI 监控与故障处置手册

## 适用范围

本手册用于本地服务器和批准的预发布环境。页面可打开、容器正在运行或 Prometheus 有数据，都不能单独作为生产通过证据。

## 启动与访问

在 `G:\平台\后端` 目录执行：

```powershell
$env:GRAFANA_ADMIN_PASSWORD = '<本地强口令>'
docker compose -f .\monitoring\docker-compose.monitoring.yml up -d
```

本地入口：

| 服务 | 地址 | 用途 |
|---|---|---|
| Prometheus | `http://127.0.0.1:9090` | 指标与规则状态 |
| Alertmanager | `http://127.0.0.1:9093` | 告警分组、静默和投递状态 |
| Grafana | `http://127.0.0.1:3001` | SLO 与排障面板 |
| Jaeger | `http://127.0.0.1:16686` | 分布式调用链 |
| 后端指标 | `http://127.0.0.1:3000/api/v1/metrics` | 原始 Prometheus 指标 |
| 深度就绪 | `http://127.0.0.1:3000/api/v1/ready` | DB、Redis、队列、存储、Agent |

Alertmanager 当前默认使用 `local-only` 空接收器，目的是本地验证规则和分组。未配置企业微信、邮件、Slack、PagerDuty 等真实接收渠道前，不得把“告警通知已通过”标为完成。

## 关键 SLI/SLO

| 维度 | 记录规则 | 目标 |
|---|---|---|
| API 可用性 | `shopmate:http_availability_ratio:30d` | 30 天 >= 99.9% |
| API P95 | `shopmate:http_latency_seconds:p95_5m` | < 500 ms 告警线 |
| Agent 成功率 | `shopmate:agent_run_success_ratio:14d` | 样本 >= 20 时 >= 98% |
| Agent 质量 | `shopmate:agent_quality_pass_ratio:14d` | 样本 >= 20 时 >= 98% |
| 队列堆积 | `shopmate:queue_backlog` | 连续 5 分钟 <= 50 |
| 队列采集 | `bullmq_queue_scrape_success` | 每个队列均为 1 |

无样本不是 0%，也不是通过。Agent 成功率和质量告警都设置最小样本门槛，前端必须显示“无样本”或“证据不足”。

## 告警处置

### API 快速消耗错误预算

1. 冻结发布，不继续部署新版本。
2. 检查 `http_requests_total{status="5xx"}`、P95 和最近发布版本。
3. 通过 Jaeger 按 `trace_id` 定位失败接口。
4. 若与新版本强相关，执行 `kubectl rollout undo`；不得只靠重启掩盖问题。
5. 恢复后验证 `/ready`、队列堆积和核心业务冒烟，再关闭事件。

### BullMQ 堆积

1. 查看 `bullmq_jobs_waiting`、`active`、`failed`、`delayed` 的队列标签。
2. 确认 Redis 正常，Worker 有心跳且没有租约长期占用。
3. 只在幂等和恢复扫描器通过验收后扩容 Worker。
4. 扩容后验证 backlog 持续下降，且没有重复商品、重复图片或重复外部写入。

### Agent 成功率或质量下降

1. 在 Agent 质量中心确认样本量、覆盖率、模型路由和 Prompt 版本。
2. 检查工具失败、429/5xx、证据不足和人工驳回原因。
3. 灰度 Prompt 最多 5%；不得自动把 challenger 提升为 champion。
4. 失败任务保留审计和重试轨迹，不得改写成“成功”。

## 故障注入与恢复

Linux/WSL 脚本：`G:\平台\scripts\fault-injection.sh`。

Kubernetes 安全发布脚本：

```powershell
.\scripts\k8s-safe-rollout.ps1 `
  -Deployment shopmate-backend `
  -Image registry.example.com/shopmate/backend:<不可变版本> `
  -Namespace shopmate `
  -WhatIf
```

去掉 `-WhatIf` 才会执行。只有显式添加 `-AutoRollback` 时，脚本才会在 rollout 失败后自动回滚。任何演练都必须在本地或批准的预发布环境进行。

## 验收证据

每次演练至少保存：

- 环境、版本、时间窗和负载模型；
- Prometheus 规则检查结果；
- 告警触发、分组、通知与恢复时间；
- `/ready` 前后对比；
- 队列峰值、恢复耗时、失败任务和重复副作用检查；
- rollout revision、回滚结果和业务冒烟结果。

缺少真实通知接收、目标负载结果、14 天连续 SLO 或外部依赖证据时，企业验收必须保持阻断。
