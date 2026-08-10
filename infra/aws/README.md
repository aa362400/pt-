# AWS Audit Controls Deployment

`audit-controls.yml` creates the following isolated resources:

- A KMS envelope-encryption key for Ozon and other channel credentials.
- A separate KMS key for immutable audit archives.
- An audit bucket with versioning and S3 Object Lock COMPLIANCE enabled from creation.
- A least-privilege managed policy for the backend runtime identity.

The template does not create IAM users, access keys or long-lived credentials. After deployment, attach the output `ApplicationAccessPolicyArn` to the backend's short-lived runtime identity and inject resource identifiers through environment variables.

## Deployment

```powershell
aws cloudformation deploy `
  --template-file .\infra\aws\audit-controls.yml `
  --stack-name shopmate-audit-controls-production `
  --parameter-overrides Environment=production AuditRetentionDays=2555 `
  --capabilities CAPABILITY_NAMED_IAM `
  --no-fail-on-empty-changeset
```

## Evidence Requirements

A successful deployment command does not prove that the enterprise gate has passed. Acceptance evidence must also retain:

1. The CloudFormation stack is `CREATE_COMPLETE` or `UPDATE_COMPLETE`.
2. Automatic rotation is enabled for both KMS keys.
3. The backend performs a real `GenerateDataKey -> Decrypt` round trip.
4. Versioning and Object Lock are enabled on the audit bucket.
5. The backend writes an object with SHA-256 checksum, KMS encryption and COMPLIANCE retention.
6. The object is read back by `VersionId`, with checksum, retention mode and retention date verified.
7. Unauthorized deletion, HTTP access and writes with the wrong KMS key must fail.

The repository's existing `enterprise:readiness:verify` command covers the application-side round trip. Run it only in a controlled acceptance environment where external probing is explicitly authorized; local static tests cannot replace real AWS control-plane evidence.
