import { HttpAgentProvider } from '../src/agents/http-agent.provider.js';
import { KeywordsService } from '../src/features/keywords/keywords.service.js';

const user = { sub: 'user-1', email: 'user@example.com', orgId: 'org-1' };

function createProvider() {
  return new HttpAgentProvider({
    get: jest.fn((key: string) => {
      if (key === 'AGENT_BASE_URL') return 'http://agent:8080';
      if (key === 'AGENT_API_KEY') return 'test-key';
      return undefined;
    }),
  } as never);
}

describe('keyword metric evidence policy', () => {
  it('discards model metrics without auditable evidence instead of coercing them to zero', async () => {
    const provider = createProvider();
    jest.spyOn(provider as never, 'runRemoteTask' as never).mockResolvedValue({
      keywords: [
        { keyword: 'model estimate', volume: 1200, difficulty: 37 },
        { keyword: 'missing metrics' },
      ],
    } as never);

    const result = await provider.runKeywordAnalysis({
      seedKeywords: ['portable fan'],
      marketplace: 'ozon',
    });

    expect(result.dataStatus).toBe('DATA_INSUFFICIENT');
    expect(result.keywords).toEqual([
      {
        keyword: 'model estimate',
        volume: null,
        difficulty: null,
        metricStatus: 'DATA_INSUFFICIENT',
        metricEvidence: null,
      },
      {
        keyword: 'missing metrics',
        volume: null,
        difficulty: null,
        metricStatus: 'DATA_INSUFFICIENT',
        metricEvidence: null,
      },
    ]);
  });

  it('keeps numeric metrics only when provider, source, time, method and source kind are auditable', async () => {
    const provider = createProvider();
    jest.spyOn(provider as never, 'runRemoteTask' as never).mockResolvedValue({
      keywords: [
        {
          keyword: 'api observed term',
          volume: 4321,
          difficulty: 46,
          metricEvidence: {
            provider: 'documented-keyword-provider',
            sourceUrl: 'https://provider.example.test/reports/keyword-42',
            observedAt: '2026-07-16T04:00:00.000Z',
            method: 'provider monthly search report',
            sourceKind: 'KEYWORD_PROVIDER_API',
          },
        },
        {
          keyword: 'referenced first-party term',
          volume: 55,
          difficulty: null,
          metricEvidence: {
            provider: 'shop-analytics',
            sourceReference: 'analytics-export-sha256:abc123',
            observedAt: '2026-07-16T04:00:00.000Z',
            method: 'first-party query export',
            sourceKind: 'FIRST_PARTY_ANALYTICS',
          },
        },
        {
          keyword: 'invalid timestamp',
          volume: 999,
          difficulty: 20,
          metricEvidence: {
            provider: 'documented-keyword-provider',
            sourceUrl: 'https://provider.example.test/reports/keyword-99',
            observedAt: 'not-a-date',
            method: 'provider monthly search report',
            sourceKind: 'KEYWORD_PROVIDER_API',
          },
        },
        {
          keyword: 'numeric strings are not metrics',
          volume: '0',
          difficulty: '12',
          metricEvidence: {
            provider: 'documented-keyword-provider',
            sourceUrl: 'https://provider.example.test/reports/keyword-100',
            observedAt: '2026-07-16T04:00:00.000Z',
            method: 'provider monthly search report',
            sourceKind: 'KEYWORD_PROVIDER_API',
          },
        },
      ],
    } as never);

    const result = await provider.runKeywordAnalysis({
      seedKeywords: ['portable fan'],
      marketplace: 'ozon',
    });

    expect(result.dataStatus).toBe('EVIDENCE_BACKED');
    expect(result.keywords[0]).toEqual(
      expect.objectContaining({
        volume: 4321,
        difficulty: 46,
        metricStatus: 'EVIDENCE_BACKED',
      }),
    );
    expect(result.keywords[1]).toEqual(
      expect.objectContaining({
        volume: 55,
        difficulty: null,
        metricStatus: 'EVIDENCE_BACKED',
      }),
    );
    expect(result.keywords[2]).toEqual(
      expect.objectContaining({
        volume: null,
        difficulty: null,
        metricStatus: 'DATA_INSUFFICIENT',
        metricEvidence: null,
      }),
    );
    expect(result.keywords[3]).toEqual(
      expect.objectContaining({
        volume: null,
        difficulty: null,
        metricStatus: 'DATA_INSUFFICIENT',
        metricEvidence: null,
      }),
    );
  });

  it('normalizes again before persistence so alternate providers cannot bypass the gate', async () => {
    const transaction = {
      keywordReport: {
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'report-1', ...data })),
      },
    };
    const tenantDatabase = {
      run: jest
        .fn()
        .mockImplementation((_orgId: string, operation) =>
          operation(transaction),
        ),
    };
    const service = new KeywordsService(
      {} as never,
      { log: jest.fn() } as never,
      {
        runKeywordAnalysis: jest.fn().mockResolvedValue({
          dataStatus: 'EVIDENCE_BACKED',
          keywords: [{ keyword: 'unverified', volume: 8000, difficulty: 9 }],
        }),
      } as never,
      tenantDatabase as never,
    );

    await service.create(user, {
      seedKeywords: ['portable fan'],
      marketplace: 'ozon',
    });

    expect(transaction.keywordReport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        keywords: [
          expect.objectContaining({
            keyword: 'unverified',
            volume: null,
            difficulty: null,
            metricStatus: 'DATA_INSUFFICIENT',
          }),
        ],
        charts: expect.objectContaining({
          dataStatus: 'DATA_INSUFFICIENT',
          evidenceBackedMetricCount: 0,
        }),
      }),
    });
  });
});
