# P2 多租户压测与恢复演练手册

## 结论门禁

压测脚本存在不等于通过。只有在批准的本地或预发布环境中执行，并保存目标、版本、负载、指标、错误、队列、重复副作用和恢复证据后，才能形成验收结论。

禁止事项：

- 禁止使用生产客户账号、生产审批任务或真实发布候选；
- 禁止在压测中调用 `approve` 或 `override`；
- 禁止未确认模型额度就创建 Agent run；
- 禁止把无样本、dry-run 或脚本语法检查记为性能通过；
- 禁止因队列积压直接让所有 API Pod 同时退出服务。

## 前置条件

1. 本地或预发布环境 `/api/v1/ready` 返回 `200`。
2. 使用独立测试组织、测试用户和测试数据。
3. Prometheus、Alertmanager、Grafana、OTel Collector 和 Jaeger 已启动。
4. 已记录代码版本、容器镜像摘要、数据库迁移版本和测试时间窗。
5. k6 已安装，或使用固定版本的 `grafana/k6` 容器。

## 脚本与安全开关

| 脚本 | 作用 | 必要开关 |
|---|---|---|
| `tests/load/load_api_run_create.js` | 创建 Run、读时间线、可选取消 | `LOAD_TEST_ALLOW_WRITES=1`、`LOAD_TEST_ALLOW_MODEL_COST=1` |
| `tests/load/load_approval_flow.js` | 并发要求重做/驳回与回读 | 再加 `LOAD_TEST_ALLOW_APPROVAL_MUTATIONS=1` |
| `tests/load/load_async_pipeline.py` | 并发创建、轮询终态、统计 P50/P95 | 写入和模型费用开关 |

所有脚本默认只允许 `127.0.0.1` 或 `localhost`。远程预发布环境还必须显式设置 `LOAD_TEST_ALLOW_REMOTE=1`。

## 0. Dry-run

```powershell
cd G:\平台\后端
npm.cmd run load:async:dry
```

该步骤只验证参数和保护开关，不创建任务，不消耗模型额度，也不是性能证据。

## 1. Run 创建与时间线

```powershell
$env:BASE_URL = 'http://127.0.0.1:3000'
$env:AUTH_TOKEN = '<专用测试账号令牌>'
$env:LOAD_TEST_ALLOW_WRITES = '1'
$env:LOAD_TEST_ALLOW_MODEL_COST = '1'
$env:VUS = '2'
$env:DURATION = '30s'
k6 run G:\平台\tests\load\load_api_run_create.js
```

默认不会取消任务。只有需要验证取消幂等时才设置 `LOAD_TEST_ENABLE_CANCEL=1`。

## 2. 并发审批冲突

先创建一次性、不会触发外部写入的审批测试数据，再执行：

```powershell
$env:APPROVAL_IDS = '<id-1>,<id-2>'
$env:APPROVAL_DECISION = 'request-changes'
$env:LOAD_TEST_ALLOW_WRITES = '1'
$env:LOAD_TEST_ALLOW_APPROVAL_MUTATIONS = '1'
$env:VUS = '4'
$env:ITERATIONS = '2'
k6 run G:\平台\tests\load\load_approval_flow.js
```

脚本硬性拒绝 `approve` 和 `override`。`400/409` 作为状态机或 OCC 冲突单独计量，其他非预期响应才计入错误率。

## 3. 异步完整链路

```powershell
$env:LOAD_TEST_ALLOW_WRITES = '1'
$env:LOAD_TEST_ALLOW_MODEL_COST = '1'
python G:\平台\tests\load\load_async_pipeline.py `
  --base-url http://127.0.0.1:3000 `
  --token '<专用测试账号令牌>' `
  --runs 20 `
  --concurrency 4 `
  --report G:\平台\.agent-runtime\load-async-report.json
```

报告返回非零退出码代表至少一个任务未成功完成，不能忽略。429 会指数退避；超时、失败和取消都会保留为失败样本。

## 4. 场景矩阵

按以下顺序逐步放量，不允许直接跳到峰值：

| 阶段 | 租户/并发模型 | 必看证据 |
|---|---|---|
| 冒烟 | 1 租户、1–2 VU | 基本成功、无重复、时间线完整 |
| 基线 | 10 测试租户、持续 15 分钟 | API P95、队列、DB、模型错误 |
| 目标 | 100 租户等价流量 | SLO、队列恢复、成本和限流 |
| 峰值 | 300 租户等价、1 小时 3,000 Run | 首次成功率、backlog、恢复时间 |
| 故障 | 外部 429/5xx、单 Worker 重启、Redis 抖动 | 告警、退避、幂等、无重复副作用 |

## 5. 通过标准

- Run 创建成功率 >= 99.95%；
- 常规任务完成时延 P95 < 120 秒，长任务必须单独分类；
- Sandbox P95 < 5 秒；
- API 月度目标 99.9%，压测窗口不得有未解释 5xx；
- Publish 首次成功率 > 97%，但只能在批准的沙箱/测试通道验证；
- Worker、队列和外部 API 故障恢复后，不产生重复发布、重复改价、重复扣费或重复商品；
- 告警能在预期时间触发、分组、送达真实接收人并关闭。

## 6. 当前环境阻断项

若本机没有 k6、没有 Kubernetes context、没有真实告警接收器或没有批准的压测数据集，只能完成静态验证和 dry-run。对应门禁必须保持“未验证”，不得显示为通过。
