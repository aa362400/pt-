# ShopMate RC1 环境合同

日期：2026-07-14

## 数据库

- `DATABASE_URL`：应用运行账号连接串。
- `DATABASE_ADMIN_URL`：Prisma 迁移管理账号连接串，生产启动强制要求。
- `docker-compose.prod.yml` 已补齐 `DATABASE_ADMIN_URL`。
- Kubernetes 的 `shopmate-env` Secret 必须同时提供这两个变量，不在仓库中写入真实连接串。

## 生产安全门禁

- `CREDENTIAL_ENCRYPTION_PROVIDER=aws-kms`
- `KMS_KEY_ID` 指向可用的 AWS KMS Key。
- `AUDIT_ARCHIVE_ENABLED=true`
- `AUDIT_ARCHIVE_S3_BUCKET` 指向启用 Object Lock 的 Bucket。
- `AUDIT_ARCHIVE_OBJECT_LOCK_MODE=COMPLIANCE`
- `AUDIT_ARCHIVE_KMS_KEY_ID` 指向审计归档加密 Key。
- `AGENT_ALLOW_MOCK=false`
- JWT、Agent API Key、Webhook Secret 和 CORS 白名单必须显式配置。

## 已验证

- 生产 Compose 配置语法通过。
- 隔离 PostgreSQL、Redis、Agent 和后端容器可启动。
- 全部 Prisma 迁移可在全新数据库成功应用。
- 满足环境变量合同后，后端 `/api/v1/health` 返回 `status=ok`。

## 尚未验证

- 真实 AWS KMS 加解密调用。
- 真实 S3 Object Lock COMPLIANCE 写入、保留和回读。
- 镜像签名和签名验证。
- Kubernetes 生产集群部署、告警和灾备恢复。

这些项目完成前，不得标记为生产可发布。
