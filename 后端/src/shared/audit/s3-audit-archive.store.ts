import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  GetObjectLockConfigurationCommand,
  ObjectLockMode,
  PutObjectCommand,
  S3Client,
  ServerSideEncryption,
} from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';

export interface PutImmutableArchiveInput {
  key: string;
  body: Buffer;
  checksumHex: string;
  retainUntil: Date;
}

export interface ImmutableArchiveReceipt {
  key: string;
  versionId: string;
  checksumHex: string;
  objectLockMode: 'GOVERNANCE' | 'COMPLIANCE';
  retainUntil: Date;
  verifiedAt: Date;
}

@Injectable()
export class S3AuditArchiveStore {
  private client: S3Client;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('AUDIT_ARCHIVE_S3_ENDPOINT', '');
    const accessKeyId = this.config.get<string>(
      'AUDIT_ARCHIVE_S3_ACCESS_KEY_ID',
      this.config.get<string>('S3_ACCESS_KEY_ID', ''),
    );
    const secretAccessKey = this.config.get<string>(
      'AUDIT_ARCHIVE_S3_SECRET_ACCESS_KEY',
      this.config.get<string>('S3_SECRET_ACCESS_KEY', ''),
    );
    this.client = new S3Client({
      region: this.config.get<string>('AUDIT_ARCHIVE_S3_REGION', 'us-east-1'),
      endpoint: endpoint || undefined,
      forcePathStyle: Boolean(endpoint),
      credentials:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined,
    });
  }

  async putAndVerify(
    input: PutImmutableArchiveInput,
  ): Promise<ImmutableArchiveReceipt> {
    const bucket = this.config
      .get<string>('AUDIT_ARCHIVE_S3_BUCKET', '')
      .trim();
    if (!bucket) {
      throw new ServiceUnavailableException(
        'Immutable audit archive bucket is not configured',
      );
    }
    const lockMode = this.lockMode();
    const lockConfiguration = await this.client.send(
      new GetObjectLockConfigurationCommand({ Bucket: bucket }),
    );
    if (
      lockConfiguration.ObjectLockConfiguration?.ObjectLockEnabled !== 'Enabled'
    ) {
      throw new ServiceUnavailableException(
        'Audit archive bucket does not have Object Lock enabled',
      );
    }

    const checksumBase64 = Buffer.from(input.checksumHex, 'hex').toString(
      'base64',
    );
    const contentMd5 = createHash('md5').update(input.body).digest('base64');
    const kmsKeyId = this.config
      .get<string>('AUDIT_ARCHIVE_KMS_KEY_ID', '')
      .trim();
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: input.key,
          Body: input.body,
          ContentType: 'application/json',
          ContentMD5: contentMd5,
          ChecksumAlgorithm: 'SHA256',
          ChecksumSHA256: checksumBase64,
          IfNoneMatch: '*',
          ObjectLockMode: lockMode,
          ObjectLockRetainUntilDate: input.retainUntil,
          ServerSideEncryption: kmsKeyId
            ? ServerSideEncryption.aws_kms
            : ServerSideEncryption.AES256,
          ...(kmsKeyId
            ? { SSEKMSKeyId: kmsKeyId, BucketKeyEnabled: true }
            : {}),
        }),
      );
    } catch (error) {
      const statusCode = (error as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      if (statusCode !== 412) throw error;
    }

    const readback = await this.client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: input.key,
        ChecksumMode: 'ENABLED',
      }),
    );
    const readbackBody = await this.readBody(readback.Body);
    const readbackHash = createHash('sha256')
      .update(readbackBody)
      .digest('hex');
    if (
      readbackHash !== input.checksumHex ||
      readback.ChecksumSHA256 !== checksumBase64
    ) {
      throw new ServiceUnavailableException(
        'Immutable audit archive checksum mismatch after readback',
      );
    }
    if (
      readback.ObjectLockMode !== lockMode ||
      !readback.ObjectLockRetainUntilDate ||
      readback.ObjectLockRetainUntilDate < input.retainUntil
    ) {
      throw new ServiceUnavailableException(
        'Immutable audit archive retention was not applied',
      );
    }
    if (!readback.VersionId) {
      throw new ServiceUnavailableException(
        'Immutable audit archive has no version identifier',
      );
    }
    return {
      key: input.key,
      versionId: readback.VersionId,
      checksumHex: readbackHash,
      objectLockMode: lockMode,
      retainUntil: readback.ObjectLockRetainUntilDate,
      verifiedAt: new Date(),
    };
  }

  private lockMode(): 'GOVERNANCE' | 'COMPLIANCE' {
    const configured = this.config
      .get<string>('AUDIT_ARCHIVE_OBJECT_LOCK_MODE', 'COMPLIANCE')
      .toUpperCase();
    return configured === ObjectLockMode.GOVERNANCE
      ? 'GOVERNANCE'
      : 'COMPLIANCE';
  }

  private async readBody(body: unknown): Promise<Buffer> {
    if (!body) {
      throw new ServiceUnavailableException('Audit archive readback is empty');
    }
    if (
      typeof (body as { transformToByteArray?: unknown })
        .transformToByteArray === 'function'
    ) {
      const value = await (
        body as { transformToByteArray: () => Promise<Uint8Array> }
      ).transformToByteArray();
      return Buffer.from(value);
    }
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}
