import { KeywordsService } from '../src/features/keywords/keywords.service.js';

describe('KeywordsService tenant database context', () => {
  it('persists and lists reports inside the authenticated tenant context', async () => {
    const transaction = {
      keywordReport: {
        create: jest.fn().mockResolvedValue({
          id: 'keyword-1',
          query: 'car fan',
          totalKeywords: 1,
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
    const service = new KeywordsService(
      {} as never,
      { log: jest.fn() } as never,
      {
        runKeywordAnalysis: jest.fn().mockResolvedValue({
          keywords: [{ keyword: 'car fan' }],
        }),
      } as never,
      tenantDatabase as never,
    );
    const user = { sub: 'user-1', email: 'user@example.com', orgId: 'org-1' };

    await service.create(user, {
      seedKeywords: ['car fan'],
      marketplace: 'ozon',
    });
    await service.findAll(user, {});

    expect(tenantDatabase.run).toHaveBeenCalledTimes(2);
    expect(transaction.keywordReport.create).toHaveBeenCalled();
    expect(transaction.keywordReport.findMany).toHaveBeenCalled();
  });
});
