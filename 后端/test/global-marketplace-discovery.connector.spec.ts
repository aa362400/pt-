import { GlobalMarketplaceDiscoveryConnector } from '../src/features/product-research/daily/connectors/global-marketplace-discovery.connector.js';
import { externalCandidateSchema } from '../src/features/product-research/daily/contracts/external-candidate.contract.js';

describe('GlobalMarketplaceDiscoveryConnector', () => {
  it('preserves structured evidence-gap diagnostics as a degraded partial result', async () => {
    const agent = {
      runGlobalProductDiscovery: jest.fn().mockResolvedValue({
        status: 'PARTIAL',
        errorCode: 'EVIDENCE_INSUFFICIENT',
        candidates: [],
        provider: 'serper',
        attemptedProviders: ['serper', 'tavily'],
        conceptCount: 0,
        requestedConceptCount: 1,
        partialEvidenceCount: 1,
        evidenceGap: {
          requiredIndependentSources: 2,
          maximumObservedIndependentSources: 1,
          partialConceptCount: 1,
        },
        searchAttempts: 4,
        searchSuccesses: 2,
        searchFailures: [],
      }),
    };
    const connector = new GlobalMarketplaceDiscoveryConnector(agent as never);

    const result = await connector.collect({
      researchRunId: 'run-partial-evidence',
      organizationId: 'org-1',
      workspaceId: null,
      businessDate: '2026-07-17',
      timezone: 'Asia/Shanghai',
      candidateLimit: 1,
      configSnapshot: {},
    });

    expect(result.candidates).toEqual([]);
    expect(result.health).toMatchObject({
      status: 'DEGRADED',
      errorCode: 'EVIDENCE_INSUFFICIENT',
      metadata: {
        partialEvidenceCount: 1,
        attemptedProviders: ['serper', 'tavily'],
        evidenceGap: {
          requiredIndependentSources: 2,
          maximumObservedIndependentSources: 1,
        },
      },
    });
  });

  it('rejects a forged 1688 sourcing lead at the backend trust boundary', () => {
    const maliciousLead = {
      source: '1688_public_sourcing_lead',
      provider: 'untrusted-agent',
      externalId: '123456789',
      url: 'https://evil.example/offer/123456789.html',
      market: 'CN',
      name: 'compact cable organizer clips',
      productType: 'cable organizer clip',
      salePrice: '18.50',
      currency: 'CNY',
      costs: [],
      platformFeeRate: null,
      paymentFeeRate: null,
      adRate: null,
      refundRate: null,
      signals: [],
      risks: [],
    };

    expect(() => externalCandidateSchema.parse(maliciousLead)).toThrow();
  });

  it('accepts only a canonical price-free 1688 offer identity', () => {
    expect(
      externalCandidateSchema.parse({
        source: '1688_public_sourcing_lead',
        provider: 'serper',
        conceptKey: 'cable organizer',
        externalId: '123456789',
        url: 'https://detail.1688.com/offer/123456789.html',
        market: 'CN',
        name: 'compact cable organizer clips',
        productType: 'cable organizer clip',
        salePrice: null,
        currency: null,
        costs: [],
        platformFeeRate: null,
        paymentFeeRate: null,
        adRate: null,
        refundRate: null,
        signals: [],
        risks: [],
      }),
    ).toMatchObject({
      externalId: '123456789',
      url: 'https://detail.1688.com/offer/123456789.html',
      salePrice: null,
    });
  });

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
    const controller = new AbortController();

    const result = await connector.collect({
      researchRunId: 'research-run-1',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      businessDate: '2026-07-16',
      timezone: 'Asia/Shanghai',
      candidateLimit: 1,
      configSnapshot: { explorationKey: 'automation-run-1' },
      excludedConceptKeys: ['cable organizer'],
      excludedSourcingOfferIds: ['123456789'],
      signal: controller.signal,
    });

    expect(result.health.status).toBe('HEALTHY');
    expect(result.health.itemCount).toBe(1);
    expect(result.candidates[0].imageUrl).toContain('example.jpg');
    expect(agent.runGlobalProductDiscovery).toHaveBeenCalledWith(
      {
        businessDate: '2026-07-16',
        candidateLimit: 1,
        explorationKey: 'automation-run-1',
        excludedConceptKeys: ['cable organizer'],
        excludedSourcingOfferIds: ['123456789'],
      },
      {
        orgId: 'org-1',
        workspaceId: 'workspace-1',
        requestId:
          'daily-product-research:research-run-1:global-product-discovery',
      },
      { signal: controller.signal },
    );
  });

  it('keeps the verified batch when optional image fields have unsafe schemes', async () => {
    const fetchedAt = '2026-07-16T08:00:00.000Z';
    const candidate = (name: string, url: string) => ({
      source: 'temu_public_search',
      provider: 'serper',
      externalId: null,
      url,
      imageEvidenceUrl: url,
      evidenceTitle: name,
      evidenceSnippet: '278 sold',
      evidenceQuery: `site:temu.com ${name} sold`,
      evidenceScope: 'Public marketplace search result.',
      market: 'GLOBAL',
      name,
      productType: name,
      salePrice: null,
      currency: null,
      costs: [],
      platformFeeRate: '0',
      paymentFeeRate: '0',
      adRate: '0',
      refundRate: '0',
      signals: [],
      risks: [],
    });
    const first = candidate(
      'verified compact organizer',
      'https://www.temu.com/organizer.html',
    );
    const second = candidate(
      'verified travel pouch',
      'https://www.temu.com/travel-pouch.html',
    );
    const third = candidate(
      'verified cable holder',
      'https://www.temu.com/cable-holder.html',
    );
    const agent = {
      runGlobalProductDiscovery: jest.fn().mockResolvedValue({
        provider: 'serper',
        fetchedAt,
        conceptCount: 3,
        searchAttempts: 14,
        searchSuccesses: 14,
        searchFailures: [],
        methodology: { externalStoreMutation: false },
        candidates: [
          {
            ...first,
            imageUrl: 'https://img.example.test/organizer.jpg',
          },
          {
            ...second,
            imageUrl: 'data:image/png;base64,unsafe-inline-image',
          },
          {
            ...third,
            imageUrl: 'https://img.example.test/cable-holder.jpg',
            imageEvidenceUrl: 'file:///tmp/untrusted-image-source',
          },
        ],
      }),
    };
    const connector = new GlobalMarketplaceDiscoveryConnector(agent as never);

    const result = await connector.collect({
      researchRunId: 'research-run-optional-image',
      organizationId: 'org-1',
      workspaceId: null,
      businessDate: '2026-07-16',
      timezone: 'Asia/Shanghai',
      candidateLimit: 3,
      configSnapshot: {},
    });

    expect(result.health.status).toBe('DEGRADED');
    expect(result.health.errorCode).toBe('UNSAFE_OPTIONAL_IMAGE_URL_DISCARDED');
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates[0]).toMatchObject({
      imageUrl: 'https://img.example.test/organizer.jpg',
      imageEvidenceUrl: 'https://www.temu.com/organizer.html',
    });
    expect(result.candidates[1]).not.toHaveProperty('imageUrl');
    expect(result.candidates[1]).toHaveProperty(
      'imageEvidenceUrl',
      'https://www.temu.com/travel-pouch.html',
    );
    expect(result.candidates[2]).toHaveProperty(
      'imageUrl',
      'https://img.example.test/cable-holder.jpg',
    );
    expect(result.candidates[2]).not.toHaveProperty('imageEvidenceUrl');
    expect(result.health.metadata).toMatchObject({
      discardedOptionalImageUrlCount: 2,
    });
  });

  it('still rejects an unsafe core marketplace evidence URL', async () => {
    const agent = {
      runGlobalProductDiscovery: jest.fn().mockResolvedValue({
        provider: 'serper',
        fetchedAt: '2026-07-16T08:00:00.000Z',
        conceptCount: 1,
        searchAttempts: 7,
        searchSuccesses: 7,
        searchFailures: [],
        methodology: { externalStoreMutation: false },
        candidates: [
          {
            source: 'temu_public_search',
            provider: 'serper',
            url: 'file:///etc/passwd',
            name: 'unsafe core evidence',
            productType: 'unsafe core evidence',
            costs: [],
            platformFeeRate: '0',
            paymentFeeRate: '0',
            adRate: '0',
            refundRate: '0',
            signals: [],
            risks: [],
          },
        ],
      }),
    };
    const connector = new GlobalMarketplaceDiscoveryConnector(agent as never);

    await expect(
      connector.collect({
        researchRunId: 'research-run-unsafe-evidence-url',
        organizationId: 'org-1',
        workspaceId: null,
        businessDate: '2026-07-16',
        timezone: 'Asia/Shanghai',
        candidateLimit: 1,
        configSnapshot: {},
      }),
    ).rejects.toThrow('Only http and https evidence URLs are allowed');
  });

  it('reports a real-source shortfall instead of claiming healthy completion', async () => {
    const agent = {
      runGlobalProductDiscovery: jest.fn().mockResolvedValue({
        provider: 'serper',
        fetchedAt: '2026-07-16T08:00:00.000Z',
        conceptCount: 2,
        searchAttempts: 14,
        searchSuccesses: 14,
        searchFailures: [],
        rawEvidenceCount: 8,
        expansionRounds: 3,
        exhaustedSources: true,
        methodology: { externalStoreMutation: false },
        candidates: [
          {
            source: 'temu_public_search',
            provider: 'serper',
            externalId: null,
            url: 'https://www.temu.com/example.html',
            market: 'GLOBAL',
            name: 'verified compact organizer',
            productType: 'compact organizer',
            salePrice: null,
            currency: null,
            costs: [],
            platformFeeRate: '0',
            paymentFeeRate: '0',
            adRate: '0',
            refundRate: '0',
            signals: [],
            risks: [],
          },
        ],
      }),
    };
    const connector = new GlobalMarketplaceDiscoveryConnector(agent as never);

    const result = await connector.collect({
      researchRunId: 'research-run-2',
      organizationId: 'org-1',
      workspaceId: null,
      businessDate: '2026-07-16',
      timezone: 'Asia/Shanghai',
      candidateLimit: 10,
      configSnapshot: {},
    });

    expect(result.health.status).toBe('DEGRADED');
    expect(result.health.errorCode).toBe('CANDIDATE_SHORTFALL');
    expect(result.health.metadata).toMatchObject({
      requestedConceptCount: 10,
      conceptCount: 2,
      shortfall: 8,
      rawEvidenceCount: 8,
      expansionRounds: 3,
      exhaustedSources: true,
    });
  });

  it('reports discovery budget exhaustion as an explicit degraded source state', async () => {
    const agent = {
      runGlobalProductDiscovery: jest.fn().mockResolvedValue({
        provider: 'serper',
        fetchedAt: '2026-07-16T08:00:00.000Z',
        conceptCount: 0,
        requestedConceptCount: 10,
        acceptedConceptCount: 0,
        candidates: [],
        budgetExhausted: true,
        budgetSeconds: 720,
        searchAttempts: 8,
        searchSuccesses: 8,
        searchFailures: [],
        shortfall: 10,
        exhaustedSources: true,
        methodology: { externalStoreMutation: false },
      }),
    };
    const connector = new GlobalMarketplaceDiscoveryConnector(agent as never);

    const result = await connector.collect({
      researchRunId: 'research-run-budget',
      organizationId: 'org-1',
      workspaceId: null,
      businessDate: '2026-07-16',
      timezone: 'Asia/Shanghai',
      candidateLimit: 10,
      configSnapshot: {},
    });

    expect(result.health.status).toBe('DEGRADED');
    expect(result.health.errorCode).toBe('DISCOVERY_BUDGET_EXHAUSTED');
    expect(result.health.metadata).toMatchObject({
      budgetExhausted: true,
      budgetSeconds: 720,
      shortfall: 10,
    });
  });
});
