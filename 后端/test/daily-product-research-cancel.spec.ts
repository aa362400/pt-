import { ConflictException } from '@nestjs/common';
import { DailyProductResearchService } from '../src/features/product-research/daily/daily-product-research.service.js';
import { DailyProductResearchOrchestratorService } from '../src/features/product-research/daily/services/daily-product-research-orchestrator.service.js';
import { BusinessTimeService } from '../src/features/product-research/daily/services/business-time.service.js';
import { ComplianceScannerService } from '../src/features/product-research/daily/services/compliance-scanner.service.js';
import { RiskAnalysisService } from '../src/features/product-research/daily/services/risk-analysis.service.js';

type RunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'PAUSED'
  | 'PARTIAL'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'STOPPED';

function matchesStatus(
  current: RunStatus,
  expected: RunStatus | { in?: RunStatus[]; not?: RunStatus } | undefined,
) {
  if (!expected) return true;
  if (typeof expected === 'string') return current === expected;
  if (expected.in && !expected.in.includes(current)) return false;
  if (expected.not && current === expected.not) return false;
  return true;
}

function orchestrationFixture(input: {
  candidateLimit: number;
  collectFailure?: boolean;
  failFirstCollect?: boolean;
  failFirstFeedback?: boolean;
  testNow?: boolean;
  runtimeMode?: 'PILOT' | 'SHADOW' | 'DRY_RUN';
  cancelAt?:
    | 'NONE'
    | 'CLAIM'
    | 'STAGE_START'
    | 'COLLECT'
    | 'NORMALIZE_CLAIM'
    | 'SUPPLIER'
    | 'COMPLETION';
}) {
  const cancelAt = input.cancelAt ?? 'COLLECT';
  let status: RunStatus = 'PENDING';
  let checkpointStage: string | null = null;
  let checkpointedAt: Date | null = null;
  let controlRevision = 0;
  let activeStage: string | null = null;
  let collectCalls = 0;
  let feedbackCalls = 0;
  let collectOutputSummary: unknown = null;
  const sequence: string[] = [];
  const supplierClaimedStages: Array<string | null> = [];
  const runUpdates: Array<Record<string, unknown>> = [];
  const stageUpdates: Array<{ stage: string; status: string }> = [];
  const run = {
    id: 'run-1',
    organizationId: 'org-1',
    workspaceId: null,
    businessDate: new Date('2026-07-16T00:00:00.000Z'),
    scheduleTimezone: 'Asia/Shanghai',
    candidateLimit: input.candidateLimit,
    topLimit: 10,
    startedAt: null,
    createdBy: 'user-1',
    trigger: 'MANUAL',
    attempt: 0,
    configSnapshot: {
      runtime: { mode: input.runtimeMode ?? 'PILOT' },
      enabledSources: [
        'manual_import',
        ...(['SUPPLIER', 'NORMALIZE_CLAIM'].includes(cancelAt)
          ? ['supplier_image_search']
          : []),
      ],
      supplierImageSearch: {
        enabled: ['SUPPLIER', 'NORMALIZE_CLAIM'].includes(cancelAt),
        candidateLimit: 10,
      },
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
      findFirst: jest.fn(async () => ({
        ...run,
        status,
        checkpointStage,
        checkpointedAt,
        controlRevision,
      })),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        runUpdates.push(data);
        if (typeof data.status === 'string') status = data.status as RunStatus;
        return { ...run, ...data, status };
      }),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { status?: RunStatus | { in?: RunStatus[]; not?: RunStatus } };
          data: Record<string, unknown>;
        }) => {
          if (cancelAt === 'CLAIM' && data.status === 'RUNNING') {
            status = 'CANCELLED';
            return { count: 0 };
          }
          if (
            cancelAt === 'COMPLETION' &&
            (data.status === 'COMPLETED' || data.status === 'PARTIAL')
          ) {
            status = 'CANCELLED';
            return { count: 0 };
          }
          if (
            cancelAt === 'NORMALIZE_CLAIM' &&
            data.currentStage === 'NORMALIZE'
          ) {
            status = 'CANCELLED';
            return { count: 0 };
          }
          if (!matchesStatus(status, where.status)) return { count: 0 };
          runUpdates.push(data);
          if (cancelAt === 'STAGE_START' && data.currentStage === 'COLLECT') {
            status = 'CANCELLED';
            return { count: 1 };
          }
          if (typeof data.status === 'string')
            status = data.status as RunStatus;
          if ('checkpointStage' in data) {
            checkpointStage = (data.checkpointStage as string | null) ?? null;
          }
          if (data.checkpointedAt instanceof Date) {
            checkpointedAt = data.checkpointedAt;
          }
          if (typeof data.controlRevision === 'number') {
            controlRevision = data.controlRevision;
          }
          if (data.status === 'COMPLETED' || data.status === 'PARTIAL') {
            sequence.push('terminal');
          }
          return { count: 1 };
        },
      ),
    },
    storeAgentProfile: { findUnique: jest.fn().mockResolvedValue(null) },
    productResearchStageRun: {
      findUnique: jest.fn(async () => ({
        outputSummary: collectOutputSummary,
      })),
      upsert: jest.fn().mockResolvedValue(undefined),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: {
            researchRunId_stage_attempt: { stage: string };
          };
          data: { status: string; outputSummary?: unknown };
        }) => {
          if (
            where.researchRunId_stage_attempt.stage === 'COLLECT' &&
            data.outputSummary !== undefined
          ) {
            collectOutputSummary = data.outputSummary;
          }
          if (data.status === 'RUNNING') {
            activeStage = where.researchRunId_stage_attempt.stage;
          } else if (activeStage === where.researchRunId_stage_attempt.stage) {
            activeStage = null;
          }
          stageUpdates.push({
            stage: where.researchRunId_stage_attempt.stage,
            status: data.status,
          });
        },
      ),
    },
    productResearchSourceHealth: {
      upsert: jest.fn().mockResolvedValue(undefined),
    },
    productCandidate: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(undefined),
    },
    productRiskRecord: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const tenantDatabase = {
    run: jest.fn(
      async (
        _organizationId: string,
        operation: (client: typeof tx) => unknown,
      ) => operation(tx),
    ),
  };
  const connectorRegistry = {
    collect: jest.fn(async () => {
      collectCalls += 1;
      sequence.push('collect');
      if (cancelAt === 'COLLECT') status = 'CANCELLED';
      if (input.collectFailure) throw new Error('collect failed after cancel');
      if (input.failFirstCollect && collectCalls === 1) {
        throw new Error('collect failed on first Bull attempt');
      }
      const now = new Date();
      return [
        {
          candidates: [],
          health: {
            source: 'manual_import',
            status: 'HEALTHY',
            attempts: 1,
            itemCount: 0,
            requestedAt: now,
            finishedAt: now,
            latencyMs: 0,
          },
        },
      ];
    }),
  };
  const supplierImageSearch = {
    enrichRun: jest.fn(async () => {
      sequence.push('supplier');
      supplierClaimedStages.push(activeStage);
      if (cancelAt === 'SUPPLIER') status = 'CANCELLED';
      const now = new Date();
      return {
        partial: false,
        health: {
          source: 'supplier_image_search',
          status: 'HEALTHY',
          attempts: 1,
          itemCount: 0,
          requestedAt: now,
          finishedAt: now,
          latencyMs: 0,
        },
      };
    }),
  };
  const reviewNotification = jest.fn(async () => {
    feedbackCalls += 1;
    sequence.push('feedback');
    if (input.failFirstFeedback && feedbackCalls === 1) {
      throw new Error('feedback failed on first Bull attempt');
    }
  });
  const orchestrator = new DailyProductResearchOrchestratorService(
    tenantDatabase as never,
    connectorRegistry as never,
    {} as never,
    {
      expand: jest.fn(() => {
        sequence.push('keywords');
        return { primary: [], longTail: [], exclusions: [] };
      }),
    } as never,
    {
      analyze: jest.fn(() => ({
        signalStrength: 'MEDIUM',
        confidenceScore: 80,
      })),
    } as never,
    { analyze: jest.fn(() => ({ entryOpportunityScore: 70 })) } as never,
    {} as never,
    {
      deriveCalculationInput: jest.fn(() => ({
        calculationInput: null,
        hardGateReasons: ['SALE_PRICE_EVIDENCE_MISSING'],
      })),
    } as never,
    new ComplianceScannerService(),
    new RiskAnalysisService(),
    {
      rank: jest.fn(() => ({
        testNow: input.testNow
          ? [
              {
                candidateId: 'candidate-review-1',
                finalScore: 92,
                decision: 'TEST_NOW',
                hardGateReasons: [],
                rank: 1,
              },
            ]
          : [],
        watch: [],
        hold: [],
        rejected: [],
      })),
    } as never,
    {} as never,
    {} as never,
    supplierImageSearch as never,
    {
      lockEffectiveState: jest.fn().mockResolvedValue({
        state: 'RUNNING',
        revision: 0,
      }),
    } as never,
  );
  Object.assign(orchestrator as object, {
    normalizeAndPersistBatch: jest.fn(async () => {
      sequence.push('normalize');
      return {
        candidates: [],
        backendHistoryExcludedCount: 0,
        backendHistoricalSourcingOfferExcludedCount: 0,
        backendDuplicateSourcingOfferCount: 0,
      };
    }),
    persistWorkSummary: jest.fn().mockResolvedValue(undefined),
    persistScores: jest.fn().mockResolvedValue(undefined),
    createReportArtifacts: jest.fn(async () => {
      sequence.push('report');
      return { artifactCount: 0, topCount: 0 };
    }),
    createReviewTasksAndNotification: reviewNotification,
  });
  return {
    orchestrator,
    reviewNotification,
    supplierImageSearch,
    supplierClaimedStages,
    runUpdates,
    stageUpdates,
    sequence,
    status: () => status,
  };
}

describe('daily product research cooperative cancellation', () => {
  it.each([
    { candidateLimit: 1, forbiddenTerminal: 'COMPLETED' },
    { candidateLimit: 10, forbiddenTerminal: 'PARTIAL' },
  ])(
    'keeps an active cancellation from becoming $forbiddenTerminal and stops after the current stage',
    async ({ candidateLimit, forbiddenTerminal }) => {
      const fixture = orchestrationFixture({ candidateLimit });

      const result = await fixture.orchestrator.execute('org-1', 'run-1');

      expect(result.status).toBe('CANCELLED');
      expect(fixture.status()).toBe('CANCELLED');
      expect(fixture.stageUpdates).toContainEqual({
        stage: 'COLLECT',
        status: 'COMPLETED',
      });
      expect(fixture.stageUpdates).not.toContainEqual({
        stage: 'NORMALIZE',
        status: 'RUNNING',
      });
      expect(fixture.sequence).toEqual(['collect']);
      expect(fixture.reviewNotification).not.toHaveBeenCalled();
      expect(fixture.runUpdates).not.toContainEqual(
        expect.objectContaining({ status: forbiddenTerminal }),
      );
    },
  );

  it('keeps CANCELLED when the current stage fails and does not retry later stages or notify', async () => {
    const fixture = orchestrationFixture({
      candidateLimit: 10,
      collectFailure: true,
    });

    const result = await fixture.orchestrator.execute('org-1', 'run-1');

    expect(result.status).toBe('CANCELLED');
    expect(fixture.status()).toBe('CANCELLED');
    expect(fixture.stageUpdates).not.toContainEqual({
      stage: 'NORMALIZE',
      status: 'RUNNING',
    });
    expect(fixture.sequence).toEqual(['collect']);
    expect(fixture.reviewNotification).not.toHaveBeenCalled();
    expect(fixture.runUpdates).not.toContainEqual(
      expect.objectContaining({ status: 'FAILED' }),
    );
  });

  it('does not revive CANCELLED when cancellation wins the initial run claim', async () => {
    const fixture = orchestrationFixture({
      candidateLimit: 10,
      cancelAt: 'CLAIM',
    });

    const result = await fixture.orchestrator.execute('org-1', 'run-1');

    expect(result.status).toBe('CANCELLED');
    expect(fixture.status()).toBe('CANCELLED');
    expect(fixture.sequence).toEqual([]);
    expect(fixture.stageUpdates).toEqual([]);
    expect(fixture.reviewNotification).not.toHaveBeenCalled();
  });

  it('finishes the current safe stage when cancellation lands after its active-state claim', async () => {
    const fixture = orchestrationFixture({
      candidateLimit: 10,
      cancelAt: 'STAGE_START',
    });

    const result = await fixture.orchestrator.execute('org-1', 'run-1');

    expect(result.status).toBe('CANCELLED');
    expect(fixture.sequence).toEqual(['collect']);
    expect(fixture.stageUpdates).toContainEqual({
      stage: 'COLLECT',
      status: 'COMPLETED',
    });
    expect(fixture.stageUpdates).not.toContainEqual({
      stage: 'NORMALIZE',
      status: 'RUNNING',
    });
    expect(fixture.reviewNotification).not.toHaveBeenCalled();
  });

  it('runs supplier image enrichment inside the claimed NORMALIZE stage and then honors cancellation', async () => {
    const fixture = orchestrationFixture({
      candidateLimit: 10,
      cancelAt: 'SUPPLIER',
    });

    const result = await fixture.orchestrator.execute('org-1', 'run-1');

    expect(result.status).toBe('CANCELLED');
    expect(fixture.status()).toBe('CANCELLED');
    expect(fixture.sequence).toEqual(['collect', 'normalize', 'supplier']);
    expect(fixture.supplierClaimedStages).toEqual(['NORMALIZE']);
    expect(fixture.stageUpdates).toContainEqual({
      stage: 'NORMALIZE',
      status: 'COMPLETED',
    });
    expect(fixture.stageUpdates).not.toContainEqual({
      stage: 'KEYWORDS',
      status: 'RUNNING',
    });
    expect(fixture.reviewNotification).not.toHaveBeenCalled();
  });

  it('does not start supplier image enrichment when cancellation wins the NORMALIZE claim', async () => {
    const fixture = orchestrationFixture({
      candidateLimit: 10,
      cancelAt: 'NORMALIZE_CLAIM',
    });

    const result = await fixture.orchestrator.execute('org-1', 'run-1');

    expect(result.status).toBe('CANCELLED');
    expect(fixture.supplierImageSearch.enrichRun).not.toHaveBeenCalled();
    expect(fixture.sequence).toEqual(['collect']);
    expect(fixture.stageUpdates).not.toContainEqual({
      stage: 'NORMALIZE',
      status: 'RUNNING',
    });
  });

  it('reclaims a FAILED run on the next Bull attempt and executes it again', async () => {
    const fixture = orchestrationFixture({
      candidateLimit: 10,
      cancelAt: 'NONE',
      failFirstCollect: true,
    });

    await expect(
      fixture.orchestrator.execute('org-1', 'run-1'),
    ).rejects.toThrow('collect failed on first Bull attempt');
    expect(fixture.status()).toBe('FAILED');

    const result = await fixture.orchestrator.execute('org-1', 'run-1');

    expect(result.status).toBe('PARTIAL');
    expect(fixture.status()).toBe('PARTIAL');
    expect(fixture.sequence.filter((item) => item === 'collect')).toHaveLength(
      2,
    );
    expect(fixture.runUpdates).toContainEqual(
      expect.objectContaining({
        status: 'RUNNING',
        finishedAt: null,
        currentStage: null,
      }),
    );
  });

  it('runs FEEDBACK before terminal CAS and marks the stage completed', async () => {
    const fixture = orchestrationFixture({
      candidateLimit: 10,
      cancelAt: 'NONE',
      testNow: true,
    });

    const result = await fixture.orchestrator.execute('org-1', 'run-1');

    expect(result.status).toBe('PARTIAL');
    expect(fixture.reviewNotification).toHaveBeenCalledTimes(1);
    expect(fixture.sequence.indexOf('feedback')).toBeLessThan(
      fixture.sequence.indexOf('terminal'),
    );
    expect(fixture.stageUpdates).toContainEqual({
      stage: 'FEEDBACK',
      status: 'COMPLETED',
    });
    expect(fixture.stageUpdates).not.toContainEqual({
      stage: 'FEEDBACK',
      status: 'SKIPPED',
    });
  });

  it('reuses the COLLECT snapshot after a normal FEEDBACK failure', async () => {
    const fixture = orchestrationFixture({
      candidateLimit: 10,
      cancelAt: 'NONE',
      testNow: true,
      failFirstFeedback: true,
    });

    await expect(
      fixture.orchestrator.execute('org-1', 'run-1'),
    ).rejects.toThrow('feedback failed on first Bull attempt');
    expect(fixture.status()).toBe('FAILED');
    expect(fixture.runUpdates).not.toContainEqual(
      expect.objectContaining({ status: 'PARTIAL' }),
    );

    const result = await fixture.orchestrator.execute('org-1', 'run-1');

    expect(result.status).toBe('PARTIAL');
    expect(fixture.status()).toBe('PARTIAL');
    expect(fixture.sequence.filter((item) => item === 'collect')).toHaveLength(
      1,
    );
    expect(fixture.reviewNotification).toHaveBeenCalledTimes(2);
  });

  it.each([
    { testNow: false, runtimeMode: 'PILOT' as const },
    { testNow: true, runtimeMode: 'SHADOW' as const },
  ])(
    'skips FEEDBACK when review output is not applicable: %j',
    async (input) => {
      const fixture = orchestrationFixture({
        candidateLimit: 10,
        cancelAt: 'NONE',
        ...input,
      });

      await fixture.orchestrator.execute('org-1', 'run-1');

      expect(fixture.reviewNotification).not.toHaveBeenCalled();
      expect(fixture.stageUpdates).toContainEqual({
        stage: 'FEEDBACK',
        status: 'SKIPPED',
      });
    },
  );

  it('does not notify when cancellation wins the final completion compare-and-set', async () => {
    const fixture = orchestrationFixture({
      candidateLimit: 10,
      cancelAt: 'COMPLETION',
    });

    const result = await fixture.orchestrator.execute('org-1', 'run-1');

    expect(result.status).toBe('CANCELLED');
    expect(fixture.status()).toBe('CANCELLED');
    expect(fixture.reviewNotification).not.toHaveBeenCalled();
    expect(fixture.runUpdates).not.toContainEqual(
      expect.objectContaining({ status: 'PARTIAL' }),
    );
  });

  it.each(['RUNNING', 'PAUSED'] as const)(
    'keeps a successful cancellation from %s when best-effort queue removal fails',
    async (initialStatus) => {
      let status: RunStatus = initialStatus;
      const run = { id: 'run-1', organizationId: 'org-1' };
      const productResearchRun = {
        findFirst: jest.fn(async () => ({ ...run, status })),
        updateMany: jest.fn(async ({ where, data }) => {
          if (
            where.id !== run.id ||
            where.organizationId !== run.organizationId ||
            !matchesStatus(status, where.status)
          ) {
            return { count: 0 };
          }
          status = data.status;
          return { count: 1 };
        }),
      };
      const tenantDatabase = {
        run: jest.fn(
          async (
            _organizationId: string,
            operation: (client: {
              productResearchRun: typeof productResearchRun;
            }) => unknown,
          ) => operation({ productResearchRun }),
        ),
      };
      const audit = { log: jest.fn().mockResolvedValue(undefined) };
      const remove = jest
        .fn()
        .mockRejectedValue(new Error('SECRET_QUEUE_PAYLOAD_SHOULD_NOT_LOG'));
      const service = new DailyProductResearchService(
        {} as never,
        tenantDatabase as never,
        audit as never,
        {} as never,
        new BusinessTimeService(),
        {} as never,
        {} as never,
        {} as never,
        {
          getJob: jest.fn().mockResolvedValue({
            isActive: jest.fn().mockResolvedValue(false),
            remove,
          }),
        } as never,
        {} as never,
      );
      const warn = jest.fn();
      Object.assign(service as object, { logger: { warn } });

      const result = await service.cancelRun(
        { sub: 'user-1', orgId: 'org-1', role: 'OWNER' } as never,
        'run-1',
      );

      expect(result.status).toBe('CANCELLED');
      expect(status).toBe('CANCELLED');
      expect(productResearchRun.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'run-1',
          organizationId: 'org-1',
          status: { in: ['PENDING', 'RUNNING', 'PAUSED'] },
        },
        data: expect.objectContaining({ status: 'CANCELLED' }),
      });
      expect(remove).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('daily_research_cancel_queue_cleanup_failed'),
      );
      expect(warn.mock.calls.flat().join(' ')).not.toContain(
        'SECRET_QUEUE_PAYLOAD_SHOULD_NOT_LOG',
      );
    },
  );

  it('does not turn a run back to CANCELLED when completion wins the cancel compare-and-set', async () => {
    let status: RunStatus = 'RUNNING';
    const run = { id: 'run-1', organizationId: 'org-1' };
    const productResearchRun = {
      findFirst: jest.fn(async () => ({ ...run, status })),
      update: jest.fn(async ({ data }: { data: { status: RunStatus } }) => {
        status = 'COMPLETED';
        status = data.status;
        return { ...run, status };
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        status = 'COMPLETED';
        if (
          where.id !== run.id ||
          where.organizationId !== run.organizationId ||
          !matchesStatus(status, where.status)
        ) {
          return { count: 0 };
        }
        status = data.status;
        return { count: 1 };
      }),
    };
    const tenantDatabase = {
      run: jest.fn(
        async (
          _organizationId: string,
          operation: (client: {
            productResearchRun: typeof productResearchRun;
          }) => unknown,
        ) => operation({ productResearchRun }),
      ),
    };
    const audit = { log: jest.fn() };
    const service = new DailyProductResearchService(
      {} as never,
      tenantDatabase as never,
      audit as never,
      {} as never,
      new BusinessTimeService(),
      {} as never,
      {} as never,
      {} as never,
      {
        getJob: jest.fn().mockResolvedValue({
          isActive: jest.fn().mockResolvedValue(true),
        }),
      } as never,
      {} as never,
    );

    await expect(
      service.cancelRun(
        { sub: 'user-1', orgId: 'org-1', role: 'OWNER' } as never,
        'run-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(status).toBe('COMPLETED');
    expect(productResearchRun.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'run-1',
        organizationId: 'org-1',
        status: { in: ['PENDING', 'RUNNING', 'PAUSED'] },
      },
      data: expect.objectContaining({ status: 'CANCELLED' }),
    });
    expect(audit.log).not.toHaveBeenCalled();
  });
});
