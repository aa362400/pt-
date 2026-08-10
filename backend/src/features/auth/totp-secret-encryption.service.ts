import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

interface KeyRing {
  activeKeyId: string;
  keys: Map<string, Buffer>;
}

const ENVELOPE_PURPOSE = 'totp';
const ENVELOPE_VERSION = 'v1';
const ENVELOPE_PROVIDER = 'local';
const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const CONFIGURATION_ERROR = 'TOTP secret encryption is not configured';
const ENCRYPTION_ERROR = 'TOTP secret cannot be encrypted';
const DECRYPTION_ERROR = 'TOTP secret cannot be decrypted';

/**
 * Encrypts TOTP seeds with the same local keyring semantics used by channel
 * credentials. The envelope is purpose-specific so it cannot be confused with
 * another encrypted field, and AAD binds every seed to its owning user.
 */
@Injectable()
export class TotpSecretEncryptionService {
  constructor(private readonly configService: ConfigService) {}

  encrypt(secret: string, userId: string): string {
    const ring = this.configuredKeyRing();
    try {
      if (!secret || !userId) throw new Error(ENCRYPTION_ERROR);
      const key = ring.keys.get(ring.activeKeyId);
      if (!key) throw new Error(ENCRYPTION_ERROR);

      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(this.aad(userId, ring.activeKeyId));
      const ciphertext = Buffer.concat([
        cipher.update(secret, 'utf8'),
        cipher.final(),
      ]);

      return [
        ENVELOPE_PURPOSE,
        ENVELOPE_VERSION,
        ENVELOPE_PROVIDER,
        ring.activeKeyId,
        iv.toString('base64'),
        cipher.getAuthTag().toString('base64'),
        ciphertext.toString('base64'),
      ].join(':');
    } catch {
      throw new Error(ENCRYPTION_ERROR);
    } finally {
      this.clear(ring);
    }
  }

  decrypt(envelope: string, userId: string): string {
    let ring: KeyRing | undefined;
    try {
      if (!envelope || !userId) throw new Error(DECRYPTION_ERROR);
      const fields = envelope.split(':');
      if (fields.length !== 7) throw new Error(DECRYPTION_ERROR);

      const [purpose, version, provider, keyId, ivEncoded, tagEncoded, data] =
        fields;
      if (
        purpose !== ENVELOPE_PURPOSE ||
        version !== ENVELOPE_VERSION ||
        provider !== ENVELOPE_PROVIDER ||
        !keyId ||
        !KEY_ID_PATTERN.test(keyId) ||
        !ivEncoded ||
        !tagEncoded ||
        !data
      ) {
        throw new Error(DECRYPTION_ERROR);
      }

      ring = this.keyRing();
      const key = ring.keys.get(keyId);
      if (!key) throw new Error(DECRYPTION_ERROR);

      const iv = this.decodeBase64(ivEncoded);
      const tag = this.decodeBase64(tagEncoded);
      const ciphertext = this.decodeBase64(data);
      if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
        throw new Error(DECRYPTION_ERROR);
      }

      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAAD(this.aad(userId, keyId));
      decipher.setAuthTag(tag);
      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new Error(DECRYPTION_ERROR);
    } finally {
      if (ring) this.clear(ring);
    }
  }

  private configuredKeyRing(): KeyRing {
    try {
      return this.keyRing();
    } catch {
      throw new Error(CONFIGURATION_ERROR);
    }
  }

  private keyRing(): KeyRing {
    const serialized = this.configService.get<string>('ENCRYPTION_KEYS');
    const activeKeyId = this.configService.get<string>(
      'ENCRYPTION_ACTIVE_KEY_ID',
    );
    if (!serialized || !activeKeyId || !KEY_ID_PATTERN.test(activeKeyId)) {
      throw new Error(CONFIGURATION_ERROR);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(serialized);
    } catch {
      throw new Error(CONFIGURATION_ERROR);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(CONFIGURATION_ERROR);
    }

    const keys = new Map<string, Buffer>();
    try {
      for (const [keyId, secret] of Object.entries(parsed)) {
        if (
          !KEY_ID_PATTERN.test(keyId) ||
          typeof secret !== 'string' ||
          secret.length < 16
        ) {
          throw new Error(CONFIGURATION_ERROR);
        }
        keys.set(keyId, createHash('sha256').update(secret, 'utf8').digest());
      }
      if (keys.size === 0 || !keys.has(activeKeyId)) {
        throw new Error(CONFIGURATION_ERROR);
      }
      return { activeKeyId, keys };
    } catch {
      for (const key of keys.values()) key.fill(0);
      throw new Error(CONFIGURATION_ERROR);
    }
  }

  private aad(userId: string, keyId: string): Buffer {
    return Buffer.from(
      `shopmate:${ENVELOPE_PURPOSE}:${ENVELOPE_VERSION}:${ENVELOPE_PROVIDER}:${userId}:${keyId}`,
      'utf8',
    );
  }

  private decodeBase64(value: string): Buffer {
    if (!BASE64_PATTERN.test(value)) throw new Error(DECRYPTION_ERROR);
    const decoded = Buffer.from(value, 'base64');
    if (decoded.toString('base64') !== value) {
      throw new Error(DECRYPTION_ERROR);
    }
    return decoded;
  }

  private clear(ring: KeyRing): void {
    for (const key of ring.keys.values()) key.fill(0);
  }
}
