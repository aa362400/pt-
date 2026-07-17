import { DailyProductResearchService } from '../src/features/product-research/daily/daily-product-research.service.js';

describe('DailyProductResearchService.listRuns', () => {
  it('keeps runs inside the current organization and orders same-day runs by newest createdAt first', async () => {
    const businessDate = new Date('2026-07-17T00:00:00.000Z');
    const records = [
      {
        id: 'org-1-old',
        organizationId: 'org-1',
        businessDate,
        createdAt: new Date('2026-07-17T08:00:00.000Z'),
      },
      {
        id: 'org-2-newest',
        organizationId: 'org-2',
        businessDate,
        createdAt: new Date('2026-07-17T10:00:00.000Z'),
      },
      {
        id: 'org-1-new',
        organizationId: 'org-1',
        businessDate,
        createdAt: new Date('2026-07-17T09:22:00.000Z'),
      },
    ];
    const productResearchRun = {
      findMany: jest.fn(
        async ({
          where,
          skip,
          take,
        }: {
          where: { organizationId: string };
          skip: number;
          take: number;
        }) =>
          records
            .filter((record) => record.organizationId === where.organizationId)
            .sort(
              (left, right) =>
                right.businessDate.getTime() - left.businessDate.getTime() ||
                right.createdAt.getTime() - left.createdAt.getTime(),
            )
            .slice(skip, skip + take),
      ),
      count: jest.fn(
        async ({ where }: { where: { organizationId: string } }) =>
          records.filter(
            (record) => record.organizationId === where.organizationId,
          ).length,
      ),
    };
    const tenantDatabase = {
      run: jest.fn(
        async (
          organizationId: string,
          operation: (client: {
            productResearchRun: typeof productResearchRun;
          }) => unknown,
        ) => {
          expect(organizationId).toBe('org-1');
          return operation({ productResearchRun });
        },
      ),
    };
    const service = new DailyProductResearchService(
      {} as never,
      tenantDatabase as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        policyFor: jest.fn(() => ({ visibleToMembers: true })),
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.listRuns(
      { sub: 'user-1', orgId: 'org-1', role: 'OWNER' } as never,
      { page: 1, limit: 50 },
    );

    expect(result.items.map((run) => run.id)).toEqual([
      'org-1-new',
      'org-1-old',
    ]);
    expect(result.total).toBe(2);
    expect(productResearchRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-1' },
        orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }],
      }),
    );
    expect(productResearchRun.count).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
    });
  });
});
