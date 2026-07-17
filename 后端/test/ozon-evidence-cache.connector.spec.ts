import { OzonEvidenceCacheConnector } from '../src/features/product-research/daily/connectors/ozon-evidence-cache.connector.js';

describe('OzonEvidenceCacheConnector', () => {
  const fetchedAt = '2026-07-13T08:00:00.000Z';

  const collect = async (report: Record<string, unknown>) => {
    const tenantDatabase = {
      run: jest.fn(async (_organizationId, callback) =>
        callback({
          productResearchReport: {
            findMany: jest.fn().mockResolvedValue([report]),
          },
        }),
      ),
    };
    const connector = new OzonEvidenceCacheConnector(tenantDatabase as never);
    return connector.collect({
      organizationId: 'org-1',
      workspaceId: null,
      businessDate: '2026-07-13',
      timezone: 'Asia/Shanghai',
      candidateLimit: 300,
      configSnapshot: {},
    });
  };

  it('rejects legacy Chinese-query evidence without translated query terms', async () => {
    const result = await collect({
      id: 'report-1',
      query: '汽车风扇',
      summary:
        '这是一份长度足够但语义错误的旧报告，不应再次进入每日精准选品候选。',
      createdAt: new Date(fetchedAt),
      opportunities: validOpportunities({
        strategy: 'repeated_listing_terms',
        matchTerms: ['вентилятор', 'портативный'],
      }),
    });

    expect(result.candidates).toHaveLength(0);
    expect(result.health).toMatchObject({
      status: 'NOT_CONFIGURED',
      itemCount: 0,
      errorCode: 'NO_VERIFIED_OZON_EVIDENCE',
    });
  });

  it('reuses translated Ozon evidence only when every item matches', async () => {
    const result = await collect({
      id: 'report-2',
      query: '汽车风扇',
      summary:
        '真实汽车风扇证据已通过价格、来源、时间和中文翻译相关性门禁，可供只读影子流程复用。',
      createdAt: new Date(fetchedAt),
      opportunities: validOpportunities({
        strategy: 'translated_query_terms',
        matchTerms: ['автомобильный', 'вентилятор'],
      }),
    });

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates).toEqual(
      result.candidates.map((candidate) =>
        expect.objectContaining({
          platformFeeRate: null,
          paymentFeeRate: null,
          adRate: null,
          refundRate: null,
        }),
      ),
    );
    expect(result.health).toMatchObject({
      status: 'DEGRADED',
      itemCount: 2,
    });
  });

  function validOpportunities(relevance: Record<string, unknown>) {
    const competitors = [
      'автомобильный вентилятор двойной',
      'автомобильный вентилятор USB',
    ];
    return {
      competitors,
      priceRange: { min: 900, max: 1200, currency: 'RUB' },
      sourceEvidence: {
        source: 'ozon_public_listings',
        provider: 'serper',
        fetchedAt,
        searchQuery: 'автомобильный вентилятор',
        relevance,
        competitors,
        items: [
          {
            title: competitors[0],
            url: 'https://www.ozon.ru/product/auto-fan-1',
            fetchedAt,
            priceRub: 900,
          },
          {
            title: competitors[1],
            url: 'https://www.ozon.ru/product/auto-fan-2',
            fetchedAt,
            priceRub: 1200,
          },
        ],
      },
    };
  }
});
