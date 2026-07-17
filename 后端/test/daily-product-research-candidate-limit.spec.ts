import { externalCandidateSchema } from '../src/features/product-research/daily/contracts/external-candidate.contract.js';
import {
  candidateBatchShortfall,
  connectorEvidenceInsufficientSummary,
  DailyProductResearchOrchestratorService,
} from '../src/features/product-research/daily/services/daily-product-research-orchestrator.service.js';
import { NormalizationService } from '../src/features/product-research/daily/services/normalization.service.js';

describe('daily research candidate limit', () => {
  it('records an explicit shortfall without inventing replacement candidates', () => {
    expect(candidateBatchShortfall(10, 4)).toEqual({
      code: 'EVIDENCE_INSUFFICIENT',
      requestedCandidateCount: 10,
      processedCandidateCount: 4,
      shortfall: 6,
      message: '仅找到 4/10 个可验证候选，已保留真实证据且未添加占位商品。',
    });
    expect(candidateBatchShortfall(10, 10)).toBeNull();
  });

  it('turns connector evidence gaps into a Chinese partial summary', () => {
    expect(
      connectorEvidenceInsufficientSummary([
        {
          candidates: [],
          health: {
            source: 'global_marketplace_discovery',
            status: 'DEGRADED',
            attempts: 4,
            itemCount: 1,
            requestedAt: new Date('2026-07-17T00:00:00Z'),
            finishedAt: new Date('2026-07-17T00:00:01Z'),
            latencyMs: 1000,
            errorCode: 'EVIDENCE_INSUFFICIENT',
            metadata: {
              partialEvidenceCount: 1,
              attemptedProviders: ['serper', 'tavily'],
              evidenceGap: {
                requiredIndependentSources: 2,
                maximumObservedIndependentSources: 1,
              },
            },
          },
        },
      ]),
    ).toEqual({
      code: 'EVIDENCE_INSUFFICIENT',
      requiredIndependentSources: 2,
      foundIndependentSources: 1,
      partialEvidenceCount: 1,
      attemptedProviders: ['serper', 'tavily'],
      message: '仅找到 1/2 个独立需求来源，已保留真实部分证据且未补造价格。',
    });
  });

  it('caps normalized candidate groups instead of raw marketplace evidence rows', async () => {
    let candidateSequence = 0;
    const tx = {
      productCandidate: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn(
          async ({ create }: { create: Record<string, unknown> }) => ({
            ...create,
            id: `candidate-${++candidateSequence}`,
          }),
        ),
      },
      productSignal: { upsert: jest.fn() },
    };
    const tenantDatabase = {
      run: jest.fn(
        async (
          _organizationId: string,
          operation: (client: typeof tx) => unknown,
        ) => operation(tx),
      ),
    };
    const service = new DailyProductResearchOrchestratorService(
      tenantDatabase as never,
      {} as never,
      new NormalizationService(),
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const evidence = ['a', 'b', 'c'].flatMap((group, groupIndex) =>
      ['temu_public_search', 'aliexpress_public_search'].map(
        (source, sourceIndex) =>
          externalCandidateSchema.parse({
            source,
            provider: 'test-search',
            externalId: `${group}-${sourceIndex}`,
            evidenceGroupKey: `global_product_concept:${group.repeat(64)}`,
            name: `Verified product ${groupIndex + 1}`,
            productType: `Product type ${groupIndex + 1}`,
            sourcingQueryZh: '桌面收纳盒',
            salePrice: null,
            currency: null,
            costs: [],
            platformFeeRate: '0',
            paymentFeeRate: '0',
            adRate: '0',
            refundRate: '0',
            signals: [],
            risks: [],
          }),
      ),
    );

    const result = await (
      service as unknown as {
        normalizeAndPersist(
          organizationId: string,
          runId: string,
          workspaceId: string | null,
          inputs: typeof evidence,
          candidateLimit: number,
        ): Promise<unknown[]>;
      }
    ).normalizeAndPersist('org-1', 'run-1', null, evidence, 2);

    expect(result).toHaveLength(2);
    expect(tx.productCandidate.upsert).toHaveBeenCalledTimes(2);
    expect(tx.productCandidate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          rawSummary: expect.objectContaining({
            evidence: expect.arrayContaining([
              expect.objectContaining({ sourcingQueryZh: '桌面收纳盒' }),
            ]),
          }),
        }),
      }),
    );
    expect(tx.productSignal.upsert).not.toHaveBeenCalled();
  });

  it('merges plural-only duplicate concepts even when the Agent supplied different evidence groups', async () => {
    let candidateSequence = 0;
    const tx = {
      productCandidate: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn(
          async ({ create }: { create: Record<string, unknown> }) => ({
            ...create,
            id: `candidate-${++candidateSequence}`,
          }),
        ),
      },
      productSignal: { upsert: jest.fn() },
    };
    const tenantDatabase = {
      run: jest.fn(
        async (
          _organizationId: string,
          operation: (client: typeof tx) => unknown,
        ) => operation(tx),
      ),
    };
    const service = new DailyProductResearchOrchestratorService(
      tenantDatabase as never,
      {} as never,
      new NormalizationService(),
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const evidence = [
      {
        name: 'dog poop bag holder',
        group: `global_product_concept:${'a'.repeat(64)}`,
      },
      {
        name: 'dog poop bags holder',
        group: `global_product_concept:${'b'.repeat(64)}`,
      },
    ].flatMap((concept, conceptIndex) =>
      ['temu_public_search', 'aliexpress_public_search'].map(
        (source, sourceIndex) =>
          externalCandidateSchema.parse({
            source,
            provider: 'test-search',
            externalId: `${conceptIndex}-${sourceIndex}`,
            evidenceGroupKey: concept.group,
            name: concept.name,
            productType: concept.name,
            salePrice: null,
            currency: null,
            costs: [],
            platformFeeRate: '0',
            paymentFeeRate: '0',
            adRate: '0',
            refundRate: '0',
            signals: [],
            risks: [],
          }),
      ),
    );

    const result = await (
      service as unknown as {
        normalizeAndPersist(
          organizationId: string,
          runId: string,
          workspaceId: string | null,
          inputs: typeof evidence,
          candidateLimit: number,
        ): Promise<unknown[]>;
      }
    ).normalizeAndPersist('org-1', 'run-1', null, evidence, 10);

    expect(result).toHaveLength(1);
    expect(tx.productCandidate.upsert).toHaveBeenCalledTimes(1);
  });

  it('merges high-similarity accessory families while retaining every evidence observation', async () => {
    let candidateSequence = 0;
    const tx = {
      productCandidate: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn(
          async ({ create }: { create: Record<string, unknown> }) => ({
            ...create,
            id: `candidate-${++candidateSequence}`,
          }),
        ),
      },
      productSignal: { upsert: jest.fn() },
    };
    const tenantDatabase = {
      run: jest.fn(
        async (
          _organizationId: string,
          operation: (client: typeof tx) => unknown,
        ) => operation(tx),
      ),
    };
    const service = new DailyProductResearchOrchestratorService(
      tenantDatabase as never,
      {} as never,
      new NormalizationService(),
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const concepts = [
      'hard glasses case',
      'aluminum hard shell eyeglasses case',
      'earphone storage pouch',
      'earphone storage case',
      'badge holder',
      'id tag work card sleeve',
      'hard plastic badge holder',
      'transparent badge holder',
      'sewing thread organizer',
      'curtain tieback holder',
      'makeup brush protector',
      'makeup brush protector mesh sleeve',
      'toothbrush head cover',
      'toothbrush cover case',
    ];
    const evidence = concepts.map((name, index) =>
      externalCandidateSchema.parse({
        source:
          index % 2 === 0 ? 'temu_public_search' : 'aliexpress_public_search',
        provider: 'test-search',
        externalId: `evidence-${index + 1}`,
        evidenceGroupKey: `global_product_concept:${index.toString(16).repeat(64)}`,
        name,
        productType: name,
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
    );

    const result = await (
      service as unknown as {
        normalizeAndPersist(
          organizationId: string,
          runId: string,
          workspaceId: string | null,
          inputs: typeof evidence,
          candidateLimit: number,
        ): Promise<Array<{ conceptKey: string }>>;
      }
    ).normalizeAndPersist('org-1', 'run-family-merge', null, evidence, 10);

    expect(result.map((item) => item.conceptKey)).toEqual([
      'eyeglass case',
      'earphone case',
      'badge card holder',
      'organizer sewing thread',
      'curtain holder tieback',
      'makeup brush protector',
      'toothbrush cover',
    ]);
    expect(tx.productCandidate.upsert).toHaveBeenCalledTimes(7);
    const persistedEvidence = tx.productCandidate.upsert.mock.calls.map(
      ([call]) =>
        call.create.rawSummary as {
          semanticConceptKeyVersion: string;
          evidence: Array<{ externalId: string }>;
        },
    );
    expect(persistedEvidence[0]).toMatchObject({
      semanticConceptKeyVersion: 'semantic-concept-key/v4',
      evidence: expect.arrayContaining([
        expect.objectContaining({ externalId: 'evidence-1' }),
        expect.objectContaining({ externalId: 'evidence-2' }),
      ]),
    });
    expect(persistedEvidence[1].evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ externalId: 'evidence-3' }),
        expect.objectContaining({ externalId: 'evidence-4' }),
      ]),
    );
    expect(persistedEvidence[2].evidence).toHaveLength(4);
    expect(persistedEvidence[5].evidence).toHaveLength(2);
    expect(persistedEvidence[6].evidence).toHaveLength(2);
  });

  it('does not create a candidate already processed by an earlier terminal run', async () => {
    const normalization = new NormalizationService();
    const incoming = externalCandidateSchema.parse({
      source: 'temu_public_search',
      provider: 'test-search',
      externalId: 'external-1',
      url: 'https://www.temu.com/compact-cable-organizer.html',
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
    });
    const normalized = normalization.normalize(incoming);
    const tx = {
      productCandidate: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'historical-candidate-1',
            fingerprint: normalized.fingerprint,
            canonicalName: normalized.canonicalName,
            productType: normalized.productType,
            rawSummary: null,
            researchRun: { status: 'PARTIAL' },
            _count: { scores: 1 },
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        upsert: jest.fn(
          async ({ create }: { create: Record<string, unknown> }) => ({
            ...create,
            id: 'unexpected-new-candidate',
          }),
        ),
      },
      productSignal: { upsert: jest.fn() },
    };
    const tenantDatabase = {
      run: jest.fn(
        async (
          _organizationId: string,
          operation: (client: typeof tx) => unknown,
        ) => operation(tx),
      ),
    };
    const service = new DailyProductResearchOrchestratorService(
      tenantDatabase as never,
      {} as never,
      normalization,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const batch = await (
      service as unknown as {
        normalizeAndPersistBatch(
          organizationId: string,
          runId: string,
          workspaceId: string | null,
          inputs: Array<typeof incoming>,
          candidateLimit: number,
        ): Promise<{
          candidates: unknown[];
          backendHistoryExcludedCount: number;
        }>;
      }
    ).normalizeAndPersistBatch('org-1', 'run-new', null, [incoming], 10);
    const result = batch.candidates;

    expect(result).toHaveLength(0);
    expect(batch.backendHistoryExcludedCount).toBe(1);
    expect(tx.productCandidate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          researchRunId: { not: 'run-new' },
        }),
      }),
    );
    expect(tx.productCandidate.upsert).not.toHaveBeenCalled();
    expect(tx.productCandidate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'historical-candidate-1' }),
        data: expect.objectContaining({ lastSeenAt: expect.any(Date) }),
      }),
    );
  });

  it('uses the semantic history gate and fills the batch from a later unseen concept', async () => {
    const normalization = new NormalizationService();
    const historicalInput = externalCandidateSchema.parse({
      source: 'temu_public_search',
      provider: 'test-search',
      externalId: 'old-evidence',
      name: 'compact cable organizer clips',
      productType: 'cable organizer clip',
      material: 'silicone',
      salePrice: null,
      currency: null,
      costs: [],
      platformFeeRate: null,
      paymentFeeRate: null,
      adRate: null,
      refundRate: null,
      signals: [],
      risks: [],
    });
    const repeatedWithDifferentFingerprint = externalCandidateSchema.parse({
      ...historicalInput,
      externalId: 'new-evidence',
      material: 'plastic',
    });
    const unseen = externalCandidateSchema.parse({
      ...historicalInput,
      externalId: 'unseen-evidence',
      name: 'mini dustpan brush set',
      productType: 'dustpan brush set',
      material: null,
    });
    const historicalNormalized = normalization.normalize(historicalInput);
    const tx = {
      productCandidate: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'historical-candidate-semantic',
            fingerprint: historicalNormalized.fingerprint,
            canonicalName: historicalNormalized.canonicalName,
            productType: historicalNormalized.productType,
            rawSummary: {
              semanticConceptKey: 'legacy-v3-key-that-must-not-be-trusted',
              semanticConceptKeyVersion: 'semantic-concept-key/v3',
              semanticConceptSource: {
                name: historicalInput.name,
                productType: historicalInput.productType,
              },
              evidence: [],
            },
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        upsert: jest.fn(
          async ({ create }: { create: Record<string, unknown> }) => ({
            ...create,
            id: 'candidate-unseen',
          }),
        ),
      },
      productSignal: { upsert: jest.fn() },
    };
    const tenantDatabase = {
      run: jest.fn(
        async (
          _organizationId: string,
          operation: (client: typeof tx) => unknown,
        ) => operation(tx),
      ),
    };
    const service = new DailyProductResearchOrchestratorService(
      tenantDatabase as never,
      {} as never,
      normalization,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await (
      service as unknown as {
        normalizeAndPersist(
          organizationId: string,
          runId: string,
          workspaceId: string | null,
          inputs: Array<typeof historicalInput>,
          candidateLimit: number,
        ): Promise<Array<{ canonicalName: string; conceptKey: string }>>;
      }
    ).normalizeAndPersist(
      'org-1',
      'run-new',
      null,
      [repeatedWithDifferentFingerprint, unseen],
      1,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      canonicalName: 'mini dustpan brush set',
      conceptKey: normalization.semanticConceptKey(
        'mini dustpan brush set',
        'dustpan brush set',
      ),
    });
    expect(tx.productCandidate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'historical-candidate-semantic',
          organizationId: 'org-1',
        }),
      }),
    );
    expect(tx.productCandidate.upsert).toHaveBeenCalledTimes(1);
    expect(tx.productCandidate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          canonicalName: 'mini dustpan brush set',
          rawSummary: expect.objectContaining({
            semanticConceptKey: expect.any(String),
          }),
        }),
      }),
    );
  });

  it('removes historical and same-batch 1688 offer reuse while retaining demand evidence', async () => {
    const normalization = new NormalizationService();
    const marketplaceInput = (
      name: string,
      productType: string,
      externalId: string,
      groupToken: string,
    ) =>
      externalCandidateSchema.parse({
        source: 'temu_public_search',
        provider: 'test-search',
        externalId,
        evidenceGroupKey: `global_product_concept:${groupToken.repeat(64)}`,
        url: `https://www.temu.com/${externalId}.html`,
        name,
        productType,
        salePrice: null,
        currency: null,
        costs: [],
        platformFeeRate: null,
        paymentFeeRate: null,
        adRate: null,
        refundRate: null,
        signals: [],
        risks: [],
      });
    const sourcingInput = (
      name: string,
      productType: string,
      offerId: string,
      groupToken: string,
    ) =>
      externalCandidateSchema.parse({
        source: '1688_public_sourcing_lead',
        provider: 'test-search',
        externalId: offerId,
        evidenceGroupKey: `global_product_concept:${groupToken.repeat(64)}`,
        url: `https://detail.1688.com/offer/${offerId}.html`,
        market: 'CN',
        name,
        productType,
        salePrice: null,
        currency: null,
        costs: [],
        platformFeeRate: null,
        paymentFeeRate: null,
        adRate: null,
        refundRate: null,
        signals: [],
        risks: [],
      });
    const inputs = [
      marketplaceInput('desktop pen holder', 'pen holder', 'market-a', 'a'),
      sourcingInput('desktop pen holder', 'pen holder', '111111111', 'a'),
      marketplaceInput('plant label tags', 'plant label tag', 'market-b', 'b'),
      sourcingInput('plant label tags', 'plant label tag', '222222222', 'b'),
      marketplaceInput(
        'keyboard cleaning brush',
        'keyboard brush',
        'market-c',
        'c',
      ),
      sourcingInput(
        'keyboard cleaning brush',
        'keyboard brush',
        '222222222',
        'c',
      ),
    ];
    let sequence = 0;
    const tx = {
      productCandidate: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'historical-unrelated',
            fingerprint: 'f'.repeat(64),
            canonicalName: 'historic unrelated product',
            productType: 'historic product',
            rawSummary: {
              evidence: [
                {
                  source: '1688_public_sourcing_lead',
                  url: 'https://detail.1688.com/offer/111111111.html',
                },
              ],
            },
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn(
          async ({ create }: { create: Record<string, unknown> }) => ({
            ...create,
            id: `candidate-${++sequence}`,
          }),
        ),
      },
      productSignal: { upsert: jest.fn() },
    };
    const tenantDatabase = {
      run: jest.fn(
        async (
          _organizationId: string,
          operation: (client: typeof tx) => unknown,
        ) => operation(tx),
      ),
    };
    const service = new DailyProductResearchOrchestratorService(
      tenantDatabase as never,
      {} as never,
      normalization,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const batch = await (
      service as unknown as {
        normalizeAndPersistBatch(
          organizationId: string,
          runId: string,
          workspaceId: string | null,
          inputs: typeof inputs,
          candidateLimit: number,
        ): Promise<{
          candidates: unknown[];
          backendHistoricalSourcingOfferExcludedCount: number;
          backendDuplicateSourcingOfferCount: number;
        }>;
      }
    ).normalizeAndPersistBatch('org-1', 'run-new', null, inputs, 3);

    expect(batch.candidates).toHaveLength(3);
    expect(batch.backendHistoricalSourcingOfferExcludedCount).toBe(1);
    expect(batch.backendDuplicateSourcingOfferCount).toBe(1);
    const createdEvidence = tx.productCandidate.upsert.mock.calls.map(
      ([call]) =>
        (
          call.create.rawSummary as { evidence: Array<{ source: string }> }
        ).evidence.map((item) => item.source),
    );
    expect(createdEvidence).toEqual([
      ['temu_public_search'],
      ['temu_public_search', '1688_public_sourcing_lead'],
      ['temu_public_search'],
    ]);
  });
});
