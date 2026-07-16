# AWS 审计控制部署

`audit-controls.yml` 创建以下相互隔离的资源：

- Ozon 等渠道凭据使用的 KMS 信封加密密钥；
- 不可变审计归档使用的独立 KMS 密钥；
- 从创建时即启用版本控制与 S3 Object Lock COMPLIANCE 的审计桶；
- 供后端运行身份附加的最小权限托管策略。

模板不会创建 IAM 用户、访问密钥或长期凭据。部署后，应把输出的
`ApplicationAccessPolicyArn` 附加到后端的短期运行身份，并通过环境变量注入资源标识。

## 部署

```powershell
aws cloudformation deploy `
  --template-file .\infra\aws\audit-controls.yml `
  --stack-name shopmate-audit-controls-production `
  --parameter-overrides Environment=production AuditRetentionDays=2555 `
  --capabilities CAPABILITY_NAMED_IAM `
  --no-fail-on-empty-changeset
```

## 证据要求

部署命令成功不代表企业门禁通过。验收必须同时保留：

1. CloudFormation 栈为 `CREATE_COMPLETE` 或 `UPDATE_COMPLETE`；
2. 两把 KMS 密钥均启用自动轮换；
3. 后端真实执行一次 `GenerateDataKey -> Decrypt` 往返；
4. 审计桶的 Versioning 与 Object Lock 均为启用状态；
5. 后端写入一个带 SHA-256 校验和、KMS 加密和 COMPLIANCE 保留期的对象；
6. 使用返回的 `VersionId` 回读，并验证校验和、保留模式和保留截止时间；
7. 未授权删除、HTTP 访问和错误 KMS 密钥写入必须失败。

仓库现有的 `enterprise:readiness:verify` 负责应用侧往返验证。只有在受控验收环境中
明确授权外部探测时才能运行；本地静态测试不能替代真实 AWS 控制面证据。
