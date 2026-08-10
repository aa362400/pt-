import { TenantDatabaseContextService } from '../src/shared/database/tenant-database-context.service.js';

function createService(reportedOrganizationId = 'org-1') {
  const transaction = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    $queryRawUnsafe: jest
      .fn()
      .mockResolvedValue([{ organization_id: reportedOrganizationId }]),
  };
  const prisma = {
    $transaction: jest.fn(
      async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    ),
  };
  return {
    service: new TenantDatabaseContextService(prisma as never),
    prisma,
    transaction,
  };
}

describe('TenantDatabaseContextService', () => {
  it('sets and verifies a transaction-local organization context', async () => {
    const { service, prisma, transaction } = createService();
    const operation = jest.fn().mockResolvedValue('result');

    await expect(service.run('org-1', operation)).resolves.toBe('result');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.$executeRawUnsafe).toHaveBeenCalledWith(
      "SELECT set_config('app.current_organization_id', $1, true)",
      'org-1',
    );
    expect(transaction.$queryRawUnsafe).toHaveBeenCalledWith(
      "SELECT current_setting('app.current_organization_id', true) AS organization_id",
    );
    expect(operation).toHaveBeenCalledWith(transaction);
  });

  it('preserves requested transaction isolation options', async () => {
    const { service, prisma } = createService();

    await service.run('org-1', jest.fn(), {
      isolationLevel: 'Serializable' as any,
      timeout: 45_000,
    });

    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: 'Serializable',
        timeout: 45_000,
      }),
    );
  });

  it('fails closed when PostgreSQL does not retain the expected context', async () => {
    const { service } = createService('org-other');

    await expect(service.run('org-1', jest.fn())).rejects.toThrow(
      'Tenant database context verification failed',
    );
  });

  it('rejects invalid organization identifiers before opening a transaction', async () => {
    const { service, prisma } = createService();

    await expect(service.run('bad organization id', jest.fn())).rejects.toThrow(
      'Organization id is invalid',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
