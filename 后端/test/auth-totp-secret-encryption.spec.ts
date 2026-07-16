import { ConfigService } from '@nestjs/config';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { AuthService } from '../src/features/auth/auth.service.js';

interface TotpSecretInternals {
  encryptTwoFactorSecret(secret: string, userId: string): string;
  decryptTwoFactorSecret(encrypted: string, userId: string): string;
}

function config(values: Record<string, string | undefined>) {
  return {
    get: jest.fn((key: string, fallback?: unknown) =>
      values[key] === undefined ? fallback : values[key],
    ),
    getOrThrow: jest.fn((key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`Missing ${key}`);
      return value;
    }),
  } as unknown as ConfigService;
}

function service(values: Record<string, string | undefined> = {}) {
  return new AuthService({} as never, {} as never, config(values), {
    send: jest.fn(),
  }) as unknown as TotpSecretInternals;
}

function legacyAppKeyEnvelope(secret: string, appKey: string) {
  const key = createHash('sha256').update(appKey).digest();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ]);
  return [
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

describe('AuthService TOTP secret encryption', () => {
  const secret = 'JBSWY3DPEHPK3PXP';
  const activeSecret = 'active-encryption-secret-at-least-32-characters';
  const oldSecret = 'old-encryption-secret-at-least-32-characters';

  it('fails closed instead of storing Base64 when the keyring is missing', () => {
    expect(() => service().encryptTwoFactorSecret(secret, 'user-1')).toThrow(
      'TOTP secret encryption is not configured',
    );
  });

  it.each([
    ['invalid JSON', '{'],
    ['non-object JSON', '[]'],
    ['short key material', JSON.stringify({ active: 'too-short' })],
  ])('fails closed for %s in ENCRYPTION_KEYS', (_label, serialized) => {
    expect(() =>
      service({
        ENCRYPTION_KEYS: serialized,
        ENCRYPTION_ACTIVE_KEY_ID: 'active',
      }).encryptTwoFactorSecret(secret, 'user-1'),
    ).toThrow('TOTP secret encryption is not configured');
  });

  it('fails closed when the active key id is missing or unknown', () => {
    const serialized = JSON.stringify({ active: activeSecret });

    expect(() =>
      service({ ENCRYPTION_KEYS: serialized }).encryptTwoFactorSecret(
        secret,
        'user-1',
      ),
    ).toThrow('TOTP secret encryption is not configured');
    expect(() =>
      service({
        ENCRYPTION_KEYS: serialized,
        ENCRYPTION_ACTIVE_KEY_ID: 'unknown',
      }).encryptTwoFactorSecret(secret, 'user-1'),
    ).toThrow('TOTP secret encryption is not configured');
  });

  it('writes a versioned local envelope and binds it to the user with AAD', () => {
    const encryption = service({
      ENCRYPTION_KEYS: JSON.stringify({ 'key-2026-07': activeSecret }),
      ENCRYPTION_ACTIVE_KEY_ID: 'key-2026-07',
    });

    const encrypted = encryption.encryptTwoFactorSecret(secret, 'user-1');

    expect(encrypted).toMatch(/^totp:v1:local:key-2026-07:/);
    expect(encrypted).not.toContain(secret);
    expect(encryption.decryptTwoFactorSecret(encrypted, 'user-1')).toBe(secret);
    expect(() =>
      encryption.decryptTwoFactorSecret(encrypted, 'user-2'),
    ).toThrow('TOTP secret cannot be decrypted');
  });

  it('rejects Base64 and legacy APP_KEY ciphertext instead of silently trusting it', () => {
    const appKey = 'legacy-app-key-at-least-32-characters-long';
    const encryption = service({
      APP_KEY: appKey,
      ENCRYPTION_KEYS: JSON.stringify({ active: activeSecret }),
      ENCRYPTION_ACTIVE_KEY_ID: 'active',
    });

    expect(() =>
      encryption.decryptTwoFactorSecret(
        Buffer.from(secret).toString('base64'),
        'user-1',
      ),
    ).toThrow('TOTP secret cannot be decrypted');
    expect(() =>
      encryption.decryptTwoFactorSecret(
        legacyAppKeyEnvelope(secret, appKey),
        'user-1',
      ),
    ).toThrow('TOTP secret cannot be decrypted');
  });

  it('fails authentication safely when an existing user still has a Base64 seed', () => {
    const authentication = service({
      ENCRYPTION_KEYS: JSON.stringify({ active: activeSecret }),
      ENCRYPTION_ACTIVE_KEY_ID: 'active',
    }) as unknown as Pick<AuthService, 'verifyTwoFactorToken'>;

    expect(
      authentication.verifyTwoFactorToken(
        {
          id: 'user-1',
          twoFactorEnabled: true,
          twoFactorSecret: Buffer.from(secret).toString('base64'),
        },
        '123456',
      ),
    ).toBe(false);
  });

  it('decrypts retained historical keys while new writes use the active key', () => {
    const oldWriter = service({
      ENCRYPTION_KEYS: JSON.stringify({ old: oldSecret }),
      ENCRYPTION_ACTIVE_KEY_ID: 'old',
    });
    const oldEnvelope = oldWriter.encryptTwoFactorSecret(secret, 'user-1');
    const rotated = service({
      ENCRYPTION_KEYS: JSON.stringify({
        old: oldSecret,
        active: activeSecret,
      }),
      ENCRYPTION_ACTIVE_KEY_ID: 'active',
    });

    expect(rotated.decryptTwoFactorSecret(oldEnvelope, 'user-1')).toBe(secret);
    expect(rotated.encryptTwoFactorSecret(secret, 'user-1')).toMatch(
      /^totp:v1:local:active:/,
    );
  });

  it('rejects tampering with a generic error that does not expose key material', () => {
    const encryption = service({
      ENCRYPTION_KEYS: JSON.stringify({ active: activeSecret }),
      ENCRYPTION_ACTIVE_KEY_ID: 'active',
    });
    const fields = encryption
      .encryptTwoFactorSecret(secret, 'user-1')
      .split(':');
    fields[6] = Buffer.from('tampered').toString('base64');

    let message = '';
    try {
      encryption.decryptTwoFactorSecret(fields.join(':'), 'user-1');
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toBe('TOTP secret cannot be decrypted');
    expect(message).not.toContain(secret);
    expect(message).not.toContain(activeSecret);
  });
});
