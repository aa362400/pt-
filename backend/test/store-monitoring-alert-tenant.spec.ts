import { StoreMonitoringService } from '../src/features/store-monitoring/store-monitoring.service.js';

describe('StoreMonitoringService alert tenant context', () => {
  it('creates and lists alerts inside tenant transactions', async () => {
    const transaction = {
      alert: {
        create: jest.fn().mockResolvedValue({
          id: 'alert-1',
          title: 'Low stock',
          severity: 'WARNING',
        }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const tenantDatabase = {
      run: jest
        .fn()
        .mockImplementation(
          (
            _organizationId: string,
            operation: (tx: typeof transaction) => unknown,
          ) => operation(transaction),
        ),
    };
    const service = new StoreMonitoringService(
      {} as never,
      { emit: jest.fn() } as never,
      tenantDatabase as never,
    );
    const user = { sub: 'user-1', email: 'user@example.com', orgId: 'org-1' };

    await service.createAlert(user, {
      type: 'GENERAL',
      title: 'Low stock',
    });
    await service.listAlerts(user, {});

    expect(tenantDatabase.run).toHaveBeenCalledTimes(2);
    expect(transaction.alert.create).toHaveBeenCalled();
    expect(transaction.alert.findMany).toHaveBeenCalled();
  });
});
