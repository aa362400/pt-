import { TrendsService } from '../src/features/trends/trends.service.js';

const user = {
  sub: 'user-1',
  email: 'qa@example.com',
  orgId: 'org-1',
  role: 'OWNER',
};

function createService(result: unknown) {
  const prisma = {
    trendInsight: {
      create: jest.fn(({ data }) =>
        Promise.resolve({ id: 'trend-1', ...data }),
      ),
    },
    $transaction: jest.fn(async (operations: unknown[]) =>
      Promise.all(operations as Promise<unknown>[]),
    ),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const agentProvider = {
    runTrendAnalysis: jest.fn().mockResolvedValue(result),
  };
  return {
    service: new TrendsService(
      prisma as never,
      audit as never,
      agentProvider as never,
      {
        run: jest.fn(
          (
            _organizationId: string,
            operation: (tx: typeof prisma) => unknown,
          ) => operation(prisma),
        ),
      } as never,
    ),
    prisma,
    audit,
    agentProvider,
  };
}

const validOzonTrendResult = {
  source: 'ozon_public_search',
  sourceEvidence: {
    source: 'ozon_public_search',
    fetchedAt: '2026-07-10T08:00:00.000Z',
    items: [
      {
        title: 'Ozon kitchen storage',
        url: 'https://www.ozon.ru/category/kitchen-storage-14500/',
        fetchedAt: '2026-07-10T08:00:00.000Z',
      },
      {
        title: 'Ozon food containers',
        url: 'https://www.ozon.ru/category/food-containers-14600/',
        fetchedAt: '2026-07-10T08:00:00.000Z',
      },
    ],
  },
  trends: [
    {
      name: 'Storage assortment observation',
      growth: null,
      seasonality: 'Visible in the current Ozon category evidence.',
      source: 'ozon_public_search',
      evidence: [
        {
          title: 'Ozon kitchen storage',
          url: 'https://www.ozon.ru/category/kitchen-storage-14500/',
          fetchedAt: '2026-07-10T08:00:00.000Z',
        },
      ],
    },
    {
      name: 'Container assortment observation',
      growth: null,
      seasonality: 'Visible in the current Ozon category evidence.',
      source: 'ozon_public_search',
      evidence: [
        {
          title: 'Ozon food containers',
          url: 'https://www.ozon.ru/category/food-containers-14600/',
          fetchedAt: '2026-07-10T08:00:00.000Z',
        },
      ],
    },
  ],
};

describe('TrendsService evidence gate', () => {
  it('rejects non-Ozon trend requests before any agent call', async () => {
    const { service, agentProvider } = createService(validOzonTrendResult);

    await expect(
      service.analyze(user as never, {
        category: 'kitchen storage',
        marketplace: 'amazon_us',
      }),
    ).rejects.toThrow('Ozon');

    expect(agentProvider.runTrendAnalysis).not.toHaveBeenCalled();
  });

  it('does not persist an agent trend without a complete Ozon evidence chain', async () => {
    const { service, prisma } = createService({
      ...validOzonTrendResult,
      trends: [{ ...validOzonTrendResult.trends[0], growth: 22 }],
    });

    await expect(
      service.analyze(user as never, {
        category: 'kitchen storage',
        marketplace: 'ozon',
      }),
    ).rejects.toThrow('verifiable Ozon evidence');

    expect(prisma.trendInsight.create).not.toHaveBeenCalled();
  });

  it('persists only source-backed qualitative Ozon observations', async () => {
    const { service, prisma, audit } = createService(validOzonTrendResult);

    await service.analyze(user, {
      category: 'kitchen storage',
      marketplace: 'ozon',
    });

    expect(prisma.trendInsight.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        market: 'ozon',
        score: 0,
        growthRate: null,
        source: 'ozon_public_search',
        data: expect.objectContaining({
          sourceEvidence: validOzonTrendResult.sourceEvidence,
          evidence: expect.arrayContaining([
            expect.objectContaining({
              url: 'https://www.ozon.ru/category/kitchen-storage-14500/',
              fetchedAt: '2026-07-10T08:00:00.000Z',
            }),
          ]),
        }),
      }),
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'trend.analyze' }),
    );
  });
});
