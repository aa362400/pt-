import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DecryptCommand,
  GenerateDataKeyCommand,
  KMSClient,
} from '@aws-sdk/client-kms';

const ENCRYPTION_CONTEXT = {
  application: 'shopmate',
  purpose: 'ozon-credentials-v3',
} as const;

export interface GeneratedCredentialDataKey {
  plaintextKey: Buffer;
  encryptedDataKey: Buffer;
  keyId: string;
}

@Injectable()
export class CredentialKmsService {
  private readonly client: KMSClient;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('KMS_ENDPOINT', '').trim();
    const accessKeyId = this.config.get<string>('KMS_ACCESS_KEY_ID', '').trim();
    const secretAccessKey = this.config
      .get<string>('KMS_SECRET_ACCESS_KEY', '')
      .trim();
    this.client = new KMSClient({
      region: this.config.get<string>('KMS_REGION', 'us-east-1'),
      endpoint: endpoint || undefined,
      credentials:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined,
    });
  }

  isConfigured() {
    return Boolean(this.activeKeyId());
  }

  activeKeyId() {
    return this.config.get<string>('KMS_KEY_ID', '').trim();
  }

  async generateDataKey(): Promise<GeneratedCredentialDataKey> {
    const keyId = this.activeKeyId();
    if (!keyId) {
      throw new Error('AWS KMS credential encryption is not configured');
    }
    const result = await this.client.send(
      new GenerateDataKeyCommand({
        KeyId: keyId,
        KeySpec: 'AES_256',
        EncryptionContext: ENCRYPTION_CONTEXT,
      }),
    );
    if (!result.Plaintext || !result.CiphertextBlob) {
      throw new Error('AWS KMS did not return a complete data key');
    }
    const plaintextKey = Buffer.from(result.Plaintext);
    if (plaintextKey.length !== 32) {
      plaintextKey.fill(0);
      throw new Error('AWS KMS returned an invalid AES-256 data key');
    }
    return {
      plaintextKey,
      encryptedDataKey: Buffer.from(result.CiphertextBlob),
      keyId,
    };
  }

  async decryptDataKey(encryptedDataKey: Buffer) {
    const result = await this.client.send(
      new DecryptCommand({
        CiphertextBlob: encryptedDataKey,
        EncryptionContext: ENCRYPTION_CONTEXT,
      }),
    );
    if (!result.Plaintext) {
      throw new Error('AWS KMS did not return a plaintext data key');
    }
    const plaintextKey = Buffer.from(result.Plaintext);
    if (plaintextKey.length !== 32) {
      plaintextKey.fill(0);
      throw new Error('AWS KMS returned an invalid AES-256 data key');
    }
    return plaintextKey;
  }
}
