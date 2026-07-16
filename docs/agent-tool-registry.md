# Agent Tool Registry

版本：`1.0.0`

## 当前工具

| 工具 | 等级 | 风险 | 行为 |
| --- | --- | --- | --- |
| `system.health.read` | L1 | 只读 | 返回租户业务对象计数与连接状态 |
| `product.list` | L1 | 只读 | 读取当前组织商品 |
| `market.observation.list` | L1 | 只读 | 读取已提交的 Ozon 公开证据 |
| `opportunity.list` | L1 | 只读 | 读取已评分候选 |
| `automation.list` | L1 | 只读 | 读取自动化流程与最近状态 |
| `notification.list` | L1 | 只读 | 只读取当前用户通知 |
| `listing.publish.propose` | L4 | 高风险 | 只创建发布提案，不直接写 Ozon |

## 执行合同

- 每个工具声明输入 Schema、输出 Schema、自治等级、风险等级和审批要求。
- 输入哈希和幂等键使用 SHA-256 持久化。
- 状态：`PENDING -> QUEUED -> RUNNING -> COMPLETED`；也可进入 `PAUSED`、`WAITING_FOR_APPROVAL`、`FAILED` 或 `CANCELLED`。
- `agent-plans` BullMQ 队列使用稳定 Job ID `agent-plan__<planId>`，最多 3 次指数退避重试。
- 恢复扫描器重新投递 `QUEUED` 与超时 `RUNNING` 计划，不创建第二份业务记录。
- 暂停、取消和恢复都先持久化状态；Worker 在工具前后检查状态。

## 控制台接口

创建会话、消息、计划、执行、暂停、恢复、取消和失败步骤重试均由 `/api/v1/agent-*` 路由提供。工具输出必须落库后才显示为完成。
