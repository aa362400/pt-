import { AuditService } from '../src/shared/audit/audit.service.js';
import { Prisma } from '@prisma/client';

function chainedLogs(service: AuditService) {
  const genesis = '0'.repeat(64);
  const createdAt1 = new Date('2026-07-13T01:00:00.000Z');
  const first = {
    id: 'audit-1',
    organizationId: 'org-1',
    actorId: 'user-1',
    action: 'listing.draft.created',
    resourceType: 'ListingDraft',
    resourceId: 'draft-1',
    before: null,
    after: { title: 'Real title', price: 20 },
    ip: null,
    userAgent: null,
    sequence: 1n,
    previousHash: genesis,
    entryHash: '',
    hashAlgorithm: 'SHA-256',
    createdAt: createdAt1,
  };
  first.entryHash = (service as any).hash(
    (service as any).hashPayload(first, 1n, genesis, createdAt1),
    genesis,
  );

  const createdAt2 = new Date('2026-07-13T01:01:00.000Z');
  const second = {
    ...first,
    id: 'audit-2',
    action: 'listing.review.requested',
    resourceType: 'ReviewTask',
    resourceId: 'review-1',
    after: { required: true },
    sequence: 2n,
    previousHash: first.entryHash,
    entryHash: '',
    createdAt: createdAt2,
  };
  second.entryHash = (service as any).hash(
    (service as any).hashPayload(second, 2n, first.entryHash, createdAt2),
    first.entryHash,
  );
  return [first, second];
}

function createService() {
  const prisma = {
    auditChainHead: {
      findUnique: jest.fn(),
    },
    auditLog: {
      findMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  const tenantDatabase = {
    run: jest.fn((_organizationId, operation) => operation(prisma)),
  };
  const service = new AuditService(prisma as never, tenantDatabase as never);
  const logs = chainedLogs(service);
  prisma.auditChainHead.findUnique
    .mockResolvedValueOnce({ organizationId: 'org-1' })
    .mockResolvedValueOnce({
      organizationId: 'org-1',
      lastSequence: 2n,
      lastHash: logs[1].entryHash,
    });
  prisma.auditLog.findMany.mockResolvedValue(logs);
  return { service, prisma, logs };
}

describe('AuditService hash chain', () => {
  it('verifies an intact organization chain', async () => {
    const { service } = createService();

    const report = await service.verifyIntegrity('org-1');

    expect(report.valid).toBe(true);
    expect(report.chainedEntries).toBe(2);
    expect(report.breaks).toEqual([]);
  });

  it('detects a changed business field after the hash was written', async () => {
    const { service, logs } = createService();
    logs[1].action = 'listing.publish.executed';

    const report = await service.verifyIntegrity('org-1');

    expect(report.valid).toBe(false);
    expect(report.breaks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'audit-2',
          reason: 'entry hash mismatch',
        }),
      ]),
    );
  });

  it('uses canonical key ordering for nested JSON evidence', () => {
    const { service } = createService();

    const left = (service as any).canonicalJson({ b: 2, a: { y: 2, x: 1 } });
    const right = (service as any).canonicalJson({ a: { x: 1, y: 2 }, b: 2 });

    expect(left).toBe(right);
  });

  it('survives sustained serializable conflicts before appending an audit entry', async () => {
    const conflict = () =>
      new Prisma.PrismaClientKnownRequestError('serialization conflict', {
        code: 'P2034',
        clientVersion: '6.19.3',
      });
    const tenantDatabase = {
      run: jest
        .fn()
        .mockRejectedValueOnce(conflict())
        .mockRejectedValueOnce(conflict())
        .mockRejectedValueOnce(conflict())
        .mockRejectedValueOnce(conflict())
        .mockRejectedValueOnce(conflict())
        .mockResolvedValue('written'),
    };
    const service = new AuditService({} as never, tenantDatabase as never);

    await expect(
      (service as any).withSerializableRetry('org-1', async () => 'written'),
    ).resolves.toBe('written');
    expect(tenantDatabase.run).toHaveBeenCalledTimes(6);
  });
});
