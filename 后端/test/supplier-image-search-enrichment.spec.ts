import type {
  AgentProviderInterface,
  SupplierImageSearchResult,
} from '../src/agents/agent-provider.interface.js';
import type { ExternalCandidate } from '../src/features/product-research/daily/contracts/external-candidate.contract.js';
import { SupplierImageSearchAllocationService } from '../src/features/product-research/daily/services/supplier-image-search-allocation.service.js';
import { SupplierImageSearchEnrichmentService } from '../src/features/product-research/daily/services/supplier-image-search-enrichment.service.js';

function externalCandidate(
  overrides: Partial<ExternalCandidate> = {},
): ExternalCandidate {
  return {
    source: 'marketplace',
    provider: 'discovery-provider',
    externalId: 'external-1',
    imageUrl: 'https://images.example.test/product.png',
    imageEvidenceUrl: null,
    name: 'Portable organizer',
    productType: 'organizer',
    costs: [],
    platformFeeRate: '0.10',
    paymentFeeRate: '0.03',
    adRate: '0.08',
    refundRate: '0.02',
    signals: [],
    risks: [],
    ...overrides,
  };
}

function supplierResult(
  requestId: string,
  outcome: 'MATCHES' | 'NO_RESULTS' = 'MATCHES',
): SupplierImageSearchResult {
  const offers =
    outcome === 'MATCHES'
      ? [
          {
            offerId: '7234567890123',
            subject: 'Supplier image match',
            detailUrl: 'https://detail.1688.com/offer/7234567890123.html',
            imageUrl: 'https://cbu01.alicdn.com/example.jpg',
            distributionFreePostage: true,
            displayPriceEvidence: {
              price: '10.50',
              consignPrice: '10.80',
              multipleConsignPrice: '9.80',
              evidenceUse: 'DISPLAY_ONLY' as const,
              verifiedProcurementCost: false as const,
            },
          },
        ]
      : [];
  return {
    outcome,
    providerResultCount: offers.length,
    offers,
    imageEvidence: {
      canonicalizationVersion: 'supplier-image-search-payload/v2',
      sourceOriginalSha256: 'a'.repeat(64),
      sourceCanonicalSha256: 'b'.repeat(64),
      decodedSizeBytes: 123_456,
      payloadMimeType: 'image/png',
      width: 1200,
      height: 1200,
      retrievalHashAlgorithm: 'DHASH64',
      retrievalHash: '0123456789abcdef',
      retrievalOnly: true,
    },
    provenance: {
      adapterVersion: 'supplier-image-search-adapter/v1',
      provider: 'documented-1688-image-search',
      requestId,
      fetchedAt: '2026-07-16T03:30:00.000Z',
      rawSnapshotSha256: 'c'.repeat(64),
    },
  };
}

function fixture(
  implementation: (
    imageUrl: string,
    requestId: string,
  ) => Promise<SupplierImageSearchResult> = async (_imageUrl, requestId) =>
    supplierResult(requestId),
) {
  const events: string[] = [];
  let healthMetadata: unknown = {};
  let healthExists = false;
  let candidateParentsValid = true;
  const runSupplierImageSearch = jest.fn(
    async (input: { imageUrl?: string }, context: { requestId: string }) => {
      events.push('agent-called');
      return implementation(input.imageUrl ?? '', context.requestId);
    },
  );
  const append = jest.fn().mockResolvedValue({
    id: 'evidence-1',
    inserted: true,
    contentHash: 'd'.repeat(64),
    dedupeKey: 'e'.repeat(64),
  });
  const allocationStore = {
    run: jest.fn(
      async (_organizationId: string, operation: (value: unknown) => unknown) =>
        operation({
          $queryRaw: jest.fn(
            async (query: {
              strings: readonly string[];
              values: unknown[];
            }) => {
              const sql = query.strings.join('?');
              if (sql.includes('pg_advisory_xact_lock')) {
                return [{ locked: null }];
              }
              if (sql.includes('FROM "organizations"')) {
                return [{ id: 'org-1' }];
              }
              if (sql.includes('FROM "workspaces"')) {
                return [{ id: 'workspace-1' }];
              }
              if (sql.includes('FROM "product_research_runs"')) {
                return [{ id: 'run-1' }];
              }
              if (sql.includes('FROM "product_candidates"')) {
                const candidateIds = query.values.slice(0, -3) as string[];
                return candidateParentsValid
                  ? candidateIds.map((id) => ({ id }))
                  : [];
              }
              throw new Error(`Unexpected SQL in enrichment test: ${sql}`);
            },
          ),
          productResearchRun: {
            findFirst: jest.fn().mockResolvedValue({ id: 'run-1' }),
          },
          productCandidate: {
            findMany: jest.fn(async (args: Record<string, any>) =>
              candidateParentsValid
                ? (args.where.id.in as string[]).map((id) => ({ id }))
                : [],
            ),
          },
          productResearchSourceHealth: {
            findUnique: jest.fn(async () =>
              healthExists ? { metadata: healthMetadata } : null,
            ),
            upsert: jest.fn(async (args: Record<string, any>) => {
              healthMetadata = healthExists
                ? args.update.metadata
                : args.create.metadata;
              healthExists = true;
              events.push('allocation-persisted');
              return { metadata: healthMetadata };
            }),
          },
        }),
    ),
  };
  const allocation = new SupplierImageSearchAllocationService(
    allocationStore as never,
  );
  return {
    runSupplierImageSearch,
    append,
    events,
    healthMetadata: () => healthMetadata,
    setCandidateParentsValid: (valid: boolean) => {
      candidateParentsValid = valid;
    },
    service: new SupplierImageSearchEnrichmentService(
      { runSupplierImageSearch } as unknown as AgentProviderInterface,
      { append } as never,
      allocation,
    ),
  };
}

const runInput = {
  organizationId: 'org-1',
  workspaceId: 'workspace-1',
  researchRunId: 'run-1',
  userId: 'user-1',
};

async function flushMicrotasks(count = 30): Promise<void> {
  for (let index = 0; index < count; index += 1) await Promise.resolve();
}

describe('SupplierImageSearchEnrichmentService', () => {
  it('selects a deterministic safe HTTPS source image and creates a stable request id', async () => {
    const preferred = externalCandidate({
      source: 'z-source',
      externalId: 'z-2',
      imageUrl: 'https://images.example.test/preferred.png?size=large',
      imageEvidenceUrl: 'https://evidence.example.test/preferred',
    });
    const lexicalFirstWithoutImageEvidence = externalCandidate({
      source: 'a-source',
      externalId: 'a-1',
      imageUrl: 'https://images.example.test/lexical.png',
      imageEvidenceUrl: null,
    });
    const unsafe = externalCandidate({
      source: '0-source',
      externalId: '0-1',
      imageUrl: 'https://images.example.test/unsafe.png?api_key=secret',
      imageEvidenceUrl: 'https://evidence.example.test/unsafe',
    });
    const first = fixture();
    const second = fixture();
    const candidate = {
      candidateId: 'candidate-1',
      canonicalName: 'Portable organizer',
      inputs: [lexicalFirstWithoutImageEvidence, unsafe, preferred],
    };

    await first.service.enrichRun({ ...runInput, candidates: [candidate] });
    await second.service.enrichRun({
      ...runInput,
      candidates: [{ ...candidate, inputs: [...candidate.inputs].reverse() }],
    });

    const firstCall = first.runSupplierImageSearch.mock.calls[0];
    const secondCall = second.runSupplierImageSearch.mock.calls[0];
    expect(firstCall[0]).toEqual({
      imageUrl: preferred.imageUrl,
      imageKeywords: 'Portable organizer',
    });
    expect(firstCall[1]).toEqual({
      orgId: 'org-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      requestId: expect.stringMatching(/^dpr-sis-v1:[a-f0-9]{64}$/),
    });
    expect(firstCall[1]).not.toHaveProperty('agentRunId');
    expect(secondCall[1].requestId).toBe(firstCall[1].requestId);
  });

  it('binds otherwise identical source images to distinct candidate request ids', async () => {
    const { service, runSupplierImageSearch } = fixture();
    const inputs = [externalCandidate()];

    await service.enrichRun({
      ...runInput,
      candidates: [
        { candidateId: 'candidate-1', canonicalName: 'One', inputs },
        { candidateId: 'candidate-2', canonicalName: 'Two', inputs },
      ],
    });

    const requestIds = runSupplierImageSearch.mock.calls.map(
      (call) => call[1].requestId,
    );
    expect(new Set(requestIds).size).toBe(2);
  });

  it('appends exact MATCHES and truthful NO_RESULTS evidence under the full parent chain', async () => {
    const { service, append } = fixture(async (imageUrl, requestId) =>
      supplierResult(
        requestId,
        imageUrl.includes('no-results') ? 'NO_RESULTS' : 'MATCHES',
      ),
    );

    const summary = await service.enrichRun({
      ...runInput,
      candidates: [
        {
          candidateId: 'candidate-match',
          canonicalName: 'Match',
          inputs: [
            externalCandidate({
              imageUrl: 'https://images.example.test/match.png',
            }),
          ],
        },
        {
          candidateId: 'candidate-no-results',
          canonicalName: 'No results',
          inputs: [
            externalCandidate({
              imageUrl: 'https://images.example.test/no-results.png',
            }),
          ],
        },
      ],
    });

    expect(summary).toMatchObject({
      source: 'supplier_image_search',
      status: 'HEALTHY',
      attemptedCount: 2,
      successCount: 2,
      storedCount: 2,
      matchedCandidateCount: 1,
      noResultsCount: 1,
      matchCount: 1,
      failureCount: 0,
      skippedNoSourceImageCount: 0,
      partial: false,
    });
    expect(append).toHaveBeenCalledTimes(2);
    const matchAppend = append.mock.calls
      .map((call) => call[0])
      .find((input) => input.candidateId === 'candidate-match');
    const noResultsAppend = append.mock.calls
      .map((call) => call[0])
      .find((input) => input.candidateId === 'candidate-no-results');
    expect(matchAppend).toMatchObject({
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      researchRunId: 'run-1',
      candidateId: 'candidate-match',
      evidence: {
        schemaVersion: 'supplier-image-search/v1',
        outcome: 'MATCHES',
        providerResultCount: 1,
        normalizedOffers: [
          {
            displayPriceEvidence: {
              price: '10.50',
              consignPrice: '10.80',
              multipleConsignPrice: '9.80',
              evidenceUse: 'DISPLAY_ONLY',
              verifiedProcurementCost: false,
            },
          },
        ],
        canonicalization: {
          version: 'supplier-image-search-payload/v2',
          canonicalByteSize: 123_456,
          canonicalMimeType: 'image/png',
          retrievalHashAlgorithm: 'DHASH64',
        },
      },
    });
    expect(noResultsAppend).toMatchObject({
      candidateId: 'candidate-no-results',
      evidence: {
        outcome: 'NO_RESULTS',
        providerResultCount: 0,
        normalizedOffers: [],
      },
    });
  });

  it('skips candidates without a safe source image and never fabricates NO_RESULTS', async () => {
    const { service, runSupplierImageSearch, append } = fixture();

    const summary = await service.enrichRun({
      ...runInput,
      candidates: [
        {
          candidateId: 'candidate-no-image',
          canonicalName: 'No image',
          inputs: [
            externalCandidate({ imageUrl: null }),
            externalCandidate({
              imageUrl: 'http://images.example.test/insecure.png',
            }),
          ],
        },
      ],
    });

    expect(runSupplierImageSearch).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
    expect(summary).toMatchObject({
      status: 'DEGRADED',
      attemptedCount: 0,
      noResultsCount: 0,
      skippedNoSourceImageCount: 1,
      reasonCounts: { SKIPPED_NO_SOURCE_IMAGE: 1 },
      partial: true,
    });
  });

  it('isolates a candidate failure and continues storing later successes', async () => {
    const { service, append } = fixture(async (imageUrl, requestId) => {
      if (imageUrl.includes('fails')) throw new Error('upstream secret body');
      return supplierResult(requestId);
    });

    const summary = await service.enrichRun({
      ...runInput,
      candidates: [
        {
          candidateId: 'candidate-fails',
          canonicalName: 'Fails',
          inputs: [
            externalCandidate({
              imageUrl: 'https://images.example.test/fails.png',
            }),
          ],
        },
        {
          candidateId: 'candidate-succeeds',
          canonicalName: 'Succeeds',
          inputs: [
            externalCandidate({
              imageUrl: 'https://images.example.test/succeeds.png',
            }),
          ],
        },
      ],
    });

    expect(append).toHaveBeenCalledTimes(1);
    expect(append.mock.calls[0][0].candidateId).toBe('candidate-succeeds');
    expect(summary).toMatchObject({
      status: 'DEGRADED',
      successCount: 1,
      failureCount: 1,
      partial: true,
    });
    expect(JSON.stringify(summary)).not.toContain('upstream secret body');
    expect(JSON.stringify(summary)).not.toContain('api_key');
  });

  it('records an entirely unconfigured provider without throwing or failing the run', async () => {
    const { service, append } = fixture(async () => {
      throw new Error('SUPPLIER_IMAGE_SEARCH_REAL_PROVIDER_REQUIRED');
    });

    const summary = await service.enrichRun({
      ...runInput,
      candidates: [
        {
          candidateId: 'candidate-1',
          canonicalName: 'One',
          inputs: [externalCandidate()],
        },
      ],
    });

    expect(append).not.toHaveBeenCalled();
    expect(summary).toMatchObject({
      status: 'NOT_CONFIGURED',
      attemptedCount: 1,
      successCount: 0,
      notConfiguredCount: 1,
      failureCount: 0,
      partial: true,
      reasonCounts: {
        SUPPLIER_IMAGE_SEARCH_NOT_CONFIGURED: 1,
      },
    });
  });

  it('never runs more than three supplier requests concurrently', async () => {
    let active = 0;
    let maximumActive = 0;
    const { service } = fixture(async (_imageUrl, requestId) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return supplierResult(requestId, 'NO_RESULTS');
    });

    const summary = await service.enrichRun({
      ...runInput,
      candidates: Array.from({ length: 7 }, (_, index) => ({
        candidateId: `candidate-${index}`,
        canonicalName: `Candidate ${index}`,
        inputs: [
          externalCandidate({
            imageUrl: `https://images.example.test/${index}.png`,
          }),
        ],
      })),
    });

    expect(maximumActive).toBe(3);
    expect(summary).toMatchObject({
      status: 'HEALTHY',
      attemptedCount: 7,
      successCount: 7,
      noResultsCount: 7,
      matchCount: 0,
      partial: false,
    });
  });

  it('never exceeds the immutable per-run supplier request budget', async () => {
    const { service, runSupplierImageSearch } = fixture();

    const summary = await service.enrichRun({
      ...runInput,
      candidateLimit: 10,
      candidates: Array.from({ length: 12 }, (_, index) => ({
        candidateId: `candidate-budget-${index}`,
        canonicalName: `Candidate ${index}`,
        inputs: [
          externalCandidate({
            imageUrl: `https://images.example.test/budget-${index}.png`,
          }),
        ],
      })),
    });

    expect(runSupplierImageSearch).toHaveBeenCalledTimes(10);
    expect(summary).toMatchObject({
      attemptedCount: 10,
      successCount: 10,
      skippedByBudgetCount: 2,
      reasonCounts: { SKIPPED_BY_BUDGET: 2 },
      partial: false,
    });
  });

  it('persists allocation before the first Agent call and reuses it across retries without backfilling', async () => {
    const subject = fixture();
    const initialCandidates = Array.from({ length: 12 }, (_, index) => ({
      candidateId: `candidate-retry-${index.toString().padStart(2, '0')}`,
      fingerprint: `fingerprint-retry-${index.toString().padStart(2, '0')}`,
      canonicalName: `Initial ${index}`,
      inputs: [
        externalCandidate({
          externalId: `initial-${index}`,
          imageUrl:
            index === 0
              ? null
              : `https://images.example.test/initial-${index}.png`,
        }),
      ],
    }));

    const first = await subject.service.enrichRun({
      ...runInput,
      candidateLimit: 10,
      candidates: initialCandidates,
    });
    const firstCalls = subject.runSupplierImageSearch.mock.calls.map((call) =>
      structuredClone(call),
    );
    const second = await subject.service.enrichRun({
      ...runInput,
      candidateLimit: 10,
      candidates: initialCandidates.map((candidate, index) => ({
        ...candidate,
        canonicalName: `Changed ${index}`,
        inputs: [
          externalCandidate({
            externalId: `changed-${index}`,
            imageUrl: `https://images.example.test/changed-${index}.png`,
          }),
        ],
      })),
    });
    const allCalls = subject.runSupplierImageSearch.mock.calls;

    expect(subject.events[0]).toBe('allocation-persisted');
    expect(subject.events[1]).toBe('agent-called');
    expect(firstCalls).toHaveLength(9);
    expect(allCalls).toHaveLength(18);
    expect(allCalls.slice(9)).toEqual(firstCalls);
    expect(new Set(allCalls.map((call) => call[1].requestId)).size).toBe(9);
    expect(allCalls.some((call) => call[0].imageUrl.includes('changed-'))).toBe(
      false,
    );
    expect(first).toMatchObject({
      skippedNoSourceImageCount: 1,
      skippedByBudgetCount: 2,
    });
    expect(second).toMatchObject({
      skippedNoSourceImageCount: 1,
      skippedByBudgetCount: 2,
    });
    expect(second.health.metadata).toMatchObject({
      allocation: {
        consideredCandidateIds: initialCandidates
          .slice(0, 10)
          .map((candidate) => candidate.candidateId),
        entries: expect.arrayContaining([
          expect.objectContaining({
            candidateId: 'candidate-retry-01',
            imageUrl: 'https://images.example.test/initial-1.png',
          }),
        ]),
      },
    });
  });

  it('makes no provider call when a persisted allocation candidate no longer matches the full parent chain', async () => {
    const subject = fixture();
    const input = {
      ...runInput,
      candidates: [
        {
          candidateId: 'candidate-parent-bound',
          canonicalName: 'Parent bound',
          inputs: [externalCandidate()],
        },
      ],
    };
    await subject.service.enrichRun(input);
    subject.runSupplierImageSearch.mockClear();
    subject.setCandidateParentsValid(false);

    await expect(subject.service.enrichRun(input)).rejects.toThrow(
      'SUPPLIER_IMAGE_SEARCH_ALLOCATION_CANDIDATE_MISMATCH',
    );
    expect(subject.runSupplierImageSearch).not.toHaveBeenCalled();
  });

  it('starts the tenth request with deadline jitter while retaining a 17-minute queue reserve', async () => {
    let now = 0;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    const releases: Array<() => void> = [];
    const subject = fixture(
      (_imageUrl, requestId) =>
        new Promise<SupplierImageSearchResult>((resolve) => {
          releases.push(() => resolve(supplierResult(requestId, 'NO_RESULTS')));
        }),
    );

    const pending = subject.service.enrichRun({
      ...runInput,
      candidates: Array.from({ length: 10 }, (_, index) => ({
        candidateId: `candidate-wave-${index.toString().padStart(2, '0')}`,
        fingerprint: `fingerprint-wave-${index.toString().padStart(2, '0')}`,
        canonicalName: `Candidate ${index}`,
        inputs: [
          externalCandidate({
            imageUrl: `https://images.example.test/wave-${index}.png`,
          }),
        ],
      })),
    });
    await flushMicrotasks();
    expect(subject.runSupplierImageSearch).toHaveBeenCalledTimes(3);

    now = 3 * 60_000;
    releases.splice(0).forEach((release) => release());
    await flushMicrotasks();
    expect(subject.runSupplierImageSearch).toHaveBeenCalledTimes(6);

    now = 6 * 60_000;
    releases.splice(0).forEach((release) => release());
    await flushMicrotasks();
    expect(subject.runSupplierImageSearch).toHaveBeenCalledTimes(9);

    now = 9 * 60_000 + 30_000;
    releases.splice(0).forEach((release) => release());
    await flushMicrotasks();
    expect(subject.runSupplierImageSearch).toHaveBeenCalledTimes(10);

    releases.splice(0).forEach((release) => release());
    const summary = await pending;
    expect(summary).toMatchObject({
      attemptedCount: 10,
      successCount: 10,
      skippedByDeadlineCount: 0,
      partial: false,
    });
    nowSpy.mockRestore();
  });

  it('stops scheduling new Agent requests when the 13-minute batch deadline cannot fit another call', async () => {
    let now = 0;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    const releases: Array<() => void> = [];
    const subject = fixture(
      (_imageUrl, requestId) =>
        new Promise<SupplierImageSearchResult>((resolve) => {
          releases.push(() => resolve(supplierResult(requestId, 'NO_RESULTS')));
        }),
    );

    const pending = subject.service.enrichRun({
      ...runInput,
      candidates: Array.from({ length: 6 }, (_, index) => ({
        candidateId: `candidate-deadline-${index}`,
        canonicalName: `Candidate ${index}`,
        inputs: [
          externalCandidate({
            imageUrl: `https://images.example.test/deadline-${index}.png`,
          }),
        ],
      })),
    });
    await flushMicrotasks();
    expect(subject.runSupplierImageSearch).toHaveBeenCalledTimes(3);

    now = 10 * 60_000 + 1;
    releases.splice(0).forEach((release) => release());
    const summary = await pending;

    expect(subject.runSupplierImageSearch).toHaveBeenCalledTimes(3);
    expect(summary).toMatchObject({
      attemptedCount: 3,
      successCount: 3,
      skippedByDeadlineCount: 3,
      partial: true,
      reasonCounts: { SKIPPED_BATCH_DEADLINE: 3 },
    });
    nowSpy.mockRestore();
  });

  it('does not mutate discovery prices, currencies or cost inputs', async () => {
    const priced = externalCandidate({
      salePrice: '99.00',
      currency: 'CNY',
      costs: [],
    });
    const before = structuredClone(priced);
    const { service } = fixture();

    await service.enrichRun({
      ...runInput,
      candidates: [
        {
          candidateId: 'candidate-priced',
          canonicalName: 'Priced',
          inputs: [priced],
        },
      ],
    });

    expect(priced).toEqual(before);
  });

  it('derives protocol-safe image keywords without splitting a surrogate pair', async () => {
    const { service, runSupplierImageSearch } = fixture();
    const longName = `${'a'.repeat(199)}😀${'尾'.repeat(99)}`;

    await service.enrichRun({
      ...runInput,
      candidates: [
        {
          candidateId: 'candidate-long-keyword',
          canonicalName: longName,
          inputs: [externalCandidate()],
        },
      ],
    });

    const imageKeywords = runSupplierImageSearch.mock.calls[0][0]
      .imageKeywords as string;
    expect(imageKeywords.length).toBeLessThanOrEqual(200);
    expect(imageKeywords).not.toMatch(/[\uD800-\uDBFF]$/);
    expect(imageKeywords).toBe('a'.repeat(199));
  });

  it('binds the final transmitted keywords into the stable request id', async () => {
    const first = fixture();
    const second = fixture();
    const candidate = {
      candidateId: 'candidate-keyword-binding',
      inputs: [externalCandidate()],
    };

    await first.service.enrichRun({
      ...runInput,
      candidates: [{ ...candidate, canonicalName: 'Alpha keyword' }],
    });
    await second.service.enrichRun({
      ...runInput,
      candidates: [{ ...candidate, canonicalName: 'Beta keyword' }],
    });

    expect(first.runSupplierImageSearch.mock.calls[0][1].requestId).not.toBe(
      second.runSupplierImageSearch.mock.calls[0][1].requestId,
    );
  });
});
