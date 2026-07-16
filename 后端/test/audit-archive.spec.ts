import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuditArchiveService } from '../src/shared/audit/audit-archive.service.js';
import { S3AuditArchiveStore } from '../src/shared/audit/s3-audit-archive.store.js';

function asyncBody(value: Buffer) {
  return {
    async *[Symbol.asyncIterator]() {
      yield value;
    },
  };
}

describe('S3AuditArchiveStore', () => {
  const body = Buffer.from('{"manifest":"immutable"}', 'utf8');
  const checksumHex = createHash('sha256').update(body).digest('hex');
  const checksumBase64 = createHash('sha256').update(body).digest('base64');
  const retainUntil = new Date('2033-01-01T00:00:00.000Z');

  function createStore(overrides: Record<string, unknown> = {}) {
    const values: Record<string, unknown> = {
      AUDIT_ARCHIVE_S3_BUCKET: 'audit-worm',
      AUDIT_ARCHIVE_S3_REGION: 'us-east-1',
      AUDIT_ARCHIVE_OBJECT_LOCK_MODE: 'COMPLIANCE',
      AUDIT_ARCHIVE_RETENTION_DAYS: 2555,
      ...overrides,
    };
    const config = {
      get: jest.fn(
        (key: string, fallback?: unknown) => values[key] ?? fallback,
      ),
    };
    const store = new S3AuditArchiveStore(config as never);
    const send = jest.fn(async (command: object) => {
      const name = command.constructor.name;
      if (name === 'GetObjectLockConfigurationCommand') {
        return { ObjectLockConfiguration: { ObjectLockEnabled: 'Enabled' } };
      }
      if (name === 'PutObjectCommand') {
        return { VersionId: 'version-1' };
      }
      if (name === 'GetObjectCommand') {
        return {
          Body: asyncBody(body),
          VersionId: 'version-1',
          ChecksumSHA256: checksumBase64,
          ObjectLockMode: 'COMPLIANCE',
          ObjectLockRetainUntilDate: retainUntil,
        };
      }
      throw new Error(`Unexpected command ${name}`);
    });
    (store as unknown as { client: { send: typeof send } }).client = { send };
    return { store, send };
  }

  it('uploads with object lock and verifies the immutable object by readback', async () => {
    const { store, send } = createStore();

    const result = await store.putAndVerify({
      key: 'audit/org-1/2026-01-01/1-2.json',
      body,
      checksumHex,
      retainUntil,
    });

    expect(result).toEqual(
      expect.objectContaining({
        versionId: 'version-1',
        checksumHex,
        objectLockMode: 'COMPLIANCE',
      }),
    );
    const putCommand = send.mock.calls
      .map(
        ([command]) =>
          command as {
            constructor: { name: string };
            input?: Record<string, unknown>;
          },
      )
      .find((command) => command.constructor.name === 'PutObjectCommand');
    expect(putCommand?.input).toEqual(
      expect.objectContaining({
        Bucket: 'audit-worm',
        IfNoneMatch: '*',
        ChecksumAlgorithm: 'SHA256',
        ChecksumSHA256: checksumBase64,
        ObjectLockMode: 'COMPLIANCE',
        ObjectLockRetainUntilDate: retainUntil,
      }),
    );
  });

  it('fails before upload when the bucket has no Object Lock', async () => {
    const { store, send } = createStore();
    send.mockResolvedValueOnce({
      ObjectLockConfiguration: { ObjectLockEnabled: 'Disabled' },
    });

    await expect(
      store.putAndVerify({
        key: 'audit/test.json',
        body,
        checksumHex,
        retainUntil,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(
      send.mock.calls.some(
        ([command]) => command.constructor.name === 'PutObjectCommand',
      ),
    ).toBe(false);
  });

  it('fails when readback content does not match the submitted checksum', async () => {
    const { store, send } = createStore();
    send.mockImplementation(async (command: object) => {
      const name = command.constructor.name;
      if (name === 'GetObjectLockConfigurationCommand') {
        return { ObjectLockConfiguration: { ObjectLockEnabled: 'Enabled' } };
      }
      if (name === 'PutObjectCommand') return { VersionId: 'version-1' };
      return {
        Body: asyncBody(Buffer.from('tampered')),
        VersionId: 'version-1',
        ChecksumSHA256: checksumBase64,
        ObjectLockMode: 'COMPLIANCE',
        ObjectLockRetainUntilDate: retainUntil,
      };
    });

    await expect(
      store.putAndVerify({
        key: 'audit/test.json',
        body,
        checksumHex,
        retainUntil,
      }),
    ).rejects.toThrow('checksum mismatch');
  });

  it('recovers an already-created immutable object after a lost database receipt', async () => {
    const { store, send } = createStore();
    send.mockImplementation(async (command: object) => {
      const name = command.constructor.name;
      if (name === 'GetObjectLockConfigurationCommand') {
        return { ObjectLockConfiguration: { ObjectLockEnabled: 'Enabled' } };
      }
      if (name === 'PutObjectCommand') {
        const error = new Error('precondition failed') as Error & {
          $metadata: { httpStatusCode: number };
        };
        error.$metadata = { httpStatusCode: 412 };
        throw error;
      }
      return {
        Body: asyncBody(body),
        VersionId: 'version-existing',
        ChecksumSHA256: checksumBase64,
        ObjectLockMode: 'COMPLIANCE',
        ObjectLockRetainUntilDate: retainUntil,
      };
    });

    await expect(
      store.putAndVerify({
        key: 'audit/existing.json',
        body,
        checksumHex,
        retainUntil,
      }),
    ).resolves.toEqual(
      expect.objectContaining({ versionId: 'version-existing', checksumHex }),
    );
  });
});

describe('AuditArchiveService', () => {
  const logs = [
    {
      id: 'audit-1',
      organizationId: 'org-1',
      actorId: 'user-1',
      action: 'product.read',
      resourceType: 'Product',
      resourceId: 'product-1',
      before: null,
      after: { ok: true },
      ip: null,
      userAgent: null,
      sequence: 1n,
      previousHash: '0'.repeat(64),
      entryHash: 'a'.repeat(64),
      hashAlgorithm: 'SHA-256',
      createdAt: new Date('2026-01-01T01:00:00.000Z'),
    },
  ];

  function createService(
    options: { integrityValid?: boolean; logs?: typeof logs } = {},
  ) {
    const prisma = {
      auditArchive: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest
          .fn()
          .mockImplementation(({ create }) =>
            Promise.resolve({ id: 'archive-1', ...create }),
          ),
      },
      auditLog: {
        findMany: jest.fn().mockResolvedValue(options.logs ?? logs),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const audit = {
      verifyIntegrity: jest.fn().mockResolvedValue({
        valid: options.integrityValid ?? true,
        breaks: [],
      }),
      appendStrict: jest.fn().mockResolvedValue({ id: 'archive-audit-1' }),
    };
    const store = {
      putAndVerify: jest
        .fn()
        .mockImplementation(({ key, checksumHex, retainUntil }) =>
          Promise.resolve({
            key,
            versionId: 'version-1',
            checksumHex,
            objectLockMode: 'COMPLIANCE',
            retainUntil,
            verifiedAt: new Date('2026-07-13T00:00:00.000Z'),
          }),
        ),
    };
    const config = {
      get: jest.fn((_key: string, fallback?: unknown) => fallback),
    };
    return {
      service: new AuditArchiveService(
        prisma as never,
        audit as never,
        store as never,
        config as never,
        {
          run: jest.fn(
            (_organizationId: string, operation: (tx: unknown) => unknown) =>
              operation(prisma),
          ),
        } as never,
      ),
      prisma,
      audit,
      store,
    };
  }

  it('archives a closed UTC day only after chain verification', async () => {
    const { service, prisma, audit, store } = createService();

    const result = await service.archiveDay(
      {
        sub: 'user-1',
        email: 'owner@example.com',
        orgId: 'org-1',
        role: 'OWNER',
      },
      '2026-01-01',
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: 'archive-1',
        organizationId: 'org-1',
        entryCount: 1,
        objectLockMode: 'COMPLIANCE',
      }),
    );
    expect(audit.verifyIntegrity).toHaveBeenCalledWith('org-1');
    expect(store.putAndVerify).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(
          /^audit\/org-1\/2026-01-01\/1-1-[a-f0-9]{64}\.json$/,
        ),
        checksumHex: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(prisma.auditArchive.upsert).toHaveBeenCalled();
    expect(audit.appendStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'audit.archive.created',
        resourceId: 'archive-1',
      }),
    );
  });

  it('fails closed when the source audit chain is invalid', async () => {
    const { service, store } = createService({ integrityValid: false });

    await expect(
      service.archiveDay(
        {
          sub: 'user-1',
          email: 'owner@example.com',
          orgId: 'org-1',
          role: 'OWNER',
        },
        '2026-01-01',
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(store.putAndVerify).not.toHaveBeenCalled();
  });

  it('rejects the current UTC day because it is not closed yet', async () => {
    const { service } = createService();
    const today = new Date().toISOString().slice(0, 10);

    await expect(
      service.archiveDay(
        {
          sub: 'user-1',
          email: 'owner@example.com',
          orgId: 'org-1',
          role: 'OWNER',
        },
        today,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
