import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BusinessTimeService } from '../src/features/product-research/daily/services/business-time.service.js';
import { DailyProductResearchService } from '../src/features/product-research/daily/daily-product-research.service.js';
import { DailyProductResearchOrchestratorService } from '../src/features/product-research/daily/services/daily-product-research-orchestrator.service.js';
import type { ExternalCandidate } from '../src/features/product-research/daily/contracts/external-candidate.contract.js';
import { envSchema } from '../src/shared/config/env.js';
import { ComplianceScannerService } from '../src/features/product-research/daily/services/compliance-scanner.service.js';
import { RiskAnalysisService } from '../src/features/product-research/daily/services/risk-analysis.service.js';

function externalCandidate(
  overrides: Partial<ExternalCandidate> = {},
): ExternalCandidate {
  return {
    source: 'marketplace',
    provider: 'discovery-provider',
    externalId: 'external-1',
    url: 'https://market.example.test/product/1',
    imageUrl: 'https://images.example.test/product.png',
    name: 'Portable organizer',
    productType: 'organizer',
    salePrice: '999.00',
    currency: 'RUB',
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

function dailyServiceFixture(input: {
  realConnectorsAllowed: boolean;
  enrichmentEnabled: boolean;
  intakeAllowed?: boolean;
  controlState?: 'RUNNING' | 'PAUSE_REQUESTED' | 'STOP_REQUESTED';
}) {
  const scoringVersion = {
    id: 'scoring-1',
    thresholds: {},
  };
  let persistedRun: Record<string, unknown> | null = null;
  const create = jest.fn().mockImplementation(async ({ data }) => {
    persistedRun = { id: 'run-1', ...data };
    return persistedRun;
  });
  const tx = {
    scoringVersion: {
      findFirst: jest.fn().mockResolvedValue(scoringVersion),
    },
    productResearchRun: {
      findFirst: jest.fn().mockImplementation(async () => persistedRun),
      create,
    },
  };
  const tenantDatabase = {
    run: jest.fn(
      async (_organizationId: string, operation: (value: unknown) => unknown) =>
        operation(tx),
    ),
  };
  const config = {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'DAILY_PRODUCT_RESEARCH_TIMEZONE') return 'Asia/Shanghai';
      if (key === 'DAILY_PRODUCT_RESEARCH_CANDIDATE_LIMIT') return 10;
      if (key === 'DAILY_PRODUCT_RESEARCH_TOP_LIMIT') return 10;
      if (key === 'SUPPLIER_IMAGE_SEARCH_ENRICHMENT_ENABLED') {
        return input.enrichmentEnabled;
      }
      return fallback;
    }),
  };
  const queue = { add: jest.fn().mockResolvedValue(undefined) };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const runtimePolicy = {
    assertCanCreateRun: jest.fn().mockReturnValue({
      mode: 'SHADOW',
      schedulerAllowed: true,
      realConnectorsAllowed: input.realConnectorsAllowed,
      internalActionsAllowed: false,
      visibleToMembers: false,
      externalStoreMutation: false,
    }),
  };
  const agentPermissions = {
    check: jest.fn().mockResolvedValue({
      allowed: input.intakeAllowed ?? true,
      level: 1,
      requireConfirm: false,
    }),
  };
  const control = {
    lockEffectiveState: jest.fn().mockResolvedValue({
      state: input.controlState ?? 'RUNNING',
      revision: 6,
    }),
  };
  const service = new DailyProductResearchService(
    {} as never,
    tenantDatabase as never,
    audit as never,
    config as never,
    new BusinessTimeService(),
    {} as never,
    runtimePolicy as never,
    agentPermissions as never,
    queue as never,
    control as never,
  );
  return { service, create, queue, agentPermissions, control };
}

describe('daily product research supplier image-search configuration', () => {
  it.each(['AUTO', 'MANUAL'] as const)(
    'persists the customer-selected %s pricing mode in the immutable run snapshot',
    async (pricingMode) => {
      const { service, create } = dailyServiceFixture({
        realConnectorsAllowed: true,
        enrichmentEnabled: false,
      });

      await service.manualRun(
        { sub: 'user-1', orgId: 'org-1', role: 'OWNER' } as never,
        { candidateLimit: 10, topLimit: 10, pricingMode },
      );

      const data = create.mock.calls[0][0].data as {
        configSnapshot: { pricingMode: string };
        configVersion: string;
      };
      expect(data.configSnapshot.pricingMode).toBe(pricingMode);
      expect(data.configVersion).toContain(
        `pricing-${pricingMode.toLowerCase()}`,
      );
    },
  );

  it('rejects new manual intake while the organization agent is paused', async () => {
    const { service, create, queue } = dailyServiceFixture({
      realConnectorsAllowed: true,
      enrichmentEnabled: false,
      intakeAllowed: false,
    });

    await expect(
      service.manualRun(
        { sub: 'user-1', orgId: 'org-1', role: 'OWNER' } as never,
        { candidateLimit: 10, topLimit: 10 },
      ),
    ).rejects.toThrow('AGENT_INTAKE_PAUSED');
    expect(create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it.each(['PAUSE_REQUESTED', 'STOP_REQUESTED'] as const)(
    'atomically rejects new intake when durable control is %s',
    async (controlState) => {
      const { service, create, queue, control } = dailyServiceFixture({
        realConnectorsAllowed: true,
        enrichmentEnabled: false,
        intakeAllowed: true,
        controlState,
      });

      await expect(
        service.manualRun(
          { sub: 'user-1', orgId: 'org-1', role: 'OWNER' } as never,
          { candidateLimit: 10, topLimit: 10 },
        ),
      ).rejects.toThrow('AGENT_INTAKE_PAUSED');
      expect(control.lockEffectiveState).toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    },
  );

  it('retries queue delivery for the same pending run without creating a duplicate', async () => {
    const { service, create, queue } = dailyServiceFixture({
      realConnectorsAllowed: true,
      enrichmentEnabled: false,
    });
    queue.add
      .mockRejectedValueOnce(new Error('redis unavailable'))
      .mockResolvedValueOnce(undefined);
    const request = () =>
      service.manualRun(
        { sub: 'user-1', orgId: 'org-1', role: 'OWNER' } as never,
        { candidateLimit: 10, topLimit: 10 },
      );

    await expect(request()).rejects.toThrow('DAILY_RESEARCH_QUEUE_UNAVAILABLE');
    await expect(request()).resolves.toMatchObject({
      run: { id: 'run-1', status: 'PENDING' },
      reused: true,
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add.mock.calls[0][2]).toEqual(queue.add.mock.calls[1][2]);
  });

  it('defaults the enrichment flag to false in the validated environment', () => {
    const parsed = envSchema.parse({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/shopmate',
    });

    expect(parsed.SUPPLIER_IMAGE_SEARCH_ENRICHMENT_ENABLED).toBe(false);
    expect(parsed.SUPPLIER_IMAGE_SEARCH_ENRICHMENT_LIMIT).toBe(10);
    expect(parsed.DAILY_PRODUCT_RESEARCH_CANDIDATE_LIMIT).toBe(10);
  });

  it('documents the disabled flag and ten-request limit in every deployment template', () => {
    const templates = [
      resolve(process.cwd(), '.env.example'),
      resolve(process.cwd(), '..', '.env.local-server.example'),
      resolve(process.cwd(), '..', 'docker-compose.local-server.yml'),
    ].map((path) => readFileSync(path, 'utf8'));

    for (const template of templates) {
      expect(template).toContain('SUPPLIER_IMAGE_SEARCH_ENRICHMENT_ENABLED');
      expect(template).toContain('SUPPLIER_IMAGE_SEARCH_ENRICHMENT_LIMIT');
    }
    expect(templates[0]).toContain(
      'SUPPLIER_IMAGE_SEARCH_ENRICHMENT_ENABLED=false',
    );
    expect(templates[0]).toContain('SUPPLIER_IMAGE_SEARCH_ENRICHMENT_LIMIT=10');
    expect(templates[1]).toContain(
      'SUPPLIER_IMAGE_SEARCH_ENRICHMENT_ENABLED=false',
    );
    expect(templates[1]).toContain('SUPPLIER_IMAGE_SEARCH_ENRICHMENT_LIMIT=10');
    expect(templates[2]).toContain(
      'SUPPLIER_IMAGE_SEARCH_ENRICHMENT_ENABLED: ${SUPPLIER_IMAGE_SEARCH_ENRICHMENT_ENABLED:-false}',
    );
    expect(templates[2]).toContain(
      'SUPPLIER_IMAGE_SEARCH_ENRICHMENT_LIMIT: ${SUPPLIER_IMAGE_SEARCH_ENRICHMENT_LIMIT:-10}',
    );
  });

  it.each([
    {
      realConnectorsAllowed: true,
      enrichmentEnabled: true,
      included: true,
    },
    {
      realConnectorsAllowed: true,
      enrichmentEnabled: false,
      included: false,
    },
    {
      realConnectorsAllowed: false,
      enrichmentEnabled: true,
      included: false,
    },
  ])(
    'includes the immutable supplier source only when both gates are true: %j',
    async ({ realConnectorsAllowed, enrichmentEnabled, included }) => {
      const { service, create } = dailyServiceFixture({
        realConnectorsAllowed,
        enrichmentEnabled,
      });

      await service.startFromAutomation({
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        actorId: 'user-1',
        automationRunId: 'automation-1',
        timezone: 'Asia/Shanghai',
      });

      const data = create.mock.calls[0][0].data as {
        controlRevision: number;
        configSnapshot: {
          enabledSources: string[];
          supplierImageSearch: { enabled: boolean; candidateLimit: number };
        };
        configVersion: string;
      };
      expect(data.controlRevision).toBe(6);
      expect(
        data.configSnapshot.enabledSources.includes('supplier_image_search'),
      ).toBe(included);
      expect(data.configVersion).toContain('daily-product-research/config-v19');
      expect(data.configVersion).toContain(
        `supplier-image-search-${included ? 'on' : 'off'}`,
      );
      expect(data.configSnapshot.supplierImageSearch).toEqual({
        enabled: included,
        candidateLimit: 10,
      });
      expect(data.configVersion).toContain('limit-10');
    },
  );
});

function orchestratorFixture(input: {
  enabled: boolean;
  supplierPartial: boolean;
  runtimeMode?: 'DRY_RUN' | 'SHADOW';
  pricingMode?: 'AUTO' | 'MANUAL';
}) {
  const sequence: string[] = [];
  const finalUpdates: Array<Record<string, unknown>> = [];
  const sourceHealthUpsert = jest.fn().mockResolvedValue(undefined);
  const createRiskRecords = jest.fn().mockResolvedValue({ count: 1 });
  const run = {
    id: 'run-1',
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    businessDate: new Date('2026-07-16T00:00:00.000Z'),
    scheduleTimezone: 'Asia/Shanghai',
    candidateLimit: 10,
    topLimit: 10,
    status: 'PENDING',
    startedAt: null,
    createdBy: 'user-1',
    configSnapshot: {
      runtime: { mode: input.runtimeMode ?? 'SHADOW' },
      pricingMode: input.pricingMode ?? 'AUTO',
      supplierImageSearch: { enabled: input.enabled, candidateLimit: 10 },
      enabledSources: [
        'manual_import',
        ...(input.enabled ? ['supplier_image_search'] : []),
      ],
    },
    scoringVersion: {
      id: 'scoring-1',
      weights: {},
      thresholds: {
        testNow: 80,
        watch: 68,
        hold: 50,
        maximumOzonPublicSearchResults: 2,
      },
    },
  };
  const tx = {
    productResearchRun: {
      findFirst: jest.fn().mockResolvedValue(run),
      update: jest.fn().mockImplementation(async ({ data }) => {
        finalUpdates.push(data as Record<string, unknown>);
        return { ...run, ...data };
      }),
      updateMany: jest.fn().mockImplementation(async ({ data }) => {
        finalUpdates.push(data as Record<string, unknown>);
        return { count: 1 };
      }),
    },
    storeAgentProfile: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    productResearchStageRun: {
      upsert: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
    },
    productResearchSourceHealth: { upsert: sourceHealthUpsert },
    productCandidate: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(undefined),
    },
    productRiskRecord: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: createRiskRecords,
    },
  };
  const tenantDatabase = {
    run: jest.fn(
      async (_organizationId: string, operation: (value: unknown) => unknown) =>
        operation(tx),
    ),
  };
  const connectorRegistry = {
    collect: jest.fn().mockResolvedValue([
      {
        candidates: [],
        health: {
          source: 'manual_import',
          status: 'HEALTHY',
          attempts: 0,
          itemCount: 0,
          requestedAt: new Date(),
          finishedAt: new Date(),
          latencyMs: 0,
        },
      },
    ]),
  };
  const supplierHealth = {
    source: 'supplier_image_search',
    status: input.supplierPartial
      ? ('DEGRADED' as const)
      : ('HEALTHY' as const),
    attempts: 1,
    itemCount: 0,
    requestedAt: new Date(),
    finishedAt: new Date(),
    lastSuccessAt: null,
    latencyMs: 1,
    dataFreshnessSeconds: null,
    errorCode: input.supplierPartial ? 'SUPPLIER_IMAGE_SEARCH_DEGRADED' : null,
    errorMessage: null,
    metadata: {
      allocation: {
        schemaVersion: 'supplier-image-search-allocation/v1',
        candidateLimit: 10,
        consideredCandidateIds: [],
        skippedNoSourceImageCandidateIds: [],
        skippedByBudgetCount: 0,
        entries: [],
      },
    },
  };
  const supplierEnrichment = {
    enrichRun: jest.fn().mockImplementation(async () => {
      sequence.push('supplier');
      return {
        source: 'supplier_image_search',
        status: supplierHealth.status,
        partial: input.supplierPartial,
        health: supplierHealth,
      };
    }),
  };
  const profit = { calculate: jest.fn() };
  const trustedProfitEconomics = {
    deriveCalculationInput: jest.fn().mockReturnValue({
      calculationInput: null,
      hardGateReasons: [
        'SALE_PRICE_EVIDENCE_MISSING',
        'SUPPLIER_COST_EVIDENCE_MISSING',
        'PLATFORM_FEE_RATE_EVIDENCE_MISSING',
        'PAYMENT_FEE_RATE_EVIDENCE_MISSING',
        'AD_RATE_EVIDENCE_MISSING',
        'REFUND_RATE_EVIDENCE_MISSING',
      ],
    }),
  };
  const scoring = {
    rank: jest.fn().mockImplementation((candidates) => {
      sequence.push('score');
      if (input.pricingMode === 'MANUAL') {
        expect(candidates[0].hardGateReasons).toContain(
          'MANUAL_PRICING_REQUIRED',
        );
        expect(candidates[0].manualReviewEligible).toBe(true);
      } else {
        expect(candidates[0].hardGateReasons).toContain(
          'SALE_PRICE_EVIDENCE_MISSING',
        );
        expect(candidates[0].hardGateReasons).toContain(
          'SUPPLIER_COST_EVIDENCE_MISSING',
        );
        expect(candidates[0].manualReviewEligible).toBe(false);
      }
      expect(candidates[0].hardGateReasons).not.toContain(
        'MISSING_VERIFIED_PROFIT',
      );
      expect(candidates[0].hardGateReasons).toContain('RISK_EVIDENCE_MISSING');
      return { testNow: [], watch: [], hold: [], rejected: [] };
    }),
  };
  const orchestrator = new DailyProductResearchOrchestratorService(
    tenantDatabase as never,
    connectorRegistry as never,
    {} as never,
    {
      expand: jest.fn().mockImplementation(() => {
        sequence.push('keywords');
        return { primary: [], longTail: [], exclusions: [] };
      }),
    } as never,
    {
      analyze: jest.fn().mockReturnValue({
        signalStrength: 'MEDIUM',
        confidenceScore: 80,
      }),
    },
    {
      analyze: jest.fn().mockReturnValue({ entryOpportunityScore: 70 }),
    } as never,
    profit as never,
    trustedProfitEconomics as never,
    new ComplianceScannerService(),
    new RiskAnalysisService(),
    scoring as never,
    {} as never,
    {} as never,
    supplierEnrichment as never,
    {
      lockEffectiveState: jest.fn().mockResolvedValue({
        state: 'RUNNING',
        revision: 0,
      }),
    } as never,
  );
  const work = [
    {
      id: 'candidate-1',
      fingerprint: 'fingerprint-1',
      canonicalName: 'Portable organizer',
      productType: 'organizer',
      material: null,
      primaryUse: null,
      customizationMethod: null,
      targetAudience: null,
      inputs: [externalCandidate()],
      signals: [],
    },
  ];
  Object.assign(orchestrator as object, {
    normalizeAndPersistBatch: jest.fn().mockImplementation(async () => {
      sequence.push('normalize');
      return {
        candidates: work,
        backendHistoryExcludedCount: 0,
        backendHistoricalSourcingOfferExcludedCount: 0,
        backendDuplicateSourcingOfferCount: 0,
      };
    }),
    persistWorkSummary: jest.fn().mockResolvedValue(undefined),
    persistScores: jest.fn().mockResolvedValue(undefined),
    createReportArtifacts: jest
      .fn()
      .mockResolvedValue({ artifactCount: 0, topCount: 0 }),
  });
  return {
    orchestrator,
    supplierEnrichment,
    sourceHealthUpsert,
    createRiskRecords,
    profit,
    trustedProfitEconomics,
    scoring,
    sequence,
    finalUpdates,
  };
}

describe('daily product research supplier image-search orchestration', () => {
  it('skips automatic economics derivation in MANUAL mode and records a publish-blocking review gate', async () => {
    const fixture = orchestratorFixture({
      enabled: false,
      supplierPartial: false,
      pricingMode: 'MANUAL',
    });

    await fixture.orchestrator.execute('org-1', 'run-1');

    expect(
      fixture.trustedProfitEconomics.deriveCalculationInput,
    ).not.toHaveBeenCalled();
    expect(fixture.profit.calculate).not.toHaveBeenCalled();
    expect(fixture.scoring.rank).toHaveBeenCalledTimes(1);
  });

  it('runs after persisted normalization and before keywords/profit, persists degraded health and finishes PARTIAL', async () => {
    const fixture = orchestratorFixture({
      enabled: true,
      supplierPartial: true,
    });

    const result = await fixture.orchestrator.execute('org-1', 'run-1');

    expect(fixture.supplierEnrichment.enrichRun).toHaveBeenCalledWith({
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      researchRunId: 'run-1',
      userId: 'user-1',
      candidateLimit: 10,
      candidates: [
        expect.objectContaining({
          candidateId: 'candidate-1',
          canonicalName: 'Portable organizer',
        }),
      ],
    });
    expect(fixture.sequence.indexOf('normalize')).toBeLessThan(
      fixture.sequence.indexOf('supplier'),
    );
    expect(fixture.sequence.indexOf('supplier')).toBeLessThan(
      fixture.sequence.indexOf('keywords'),
    );
    expect(fixture.sourceHealthUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          source: 'supplier_image_search',
          status: 'DEGRADED',
          metadata: expect.objectContaining({
            allocation: expect.objectContaining({
              schemaVersion: 'supplier-image-search-allocation/v1',
            }),
          }),
        }),
        update: expect.objectContaining({
          metadata: expect.objectContaining({
            allocation: expect.objectContaining({
              schemaVersion: 'supplier-image-search-allocation/v1',
            }),
          }),
        }),
      }),
    );
    expect(fixture.profit.calculate).not.toHaveBeenCalled();
    expect(
      fixture.trustedProfitEconomics.deriveCalculationInput,
    ).toHaveBeenCalledWith({
      evidence: {},
      rawCandidateCosts: [],
      targetCurrency: 'RUB',
      maxEvidenceAgeSeconds: 3600,
    });
    expect(fixture.scoring.rank).toHaveBeenCalledTimes(1);
    expect(fixture.createRiskRecords).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          candidateId: 'candidate-1',
          riskType: 'RISK_EVIDENCE_MISSING',
          severity: 'BLOCKED',
          reviewStatus: 'NEEDS_REVIEW',
        }),
      ],
    });
    expect(result.status).toBe('PARTIAL');
    expect(fixture.finalUpdates).toContainEqual(
      expect.objectContaining({ status: 'PARTIAL', partialData: true }),
    );
  });

  it.each([
    { enabled: false, runtimeMode: 'SHADOW' as const },
    { enabled: false, runtimeMode: 'DRY_RUN' as const },
  ])('makes zero provider calls when the source is off: %j', async (input) => {
    const fixture = orchestratorFixture({
      enabled: input.enabled,
      supplierPartial: false,
      runtimeMode: input.runtimeMode,
    });

    const result = await fixture.orchestrator.execute('org-1', 'run-1');

    expect(fixture.supplierEnrichment.enrichRun).not.toHaveBeenCalled();
    expect(fixture.sourceHealthUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          source: 'supplier_image_search',
          status: 'DISABLED',
          attempts: 0,
          itemCount: 0,
          errorCode: 'SUPPLIER_IMAGE_SEARCH_DISABLED',
          errorMessage:
            '1688 供应商图片检索未启用，本轮未调用供应商接口；公开搜索链接仅可作为采购线索，不能作为报价或采购成本证据。',
          metadata: expect.objectContaining({
            providerCallAttempted: false,
            evidenceKind: 'IMAGE_SEARCH_DISCOVERY_ONLY',
            canProvideVerifiedSupplierQuote: false,
            public1688LeadPolicy: 'LEAD_ONLY_NOT_QUOTE',
          }),
        }),
      }),
    );
    expect(result.status).toBe('PARTIAL');
    expect(fixture.finalUpdates).toContainEqual(
      expect.objectContaining({
        status: 'PARTIAL',
        errorSummary: expect.objectContaining({
          code: 'CANDIDATE_BATCH_SHORTFALL',
          requestedCandidateCount: 10,
          processedCandidateCount: 1,
        }),
      }),
    );
  });
});
