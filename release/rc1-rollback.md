# RC1 回滚手册

## 触发条件

- Agent 计划重复执行或跨租户读取。
- 外部写入绕过 `ActionProposal`、发布快照或人工审批。
- Ozon 证据被伪造、来源不可追踪或解析器版本不匹配。
- 数据库迁移、队列恢复或多副本运行造成不可逆状态错误。

## 立即止损

1. 关闭自动化调度、Agent 自主循环和发布 Worker，不删除审计数据。
2. 将自治策略统一降为 L0；保留登录、只读查询和人工审核查看。
3. 禁用浏览器扩展上传入口和所有外部提交消费者。
4. 停止新的 Ozon 写请求；对 `ExternalSubmission` 中未终态记录逐笔核对。
5. 保存后端、Agent、队列和数据库日志，并记录当前版本与时间。

## 应用回滚

部署上一份已验证的不可变镜像摘要。当前候选没有镜像摘要，因此不能执行生产镜像回滚；必须先完成镜像构建与签名才能冻结 RC1。

## 数据库回滚

- Prisma 迁移采用向前修复，禁止直接删除已应用迁移目录。
- 破坏性故障优先恢复迁移前的 PostgreSQL 备份，再重放已确认安全的 Outbox。
- 恢复后核对 `ActionProposal`、`ListingPublishSnapshot`、`ExternalSubmission`、`AgentPlan`、`AgentToolExecution` 和 `AutomationStepExecution` 的数量与终态。

## 恢复验证

1. 后端 `/api/v1/health`、`/api/v1/ready`、PostgreSQL、Redis 和 Agent `/api/health` 全部可用。
2. 只读 Agent 计划只执行一次，重试沿用稳定 Job ID。
3. 高风险工具只创建审批提案，不直接写 Ozon。
4. 发布载荷哈希与已批准快照一致。
5. 跨租户、通知所有权和 RBAC 回归测试通过。
6. 人工签字后才能重新开启 L2 以上自治等级。
