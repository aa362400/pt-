import { ConfigService } from '@nestjs/config';
import { DecryptCommand, GenerateDataKeyCommand } from '@aws-sdk/client-kms';
import { CredentialKmsService } from '../src/features/channels/credential-kms.service.js';

function config(values: Record<string, string>) {
  return {
    get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
  } as unknown as ConfigService;
}

describe('CredentialKmsService', () => {
  it('requests a KMS-bound AES-256 data key', async () => {
    const service = new CredentialKmsService(
      config({ KMS_KEY_ID: 'alias/shopmate-credentials' }),
    );
    const send = jest.fn().mockResolvedValue({
      Plaintext: Uint8Array.from(Buffer.alloc(32, 3)),
      CiphertextBlob: Uint8Array.from(Buffer.from('encrypted-key')),
    });
    (service as unknown as { client: { send: typeof send } }).client = { send };

    const result = await service.generateDataKey();

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0] as GenerateDataKeyCommand;
    expect(command.input).toEqual({
      KeyId: 'alias/shopmate-credentials',
      KeySpec: 'AES_256',
      EncryptionContext: {
        application: 'shopmate',
        purpose: 'ozon-credentials-v3',
      },
    });
    expect(result.plaintextKey).toHaveLength(32);
    expect(result.encryptedDataKey.toString()).toBe('encrypted-key');
  });

  it('decrypts by ciphertext identity with the exact encryption context', async () => {
    const service = new CredentialKmsService(
      config({ KMS_KEY_ID: 'alias/shopmate-credentials' }),
    );
    const send = jest.fn().mockResolvedValue({
      Plaintext: Uint8Array.from(Buffer.alloc(32, 5)),
    });
    (service as unknown as { client: { send: typeof send } }).client = { send };

    const result = await service.decryptDataKey(Buffer.from('encrypted-key'));

    const command = send.mock.calls[0][0] as DecryptCommand;
    expect(command.input).toEqual({
      CiphertextBlob: Buffer.from('encrypted-key'),
      EncryptionContext: {
        application: 'shopmate',
        purpose: 'ozon-credentials-v3',
      },
    });
    expect(command.input.KeyId).toBeUndefined();
    expect(result).toHaveLength(32);
  });
});
