# ADR-001: Prisma 迁移基线与发布治理

- 状态：已接受
- 日期：2026-07-15
- 范围：`G:\平台\后端\prisma`

## 背景

后端已有 83 条已部署迁移。现有数据库的 `_prisma_migrations` 已引用这些目录，因此直接删除、重命名或压缩旧迁移会破坏已部署环境的历史一致性。数据库还包含 RLS、检查约束、表达式索引和手写 SQL 索引，其中一部分无法由 `schema.prisma` 完整表达。

## 决策

1. 冻结截至 `20260715200000_add_product_launch_publish_grants` 的 83 条迁移。每个 `migration.sql` 的 SHA-256 记录在 `prisma/migration-governance.json`，历史文件不可修改。
2. `v1-baseline` 是第 83 条迁移执行后的真实 PostgreSQL 结构快照，不包含业务数据和 `_prisma_migrations`。SQL 与 Prisma introspection 快照均固定哈希。
3. 不从仓库删除旧迁移。正常新环境仍优先执行 `prisma migrate deploy` 完整回放；baseline 只用于结构已等同于冻结点、且迁移历史为空的受控环境。
4. 数据库漂移以“目标数据库 vs 已注册迁移历史”为准。不能为了让 `schema.prisma` 显示零差异而删除 RLS、表达式索引或数据库专用索引。
5. 新迁移必须属于一个 OPEN release，并携带 `metadata.json` 与 `rollback.sql`。修改已注册迁移会被 CI 拒绝。
6. CI 和运行镜像只允许 `prisma migrate deploy`。`migrate dev` 只允许本地开发生成新迁移，不得出现在部署入口。
7. baseline 接管需要 `--apply --baseline <id>` 与 `MIGRATION_BASELINE_APPLY=1` 两个显式授权，先校验结构，再标记冻结迁移，最后执行当前 release 的 `migrate deploy`。
8. 迁移失败先读取 `_prisma_migrations.logs`，停止发布并选择 forward patch 或受控 `migrate resolve`；禁止编辑已应用迁移伪造成功。

## 结果

- 优点：现有环境不被破坏；历史篡改、未登记迁移、缺失回滚说明和真实漂移都会被阻断。
- 成本：83 条旧迁移继续保留；baseline 和完整迁移回放都需要在 CI 维护。
- 限制：baseline 不是生产库备份，也不能替代数据备份、恢复演练或 release migration。

## 被否决的方案

- 删除 83 条旧迁移后只保留一个新 migration：会让现有 `_prisma_migrations` 历史失效。
- 以 `schema.prisma` 单独作为数据库真相：会误判或删除 Prisma 无法表达的数据库安全与性能对象。
- 失败后修改原 migration.sql 再重跑：不可审计，并会造成不同环境执行不同 SQL。
