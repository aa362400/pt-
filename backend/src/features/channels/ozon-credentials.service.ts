import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { CredentialKmsService } from './credential-kms.service.js';

export interface OzonCredentials {
  clientId: string;
  apiKey: string;
}

export interface OzonPerformanceCredentials {
  clientId: string;
  clientSecret: string;
}

interface KeyRing {
  activeKeyId: string;
  keys: Map<string, Buffer>;
}

type CredentialEncryptionProvider = 'local' | 'aws-kms';

@Injectable()
export class OzonCredentialsService {
  constructor(
    private readonly configService: ConfigService,
    private readonly kms: CredentialKmsService,
  ) {}

  async encode(credentials: OzonCredentials): Promise<string> {
    return this.provider() === 'aws-kms'
      ? this.encodeKms(credentials)
      : this.encodeLocal(credentials);
  }

  async decode(encoded: string): Promise<OzonCredentials> {
    const raw = encoded.trim();
    if (raw.startsWith('v3:')) {
      try {
        return await this.decodeKms(raw);
      } catch {
        throw new Error('Ozon credentials cannot be decrypted');
      }
    }
    if (raw.startsWith('v2:')) {
      const [, keyId, iv, tag, ciphertext] = raw.split(':');
      const key = keyId ? this.keyRing()?.keys.get(keyId) : undefined;
      if (!keyId || !key || !iv || !tag || !ciphertext) {
        throw new Error('Ozon credentials cannot be decrypted');
      }
      return this.parse(
        this.decrypt(key, iv, tag, ciphertext, this.localAad(keyId)),
      );
    }
    if (raw.startsWith('v1:')) {
      const [, iv, tag, ciphertext] = raw.split(':');
      const ring = this.keyRing();
      if (!ring || !iv || !tag || !ciphertext) {
        throw new Error('Ozon credentials cannot be decrypted');
      }
      for (const key of ring.keys.values()) {
        try {
          return this.parse(this.decrypt(key, iv, tag, ciphertext));
        } catch {
          // Legacy v1 has no key id, so each configured historical key is tried.
        }
      }
      throw new Error('Ozon credentials cannot be decrypted');
    }
    if (raw.startsWith('b64:')) {
      return this.parse(Buffer.from(raw.slice(4), 'base64').toString('utf8'));
    }
    return this.parse(raw);
  }

  async encodePerformance(
    credentials: OzonPerformanceCredentials,
  ): Promise<string> {
    return this.encode({
      clientId: credentials.clientId,
      apiKey: credentials.clientSecret,
    });
  }

  async decodePerformance(
    encoded: string,
  ): Promise<OzonPerformanceCredentials> {
    const credentials = await this.decode(encoded);
    return {
      clientId: credentials.clientId,
      clientSecret: credentials.apiKey,
    };
  }

  maskPerformance(credentials: OzonPerformanceCredentials) {
    return {
      clientId: credentials.clientId,
      clientSecretMasked:
        credentials.clientSecret.length > 6
          ? `${credentials.clientSecret.slice(0, 3)}***${credentials.clientSecret.slice(-3)}`
          : '***',
    };
  }

  inspect(encoded: string) {
    const provider = this.provider();
    const activeKeyId =
      provider === 'aws-kms'
        ? this.kms.activeKeyId() || null
        : (this.keyRing()?.activeKeyId ?? null);
    if (encoded.startsWith('v3:')) {
      const [, envelopeProvider, keyIdEncoded] = encoded.split(':');
      const keyId = this.fromBase64Url(keyIdEncoded);
      return {
        version: 'v3',
        provider: envelopeProvider || 'unknown',
        keyId,
        activeKeyId,
        needsRotation:
          provider !== 'aws-kms' ||
          envelopeProvider !== 'aws-kms' ||
          !keyId ||
          keyId !== activeKeyId,
      };
    }
    if (encoded.startsWith('v2:')) {
      const keyId = encoded.split(':')[1] || null;
      return {
        version: 'v2',
        provider: 'local',
        keyId,
        activeKeyId,
        needsRotation: provider !== 'local' || !keyId || keyId !== activeKeyId,
      };
    }
    return {
      version: encoded.startsWith('v1:') ? 'v1' : 'legacy-plaintext',
      provider: encoded.startsWith('v1:') ? 'legacy-local' : 'legacy-plaintext',
      keyId: null,
      activeKeyId,
      needsRotation: true,
    };
  }

  async rotate(encoded: string) {
    const inspection = this.inspect(encoded);
    if (!inspection.needsRotation) {
      return {
        changed: false,
        encoded,
        fromKeyId: inspection.keyId,
        toKeyId: inspection.activeKeyId,
      };
    }
    const rotated = await this.encode(await this.decode(encoded));
    return {
      changed: true,
      encoded: rotated,
      fromKeyId: inspection.keyId,
      toKeyId: this.inspect(rotated).keyId,
    };
  }

  mask(credentials: OzonCredentials) {
    return {
      clientId: credentials.clientId,
      apiKeyMasked:
        credentials.apiKey.length > 6
          ? `${credentials.apiKey.slice(0, 3)}***${credentials.apiKey.slice(-3)}`
          : '***',
    };
  }

  private async encodeKms(credentials: OzonCredentials) {
    if (!this.kms.isConfigured()) {
      throw new Error('AWS KMS credential encryption is not configured');
    }
    const generated = await this.kms.generateDataKey();
    const encryptedDataKey = generated.encryptedDataKey.toString('base64');
    const iv = randomBytes(12);
    try {
      const cipher = createCipheriv('aes-256-gcm', generated.plaintextKey, iv);
      cipher.setAAD(this.kmsAad('aws-kms', generated.keyId, encryptedDataKey));
      const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(credentials), 'utf8'),
        cipher.final(),
      ]);
      return [
        'v3',
        'aws-kms',
        this.toBase64Url(generated.keyId),
        encryptedDataKey,
        iv.toString('base64'),
        cipher.getAuthTag().toString('base64'),
        ciphertext.toString('base64'),
      ].join(':');
    } finally {
      generated.plaintextKey.fill(0);
    }
  }

  private async decodeKms(encoded: string) {
    const [, provider, keyIdEncoded, encryptedDataKey, iv, tag, ciphertext] =
      encoded.split(':');
    const keyId = this.fromBase64Url(keyIdEncoded);
    if (
      provider !== 'aws-kms' ||
      !keyId ||
      !encryptedDataKey ||
      !iv ||
      !tag ||
      !ciphertext
    ) {
      throw new Error('Invalid KMS credential envelope');
    }
    const plaintextKey = await this.kms.decryptDataKey(
      Buffer.from(encryptedDataKey, 'base64'),
    );
    try {
      return this.parse(
        this.decrypt(
          plaintextKey,
          iv,
          tag,
          ciphertext,
          this.kmsAad(provider, keyId, encryptedDataKey),
        ),
      );
    } finally {
      plaintextKey.fill(0);
    }
  }

  private encodeLocal(credentials: OzonCredentials) {
    const ring = this.keyRing();
    if (!ring) {
      throw new Error('Credential encryption key is not configured');
    }
    const key = ring.keys.get(ring.activeKeyId);
    if (!key) {
      throw new Error('Active credential encryption key is unavailable');
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(this.localAad(ring.activeKeyId));
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(credentials), 'utf8'),
      cipher.final(),
    ]);
    return [
      'v2',
      ring.activeKeyId,
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  private provider(): CredentialEncryptionProvider {
    return this.configService.get<CredentialEncryptionProvider>(
      'CREDENTIAL_ENCRYPTION_PROVIDER',
      'local',
    );
  }

  private parse(value: string): OzonCredentials {
    const parsed = JSON.parse(value) as Partial<OzonCredentials>;
    if (!parsed.clientId || !parsed.apiKey) {
      throw new Error('Ozon credentials are incomplete');
    }
    return {
      clientId: String(parsed.clientId),
      apiKey: String(parsed.apiKey),
    };
  }

  private keyRing(): KeyRing | null {
    const keys = new Map<string, Buffer>();
    const serialized = this.configService.get<string>('ENCRYPTION_KEYS');
    if (serialized) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(serialized);
      } catch {
        throw new Error('ENCRYPTION_KEYS must be a JSON object');
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('ENCRYPTION_KEYS must be a JSON object');
      }
      for (const [keyId, secret] of Object.entries(parsed)) {
        if (!/^[A-Za-z0-9._-]{1,64}$/.test(keyId)) {
          throw new Error('Credential encryption key id is invalid');
        }
        if (typeof secret !== 'string' || secret.length < 16) {
          throw new Error(`Credential encryption key ${keyId} is too short`);
        }
        keys.set(keyId, this.deriveKey(secret));
      }
    }

    const legacy = this.configService.get<string>('ENCRYPTION_KEY');
    if (legacy?.length && legacy.length >= 16 && !keys.has('legacy')) {
      keys.set('legacy', this.deriveKey(legacy));
    }
    if (keys.size === 0) return null;

    const configuredActive = this.configService.get<string>(
      'ENCRYPTION_ACTIVE_KEY_ID',
    );
    const activeKeyId =
      configuredActive || (keys.has('legacy') ? 'legacy' : '');
    if (!activeKeyId || !keys.has(activeKeyId)) {
      throw new Error(
        'ENCRYPTION_ACTIVE_KEY_ID does not identify a configured key',
      );
    }
    return { activeKeyId, keys };
  }

  private deriveKey(secret: string): Buffer {
    return createHash('sha256').update(secret, 'utf8').digest();
  }

  private localAad(keyId: string): Buffer {
    return Buffer.from(`ozon-credentials:${keyId}`, 'utf8');
  }

  private kmsAad(provider: string, keyId: string, encryptedDataKey: string) {
    return Buffer.from(
      `ozon-credentials:v3:${provider}:${keyId}:${encryptedDataKey}`,
      'utf8',
    );
  }

  private toBase64Url(value: string) {
    return Buffer.from(value, 'utf8').toString('base64url');
  }

  private fromBase64Url(value?: string) {
    if (!value) return null;
    try {
      const decoded = Buffer.from(value, 'base64url').toString('utf8');
      return decoded || null;
    } catch {
      return null;
    }
  }

  private decrypt(
    key: Buffer,
    ivBase64: string,
    tagBase64: string,
    encryptedBase64: string,
    aad?: Buffer,
  ): string {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(ivBase64, 'base64'),
    );
    if (aad) decipher.setAAD(aad);
    decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedBase64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
