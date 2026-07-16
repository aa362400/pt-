import { DashboardService } from '../src/features/dashboard/dashboard.service.js';

const user = {
  sub: 'user-1',
  email: 'qa@example.com',
  orgId: 'org-1',
  role: 'OWNER',
};

function createPrisma(overrides?: Record<string, unknown>) {
  return {
    product: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'product-1',
          title: 'Ozon kettle',
          sku: 'OZ-1',
          asinOrExternalId: 'ozon-101',
          price: 1290,
          currency: 'RUB',
          status: 'ACTIVE',
          metadata: {
            source: 'ozon',
            externalStoreMutation: 'not_executed',
            ozonStatus: 'visible',
          },
          createdAt: new Date('2026-07-09T08:00:00.000Z'),
        },
      ]),
    },
    listingDraft: { count: jest.fn().mockResolvedValue(0) },
    agentRun: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn() },
    teamTask: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'task-1',
          title: '复核商品标题变更',
          description: '需要人工确认后再同步外部店铺',
          priority: 'HIGH',
          status: 'REVIEW',
          createdAt: new Date('2026-07-09T07:00:00.000Z'),
        },
      ]),
    },
    notification: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'notification-1',
          type: 'APPROVAL_REQUIRED',
          title: '智能体建议复核商品',
          body: '商品已本地编辑，外部店铺未执行。',
          readAt: null,
          metadata: {
            kind: 'agent_suggestion',
            source: 'agent_suggestion',
            priority: 'high',
          },
          createdAt: new Date('2026-07-09T09:00:00.000Z'),
        },
      ]),
    },
    alert: { count: jest.fn().mockResolvedValue(0) },
    auditLog: { findMany: jest.fn() },
    trendInsight: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'trend-1',
          keyword: 'travel mug',
          platform: 'ozon',
          score: 82,
          observedAt: new Date('2026-07-09T06:00:00.000Z'),
        },
      ]),
      groupBy: jest.fn().mockResolvedValue([
        {
          keyword: 'travel mug',
          _max: { score: 82 },
          _count: 2,
        },
      ]),
    },
    productResearchReport: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'report-1',
          workspaceId: 'workspace-1',
          query: 'tea set',
          platform: 'ozon',
          summary: '真实选品报告',
          opportunities: {
            competitors: ['茶具套装'],
            priceRange: { min: 1200, max: 2400 },
            rating: 4.6,
          },
          createdAt: new Date('2026-07-09T05:00:00.000Z'),
        },
      ]),
    },
    keywordReport: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'keyword-report-1',
          query: 'travel mug',
          keywords: [
            {
              keyword: 'insulated travel mug',
              volume: 1400,
              difficulty: 31,
              metricStatus: 'EVIDENCE_BACKED',
              metricEvidence: {
                provider: 'documented-keyword-provider',
                sourceUrl: 'https://provider.example.test/reports/travel-mug',
                observedAt: '2026-07-09T04:00:00.000Z',
                method: 'provider monthly search report',
                sourceKind: 'KEYWORD_PROVIDER_API',
              },
            },
          ],
          createdAt: new Date('2026-07-09T04:00:00.000Z'),
        },
      ]),
    },
    profitCalculation: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'profit-1',
          productId: 'product-1',
          product: { title: 'Ozon kettle' },
          currency: 'RUB',
          salePrice: 1290,
          totalCost: 900,
          estimatedProfit: 390,
          profitMargin: 30.23,
          roi: 43.33,
          createdAt: new Date('2026-07-09T03:00:00.000Z'),
        },
      ]),
      count: jest.fn().mockResolvedValue(1),
    },
    ...(overrides ?? {}),
  };
}

function createService(prisma: ReturnType<typeof createPrisma>) {
  const tenantDatabase = {
    run: jest
      .fn()
      .mockImplementation(
        (_organizationId: string, operation: (tx: typeof prisma) => unknown) =>
          operation(prisma),
      ),
  };
  return new DashboardService(prisma as never, tenantDatabase as never);
}

describe('DashboardService real integration summaries', () => {
  it('returns opportunities from real notifications, review tasks, and product research reports', async () => {
    const prisma = createPrisma();
    const service = createService(prisma);

    const result = await service.getOpportunities(user);

    expect(result.sampleState).toBe('real_samples');
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'notification-1',
          source: 'notification',
          title: '智能体建议复核商品',
          actionRequired: true,
        }),
        expect.objectContaining({
          id: 'task-1',
          source: 'team_task',
          title: '复核商品标题变更',
        }),
        expect.objectContaining({
          id: 'report-1:0',
          source: 'product_research',
          title: '茶具套装',
          score: 4.6,
        }),
      ]),
    );
  });

  it('returns hot product insight from the Product table and labels it as catalog sync, not sales ranking', async () => {
    const prisma = createPrisma();
    const service = createService(prisma);

    const result = await service.getHotProducts(user);

    expect(result.rankingBasis).toBe('catalog_sync');
    expect(result.sourceLabel).toContain('不是销量榜');
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 'product-1',
        title: 'Ozon kettle',
        source: 'ozon',
        externalStoreMutation: 'not_executed',
      }),
    );
  });

  it('returns profit summary only from saved ProfitCalculation rows', async () => {
    const prisma = createPrisma();
    const service = createService(prisma);

    const result = await service.getProfitSummary(user);

    expect(result.source).toBe('profit_calculations');
    expect(result.sampleState).toBe('real_samples');
    expect(result.calculationCount).toBe(1);
    expect(result.latest[0]).toEqual(
      expect.objectContaining({
        id: 'profit-1',
        productTitle: 'Ozon kettle',
        estimatedProfit: 390,
        profitMargin: 30.23,
      }),
    );
  });

  it('merges keyword reports into dashboard trend summaries without inventing keywords', async () => {
    const prisma = createPrisma();
    const service = createService(prisma);

    const result = await service.getTrendSummaries(user);

    expect(result.topKeywords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyword: 'travel mug',
          source: 'trend_insight',
          maxScore: 82,
        }),
        expect.objectContaining({
          keyword: 'insulated travel mug',
          source: 'keyword_report',
          searchVolume: 1400,
          difficulty: 31,
        }),
      ]),
    );
  });

  it('keeps historic keyword metrics null when their reports have no auditable evidence', async () => {
    const prisma = createPrisma({
      keywordReport: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'historic-keyword-report',
            keywords: [
              {
                keyword: 'historic model estimate',
                volume: 9999,
                difficulty: 1,
              },
            ],
            createdAt: new Date('2026-07-01T04:00:00.000Z'),
          },
        ]),
      },
    });
    const service = createService(prisma);

    const result = await service.getTrendSummaries(user);

    expect(result.topKeywords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyword: 'historic model estimate',
          searchVolume: null,
          difficulty: null,
        }),
      ]),
    );
  });

  it('returns a strict empty state when no profit calculations exist', async () => {
    const prisma = createPrisma({
      profitCalculation: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    });
    const service = createService(prisma);

    const result = await service.getProfitSummary(user);

    expect(result.sampleState).toBe('empty');
    expect(result.latest).toEqual([]);
    expect(result.emptyReason).toContain('ProfitCalculation');
  });
});
