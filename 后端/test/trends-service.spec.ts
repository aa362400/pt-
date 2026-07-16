import { TrendsService } from '../src/features/trends/trends.service.js';

function tenantDatabase<T>(transaction: T) {
  return {
    run: jest
      .fn()
      .mockImplementation(
        (_organizationId: string, operation: (tx: T) => unknown) =>
          operation(transaction),
      ),
  };
}

const user = {
  sub: 'user-1',
  email: 'qa@example.com',
  orgId: 'org-1',
  role: 'OWNER',
};

function createPrisma() {
  const trendInsight = {
    create: jest.fn(),
    findMany: jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'trend-1',
          organizationId: 'org-1',
          workspaceId: null,
          market: 'amazon_us',
          category: '欧美市场',
          keyword: 'Amazon Europe home wellness trend report 2026',
          score: 22,
          growthRate: 22,
          source: 'web_search_fallback',
          data: {
            seasonality: 'Q4 demand signal from search evidence',
            dataPoints: [{ date: '2026-07', value: 22 }],
            evidence: [
              {
                title: 'Trend report',
                url: 'https://example.com/trend-report',
              },
            ],
          },
          observedAt: new Date('2026-07-09T08:00:00.000Z'),
        },
      ]),
    count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1),
    findFirst: jest.fn(),
    delete: jest.fn(),
  };

  return {
    trendInsight,
    $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops)),
  };
}

describe('TrendsService real agent integration', () => {
  it.skip('legacy unverified web-search trend persistence is replaced by the Ozon evidence gate', async () => {
    const prisma = createPrisma();
    const audit = { log: jest.fn() };
    const agentProvider = {
      runTrendAnalysis: jest.fn().mockResolvedValue({
        webSignals: {
          provider: 'serper',
          results: [
            { title: 'Trend report', url: 'https://example.com/trend-report' },
          ],
        },
        trends: [
          {
            name: 'Amazon Europe home wellness trend report 2026',
            growth: 22,
            seasonality: 'Q4 demand signal from search evidence',
            volume: 'search evidence rank #1',
            source: 'web_search_fallback',
            dataPointMethod: 'estimated_from_web_search_rank_and_growth',
            dataPoints: [{ date: '2026-07', value: 22 }],
            evidence: [
              {
                title: 'Trend report',
                url: 'https://example.com/trend-report',
              },
            ],
          },
        ],
      }),
    };
    const service = new TrendsService(
      prisma as never,
      audit as never,
      agentProvider as never,
      tenantDatabase(prisma) as never,
    );

    await service.analyze(user, {
      category: '欧美市场',
      marketplace: 'amazon_us',
      timeframe: '90d',
    });

    expect(prisma.trendInsight.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        market: 'amazon_us',
        category: '欧美市场',
        keyword: 'Amazon Europe home wellness trend report 2026',
        source: 'web_search_fallback',
        data: expect.objectContaining({
          seasonality: 'Q4 demand signal from search evidence',
          volume: 'search evidence rank #1',
          dataPointMethod: 'estimated_from_web_search_rank_and_growth',
          dataPoints: [{ date: '2026-07', value: 22 }],
          evidence: [
            { title: 'Trend report', url: 'https://example.com/trend-report' },
          ],
          webSignals: expect.objectContaining({ provider: 'serper' }),
        }),
      }),
    });
  });

  it.skip('legacy Amazon auto-analysis is replaced by the Ozon evidence gate', async () => {
    const prisma = createPrisma();
    const audit = { log: jest.fn() };
    const agentProvider = {
      runTrendAnalysis: jest.fn().mockResolvedValue({
        trends: [
          {
            name: 'Amazon Europe home wellness trend report 2026',
            growth: 22,
            seasonality: 'Q4 demand signal from search evidence',
            source: 'web_search_fallback',
            dataPoints: [{ date: '2026-07', value: 22 }],
            evidence: [
              {
                title: 'Trend report',
                url: 'https://example.com/trend-report',
              },
            ],
          },
        ],
      }),
    };
    const service = new TrendsService(
      prisma as never,
      audit as never,
      agentProvider as never,
      tenantDatabase(prisma) as never,
    );

    const result = await service.findAll(user, {
      category: '欧美市场',
      marketplace: 'amazon_us',
      limit: 20,
      page: 1,
    });

    expect(agentProvider.runTrendAnalysis).toHaveBeenCalledWith(
      {
        category: '欧美市场',
        marketplace: 'amazon_us',
        timeframe: undefined,
      },
      expect.objectContaining({ orgId: 'org-1', userId: 'user-1' }),
    );
    expect(result.total).toBe(1);
    expect(result.items[0].data.dataPoints).toEqual([
      { date: '2026-07', value: 22 },
    ]);
  });
});
