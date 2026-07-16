# Prisma 迁移发布与恢复手册

## 日常门禁

在 `G:\平台\后端` 执行：

```powershell
npm.cmd run db:migrations:verify
npm.cmd run db:migrations:drift:check
npm.cmd run db:migrations:failures
```

漂移检查要求同时配置 `DATABASE_URL` 与独立的 `SHADOW_DATABASE_URL`。Shadow 数据库不得与业务库共用。

## 创建新迁移

1. 仅在本地开发库使用 `prisma migrate dev --create-only` 生成新目录。
2. 从 `prisma/migration-template` 复制 `metadata.json` 和 `rollback.sql`，填写 release、负责人、风险、兼容性与恢复方案。
3. 审查 SQL，不允许静默丢列、缩窄数据类型或无条件重建大表。
4. 注册到当前 OPEN release：

```powershell
$env:MIGRATION_RELEASE_REGISTER = '1'
node scripts/migrations/register-release-migration.mjs --migration <迁移目录名>
Remove-Item Env:MIGRATION_RELEASE_REGISTER
```

5. 执行治理测试、空库回放和应用回归。任何门禁失败都不得部署。

## 新数据库

首选方式是完整回放：

```powershell
npx.cmd prisma migrate deploy
```

CI 必须证明全部迁移能从空库执行。

## Baseline 快速接管

仅允许用于满足以下全部条件的数据库：

- 结构与 `v1-baseline` 完全一致；
- `_prisma_migrations` 不存在或为空；
- 数据库已单独备份；
- 变更单明确批准 baseline 接管。

先应用 `prisma/baselines/v1-baseline/migration.sql`，再执行：

```powershell
$env:MIGRATION_BASELINE_APPLY = '1'
npm.cmd run db:migrations:baseline:resolve -- --apply --baseline v1-baseline
Remove-Item Env:MIGRATION_BASELINE_APPLY
```

脚本会先验证结构，随后将 83 条冻结迁移标记为已应用，并通过 `migrate deploy` 执行 baseline 之后的 release。不得在已有正常迁移历史的生产库上运行。

## 迁移失败

1. 停止新版本部署和所有写库 Worker。
2. 读取失败证据：

```powershell
npm.cmd run db:migrations:failures
```

3. 保存 `_prisma_migrations.logs`、数据库错误日志、release ID、镜像版本和 trace ID。
4. 检查 SQL 是否已产生部分副作用，不得只根据进程退出码判断。
5. 二选一处理：
   - 可以安全撤销：执行已审核的 `rollback.sql`，再用 `prisma migrate resolve --rolled-back <name>` 标记并修复迁移。
   - 不可安全撤销：创建新的 forward patch，修复数据库后仅在证据确认 SQL 已完整落地时使用 `prisma migrate resolve --applied <name>`。
6. 在 staging 重放失败场景，并重新执行完整 release 门禁。

禁止操作：修改已应用的 `migration.sql`、删除 `_prisma_migrations` 记录、在生产执行 `migrate dev`、用 `resolve --applied` 掩盖未执行 SQL。

## 发布证据

每次 release 至少保留：

- `migration-governance.json` 与哈希验证结果；
- 空库 `migrate deploy` 结果；
- baseline 空库执行与零漂移结果；
- 现网副本对迁移历史的零漂移结果；
- 失败迁移扫描结果；
- 回滚或 forward-only 恢复说明；
- 应用构建和全量测试结果。
