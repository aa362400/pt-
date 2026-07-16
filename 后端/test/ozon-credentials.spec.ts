import { ConfigService } from '@nestjs/config';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { CredentialKmsService } from '../src/features/channels/credential-kms.service.js';
import { OzonCredentialsService } from '../src/features/channels/ozon-credentials.service.js';

function config(values: Record<string, string | undefined>) {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

function kms(overrides: Partial<CredentialKmsService> = {}) {
  return {
    isConfigured: jest.fn().mockReturnValue(true),
    activeKeyId: jest.fn().mockReturnValue('alias/shopmate-credentials'),
    generateDataKey: jest.fn().mockResolvedValue({
      plaintextKey: Buffer.alloc(32, 7),
      encryptedDataKey: Buffer.from('kms-encrypted-data-key'),
      keyId: 'alias/shopmate-credentials',
    }),
    decryptDataKey: jest.fn().mockResolvedValue(Buffer.alloc(32, 7)),
    ...overrides,
  } as unknown as CredentialKmsService;
}

function encodeLegacyV1(
  credentials: { clientId: string; apiKey: string },
  secret: string,
) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    'aes-256-gcm',
    createHash('sha256').update(secret).digest(),
    iv,
  );
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(credentials), 'utf8'),
    cipher.final(),
  ]);
  return [
    'v1',
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

describe('OzonCredentialsService key rotation', () => {
  const credentials = { clientId: '12345', apiKey: 'secret-api-key' };
  const activeSecret = 'active-encryption-secret-at-least-32-characters';
  const oldSecret = 'old-encryption-secret-at-least-32-characters';

  it('writes versioned v2 envelopes with the active local key id', async () => {
    const service = new OzonCredentialsService(
      config({
        CREDENTIAL_ENCRYPTION_PROVIDER: 'local',
        ENCRYPTION_ACTIVE_KEY_ID: 'key-2026-07',
        ENCRYPTION_KEYS: JSON.stringify({ 'key-2026-07': activeSecret }),
      }),
      kms(),
    );

    const encoded = await service.encode(credentials);

    expect(encoded).toMatch(/^v2:key-2026-07:/);
    expect(encoded).not.toContain(credentials.apiKey);
    expect(await service.decode(encoded)).toEqual(credentials);
    expect(service.inspect(encoded)).toEqual({
      version: 'v2',
      provider: 'local',
      keyId: 'key-2026-07',
      activeKeyId: 'key-2026-07',
      needsRotation: false,
    });
  });

  it('uses a unique KMS data key and writes a v3 envelope', async () => {
    const kmsService = kms();
    const service = new OzonCredentialsService(
      config({ CREDENTIAL_ENCRYPTION_PROVIDER: 'aws-kms' }),
      kmsService,
    );

    const encoded = await service.encode(credentials);

    expect(encoded).toMatch(/^v3:aws-kms:/);
    expect(encoded).not.toContain(credentials.apiKey);
    expect(kmsService.generateDataKey).toHaveBeenCalledTimes(1);
    expect(await service.decode(encoded)).toEqual(credentials);
    expect(kmsService.decryptDataKey).toHaveBeenCalledTimes(1);
    expect(service.inspect(encoded)).toEqual({
      version: 'v3',
      provider: 'aws-kms',
      keyId: 'alias/shopmate-credentials',
      activeKeyId: 'alias/shopmate-credentials',
      needsRotation: false,
    });
  });

  it('rejects a tampered v3 ciphertext', async () => {
    const service = new OzonCredentialsService(
      config({ CREDENTIAL_ENCRYPTION_PROVIDER: 'aws-kms' }),
      kms(),
    );
    const encoded = await service.encode(credentials);
    const fields = encoded.split(':');
    fields[6] = Buffer.from('tampered').toString('base64');

    await expect(service.decode(fields.join(':'))).rejects.toThrow(
      'Ozon credentials cannot be decrypted',
    );
  });

  it('decrypts an old local envelope and rotates it to KMS v3', async () => {
    const oldService = new OzonCredentialsService(
      config({
        CREDENTIAL_ENCRYPTION_PROVIDER: 'local',
        ENCRYPTION_ACTIVE_KEY_ID: 'key-old',
        ENCRYPTION_KEYS: JSON.stringify({ 'key-old': oldSecret }),
      }),
      kms(),
    );
    const oldEnvelope = await oldService.encode(credentials);
    const service = new OzonCredentialsService(
      config({
        CREDENTIAL_ENCRYPTION_PROVIDER: 'aws-kms',
        ENCRYPTION_ACTIVE_KEY_ID: 'key-old',
        ENCRYPTION_KEYS: JSON.stringify({ 'key-old': oldSecret }),
      }),
      kms(),
    );

    const rotated = await service.rotate(oldEnvelope);

    expect(rotated.changed).toBe(true);
    expect(rotated.fromKeyId).toBe('key-old');
    expect(rotated.toKeyId).toBe('alias/shopmate-credentials');
    expect(rotated.encoded).toMatch(/^v3:aws-kms:/);
    expect(await service.decode(rotated.encoded)).toEqual(credentials);
  });

  it('keeps legacy v1 credentials readable and marks them for rotation', async () => {
    const service = new OzonCredentialsService(
      config({
        CREDENTIAL_ENCRYPTION_PROVIDER: 'local',
        ENCRYPTION_KEY: activeSecret,
      }),
      kms(),
    );
    const encoded = encodeLegacyV1(credentials, activeSecret);

    expect(encoded).toMatch(/^v1:/);
    expect(await service.decode(encoded)).toEqual(credentials);
    expect(service.inspect(encoded)).toEqual({
      version: 'v1',
      provider: 'legacy-local',
      keyId: null,
      activeKeyId: 'legacy',
      needsRotation: true,
    });
    expect((await service.rotate(encoded)).encoded).toMatch(/^v2:legacy:/);
  });

  it('refuses to persist new credentials without a configured provider', async () => {
    const service = new OzonCredentialsService(
      config({ CREDENTIAL_ENCRYPTION_PROVIDER: 'local' }),
      kms(),
    );

    await expect(service.encode(credentials)).rejects.toThrow(
      'Credential encryption key is not configured',
    );
  });

  it('refuses KMS writes when KMS is not configured', async () => {
    const service = new OzonCredentialsService(
      config({ CREDENTIAL_ENCRYPTION_PROVIDER: 'aws-kms' }),
      kms({ isConfigured: jest.fn().mockReturnValue(false) }),
    );

    await expect(service.encode(credentials)).rejects.toThrow(
      'AWS KMS credential encryption is not configured',
    );
  });
});
