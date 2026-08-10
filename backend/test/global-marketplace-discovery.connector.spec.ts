import { GlobalMarketplaceDiscoveryConnector } from '../src/features/product-research/daily/connectors/global-marketplace-discovery.connector.js';

describe('GlobalMarketplaceDiscoveryConnector', () => {
  it('accepts agent evidence only after schema validation', async () => {
    const fetchedAt = '2026-07-16T08:00:00.000Z';
    const agent = {
      runGlobalProductDiscovery: jest.fn().mockResolvedValue({
        provider: 'serper',
        fetchedAt,
        conceptCount: 1,
        searchAttempts: 7,
        searchSuccesses: 7,
        searchFailures: [],
        methodology: { externalStoreMutation: false },
        candidates: [
          {
            source: 'temu_public_search',
            provider: 'serper',
            externalId: null,
            url: 'https://www.temu.com/example.html',
            imageUrl: 'https://img.example.test/example.jpg',
            imageEvidenceUrl: 'https://www.temu.com/example.html',
            evidenceTitle: 'Personalized wooden desk organizer',
            evidenceSnippet: '278 sold',
            evidenceQuery: 'site:temu.com personalized desk organizer sold',
            evidenceScope: 'Public marketplace search result.',
            market: 'GLOBAL',
            name: 'personalized wooden desk organizer',
            productType: 'wooden desk organizer',
            salePrice: null,
            currency: null,
            costs: [],
            platformFeeRate: '0',
            paymentFeeRate: '0',
            adRate: '0',
            refundRate: '0',
            signals: [
              {
                metricName: 'sales',
                metricValue: '278',
                unit: 'count',
                observedAt: fetchedAt,
                fetchedAt,
                quality: 'VERIFIED',
              },
            ],
            risks: [],
          },
        ],
      }),
    };
    const connector = new GlobalMarketplaceDiscoveryConnector(agent as never);

    const result = await connector.collect({
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      businessDate: '2026-07-16',
      timezone: 'Asia/Shanghai',
      candidateLimit: 25,
      configSnapshot: { explorationKey: 'automation-run-1' },
    });

    expect(result.health.status).toBe('HEALTHY');
    expect(result.health.itemCount).toBe(1);
    expect(result.candidates[0].imageUrl).toContain('example.jpg');
    expect(agent.runGlobalProductDiscovery).toHaveBeenCalledWith(
      {
        businessDate: '2026-07-16',
        candidateLimit: 25,
        explorationKey: 'automation-run-1',
      },
      { orgId: 'org-1', workspaceId: 'workspace-1' },
    );
  });
});
