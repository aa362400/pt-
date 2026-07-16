import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('AWS audit infrastructure security', () => {
  const templatePath = join(
    process.cwd(),
    '..',
    'infra',
    'aws',
    'audit-controls.yml',
  );

  it('separates credential and audit KMS keys and rotates both', () => {
    const template = readFileSync(templatePath, 'utf8');

    expect(template).toMatch(
      /CredentialEncryptionKey:[\s\S]*?EnableKeyRotation: true/,
    );
    expect(template).toMatch(/AuditArchiveKey:[\s\S]*?EnableKeyRotation: true/);
    expect(template).toContain('alias/shopmate/credentials');
    expect(template).toContain('alias/shopmate/audit-archive');
  });

  it('provisions an immutable, versioned, KMS-encrypted audit bucket', () => {
    const template = readFileSync(templatePath, 'utf8');

    expect(template).toContain('ObjectLockEnabled: true');
    expect(template).toMatch(/VersioningConfiguration:[\s\S]*?Status: Enabled/);
    expect(template).toMatch(
      /ObjectLockConfiguration:[\s\S]*?ObjectLockEnabled: Enabled[\s\S]*?Mode: COMPLIANCE/,
    );
    expect(template).toMatch(
      /BucketEncryption:[\s\S]*?SSEAlgorithm: aws:kms[\s\S]*?BucketKeyEnabled: true/,
    );
  });

  it('blocks public access, insecure transport, and incorrect encryption keys', () => {
    const template = readFileSync(templatePath, 'utf8');

    expect(template).toMatch(/BlockPublicAcls: true/);
    expect(template).toMatch(/BlockPublicPolicy: true/);
    expect(template).toMatch(/IgnorePublicAcls: true/);
    expect(template).toMatch(/RestrictPublicBuckets: true/);
    expect(template).toContain('aws:SecureTransport');
    expect(template).toContain('s3:x-amz-server-side-encryption');
    expect(template).toContain(
      's3:x-amz-server-side-encryption-aws-kms-key-id',
    );
  });

  it('exports deploy-time identifiers without embedding credentials', () => {
    const template = readFileSync(templatePath, 'utf8');

    expect(template).toContain('CredentialEncryptionKeyArn:');
    expect(template).toContain('AuditArchiveKeyArn:');
    expect(template).toContain('AuditArchiveBucketName:');
    expect(template).toContain('ApplicationAccessPolicyArn:');
    expect(template).not.toMatch(/AKIA[0-9A-Z]{16}/);
    expect(template).not.toMatch(/SecretAccessKey\s*:/i);
  });
});
