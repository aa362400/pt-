import { DailyProductResearchOrchestratorService } from '../src/features/product-research/daily/services/daily-product-research-orchestrator.service.js';

type RunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'PAUSED'
  | 'PARTIAL'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'STOPPED';

type ControlState = 'RUNNING' | 'PAUSE_REQUESTED' | 'STOP_REQUESTED';

function matchesStatus(
  current: RunStatus,
  expected: RunStatus | { in?: RunStatus[] } | undefined,
) {
  if (!expected) return true;
  if (typeof expected === 'string') return current === expected;
  return expected.in?.includes(current) ?? true;
}

type RunWhere = {
  status?: RunStatus | { in?: RunStatus[] };
  leaseOwner?: string | null;
  leaseExpiresAt?: Date | null | { lte?: Date };
  executionEpoch?: number;
  OR?: RunWhere[];
};

function matchesRunWhere(
  state: {
    status: RunStatus;
    leaseOwner: string | null;
    leaseExpiresAt: Date | null;
    executionEpoch: number;
  },
  where: RunWhere,
) {
  if (!matchesStatus(state.status, where.status)) return false;
  if ('leaseOwner' in where && state.leaseOwner !== where.leaseOwner) {
    return false;
  }
  if (
    typeof where.executionEpoch === 'number' &&
    state.executionEpoch !== where.executionEpoch
  ) {
    return false;
  }
  if ('leaseExpiresAt' in where) {
    if (where.leaseExpiresAt === null) {
      if (state.leaseExpiresAt !== null) return false;
    } else if (where.leaseExpiresAt instanceof Date) {
      if (state.leaseExpiresAt?.getTime() !== where.leaseExpiresAt.getTime()) {
        return false;
      }
    } else if (
      where.leaseExpiresAt?.lte &&
      (!state.leaseExpiresAt ||
        state.leaseExpiresAt.getTime() > where.leaseExpiresAt.lte.getTime())
    ) {
      return false;
    }
  }
  return !where.OR || where.OR.some((branch) => matchesRunWhere(state, branch));
}

function fixture(input?: {
  initialStatus?: RunStatus;
  checkpointStage?: string | null;
  controlRevision?: number;
  controlState?: ControlState;
  requestAfterCollect?: Exclude<ControlState, 'RUNNING'>;
  requestAfterFeedbackBoundary?: Exclude<ControlState, 'RUNNING'>;
  leaseOwner?: string | null;
  leaseExpiresAt?: Date | null;
  executionEpoch?: number;
  stealDuringCollect?: boolean;
  stealAfterFeedbackBoundary?: boolean;
}) {
  let status = input?.initialStatus ?? 'PENDING';
  let checkpointStage = input?.checkpointStage ?? null;
  let checkpointedAt: Date | null = checkpointStage ? new Date() : null;
  let controlRevision = input?.controlRevision ?? (checkpointStage ? 1 : 0);
  let controlState = input?.controlState ?? 'RUNNING';
  let currentStage: string | null = null;
  let leaseOwner = input?.leaseOwner ?? null;
  let leaseExpiresAt = input?.leaseExpiresAt ?? null;
  let executionEpoch = input?.executionEpoch ?? 0;
  let collectOutputSummary: unknown = null;
  const sequence: string[] = [];
  const runUpdates: Array<Record<string, unknown>> = [];
  const stageUpdates: Array<{ stage: string; status: string }> = [];
  const run = {
    id: 'run-control-1',
    organizationId: 'org-1',
    workspaceId: null,
    businessDate: new Date('2026-07-16T00:00:00.000Z'),
    scheduleTimezone: 'Asia/Shanghai',
    candidateLimit: 10,
    topLimit: 10,
    startedAt: null,
    createdBy: 'user-1',
    trigger: 'MANUAL',
    attempt: 0,
    configSnapshot: {
      runtime: { mode: 'SHADOW' },
      enabledSources: ['manual_import'],
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
  const productResearchRun = {
    findFirst: jest.fn(async () => ({
      ...run,
      status,
      checkpointStage,
      checkpointedAt,
      controlRevision,
      currentStage,
      leaseOwner,
      leaseExpiresAt,
      executionEpoch,
    })),
    updateMany: jest.fn(
      async ({
        where,
        data,
      }: {
        where: RunWhere;
        data: Record<string, unknown>;
      }) => {
        if (
          !matchesRunWhere(
            { status, leaseOwner, leaseExpiresAt, executionEpoch },
            where,
          )
        ) {
          return { count: 0 };
        }
        runUpdates.push(data);
        if (typeof data.status === 'string') status = data.status as RunStatus;
        if ('currentStage' in data) {
          currentStage = (data.currentStage as string | null) ?? null;
        }
        if ('checkpointStage' in data) {
          checkpointStage = (data.checkpointStage as string | null) ?? null;
        }
        if (data.checkpointedAt instanceof Date) {
          checkpointedAt = data.checkpointedAt;
        }
        if (typeof data.controlRevision === 'number') {
          controlRevision = data.controlRevision;
        }
        if ('leaseOwner' in data) {
          leaseOwner = (data.leaseOwner as string | null) ?? null;
        }
        if ('leaseExpiresAt' in data) {
          leaseExpiresAt = (data.leaseExpiresAt as Date | null) ?? null;
        }
        if (
          data.executionEpoch &&
          typeof data.executionEpoch === 'object' &&
          'increment' in data.executionEpoch
        ) {
          executionEpoch += Number(
            (data.executionEpoch as { increment: number }).increment,
          );
        } else if (typeof data.executionEpoch === 'number') {
          executionEpoch = data.executionEpoch;
        }
        return { count: 1 };
      },
    ),
  };
  const tx = {
    productResearchRun,
    storeAgentProfile: { findUnique: jest.fn().mockResolvedValue(null) },
    productResearchStageRun: {
      findUnique: jest.fn(async () => ({
        outputSummary: collectOutputSummary,
      })),
      upsert: jest.fn().mockResolvedValue(undefined),
      update: jest.fn(async ({ where, data }) => {
        const stage = where.researchRunId_stage_attempt.stage as string;
        if (stage === 'COLLECT' && data.outputSummary !== undefined) {
          collectOutputSummary = data.outputSummary;
        }
        stageUpdates.push({ stage, status: data.status });
        if (
          stage === 'FEEDBACK' &&
          ['COMPLETED', 'SKIPPED'].includes(data.status) &&
          input?.requestAfterFeedbackBoundary
        ) {
          controlState = input.requestAfterFeedbackBoundary;
          controlRevision += 1;
        }
        if (
          stage === 'FEEDBACK' &&
          ['COMPLETED', 'SKIPPED'].includes(data.status) &&
          input?.stealAfterFeedbackBoundary
        ) {
          leaseOwner = 'new-owner';
          leaseExpiresAt = new Date(Date.now() + 60_000);
          executionEpoch += 1;
        }
      }),
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
      sequence.push('collect');
      if (input?.requestAfterCollect) {
        controlState = input.requestAfterCollect;
        controlRevision += 1;
      }
      if (input?.stealDuringCollect) {
        leaseOwner = 'new-owner';
        leaseExpiresAt = new Date(Date.now() + 60_000);
        executionEpoch += 1;
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
  const organizationControl = {
    lockEffectiveState: jest.fn(async () => ({
      state: controlState,
      revision: controlRevision,
    })),
  };
  const orchestrator = new DailyProductResearchOrchestratorService(
    tenantDatabase as never,
    connectorRegistry as never,
    {} as never,
    {
      expand: jest.fn(() => ({ primary: [], longTail: [], exclusions: [] })),
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
    {} as never,
    {} as never,
    {
      rank: jest.fn(() => ({
        testNow: [],
        watch: [],
        hold: [],
        rejected: [],
      })),
    } as never,
    {} as never,
    {} as never,
    {} as never,
  );
  Object.assign(orchestrator as object, {
    organizationControl,
    normalizeAndPersist: jest.fn(async () => {
      sequence.push('normalize');
      return [];
    }),
    persistWorkSummary: jest.fn().mockResolvedValue(undefined),
    persistScores: jest.fn().mockResolvedValue(undefined),
    createReportArtifacts: jest.fn(async () => {
      sequence.push('report');
      return { artifactCount: 0, topCount: 0 };
    }),
  });
  if (checkpointStage) {
    const snapshotBuilder = orchestrator as unknown as {
      collectSnapshot(value: unknown): unknown;
    };
    const now = new Date('2026-07-16T10:00:00.000Z');
    collectOutputSummary = snapshotBuilder.collectSnapshot([
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
    ]);
  }

  return {
    orchestrator,
    connectorRegistry,
    organizationControl,
    productResearchRun,
    runUpdates,
    stageUpdates,
    sequence,
    status: () => status,
    checkpoint: () => ({ checkpointStage, checkpointedAt, controlRevision }),
    executionFence: () => ({ leaseOwner, leaseExpiresAt, executionEpoch }),
    collectSnapshot: () => collectOutputSummary,
    tamperCollectSnapshot: () => {
      collectOutputSummary = {
        ...(collectOutputSummary as Record<string, unknown>),
        sha256: '0'.repeat(64),
      };
    },
  };
}

describe('daily product research durable organization control', () => {
  const executeAs = (
    orchestrator: DailyProductResearchOrchestratorService,
    leaseOwner: string,
    expectedControlRevision?: number,
  ) =>
    orchestrator.execute(
      'org-1',
      'run-control-1',
      undefined,
      expectedControlRevision,
      leaseOwner,
    );

  it('does not let a second execution owner steal an active RUNNING lease', async () => {
    const subject = fixture({
      initialStatus: 'RUNNING',
      leaseOwner: 'active-owner',
      leaseExpiresAt: new Date(Date.now() + 60_000),
      executionEpoch: 4,
    });

    await expect(
      executeAs(subject.orchestrator, 'second-owner'),
    ).rejects.toThrow('DAILY_RESEARCH_RUN_CLAIM_CONFLICT');

    expect(subject.connectorRegistry.collect).not.toHaveBeenCalled();
    expect(subject.executionFence()).toMatchObject({
      leaseOwner: 'active-owner',
      executionEpoch: 4,
    });
  });

  it.each([
    ['PAUSE_REQUESTED', 'PAUSED'],
    ['STOP_REQUESTED', 'STOPPED'],
  ] as const)(
    'does not let a second owner clear an active lease when control is %s',
    async (controlState) => {
      const subject = fixture({
        initialStatus: 'RUNNING',
        controlState,
        leaseOwner: 'active-owner',
        leaseExpiresAt: new Date(Date.now() + 60_000),
        executionEpoch: 4,
      });

      await expect(
        executeAs(subject.orchestrator, 'second-owner'),
      ).rejects.toThrow('DAILY_RESEARCH_RUN_CLAIM_CONFLICT');

      expect(subject.status()).toBe('RUNNING');
      expect(subject.connectorRegistry.collect).not.toHaveBeenCalled();
      expect(subject.executionFence()).toMatchObject({
        leaseOwner: 'active-owner',
        executionEpoch: 4,
      });
      expect(subject.runUpdates).toEqual([]);
    },
  );

  it('reclaims an expired RUNNING lease with a higher execution epoch', async () => {
    const subject = fixture({
      initialStatus: 'RUNNING',
      leaseOwner: 'crashed-owner',
      leaseExpiresAt: new Date(Date.now() - 60_000),
      executionEpoch: 4,
    });

    await expect(
      executeAs(subject.orchestrator, 'recovery-owner'),
    ).resolves.toMatchObject({ status: 'PARTIAL' });

    expect(subject.connectorRegistry.collect).toHaveBeenCalledTimes(1);
    expect(subject.runUpdates).toContainEqual(
      expect.objectContaining({
        status: 'RUNNING',
        leaseOwner: 'recovery-owner',
        leaseExpiresAt: expect.any(Date),
        executionEpoch: { increment: 1 },
      }),
    );
    expect(subject.executionFence()).toEqual({
      leaseOwner: null,
      leaseExpiresAt: null,
      executionEpoch: 5,
    });
  });

  it('does not let an expired execution owner persist a stage result or failure', async () => {
    const subject = fixture({ stealDuringCollect: true });

    await expect(executeAs(subject.orchestrator, 'old-owner')).rejects.toThrow(
      'DAILY_RESEARCH_EXECUTION_FENCE_LOST',
    );

    expect(subject.status()).toBe('RUNNING');
    expect(subject.executionFence()).toMatchObject({
      leaseOwner: 'new-owner',
      executionEpoch: 2,
    });
    expect(subject.stageUpdates).toContainEqual({
      stage: 'COLLECT',
      status: 'RUNNING',
    });
    expect(subject.stageUpdates).not.toContainEqual({
      stage: 'COLLECT',
      status: 'COMPLETED',
    });
    expect(subject.stageUpdates).not.toContainEqual({
      stage: 'COLLECT',
      status: 'FAILED',
    });
    expect(subject.runUpdates).not.toContainEqual(
      expect.objectContaining({ status: 'FAILED' }),
    );
  });

  it('does not let an expired execution owner overwrite terminal state', async () => {
    const subject = fixture({ stealAfterFeedbackBoundary: true });

    await expect(executeAs(subject.orchestrator, 'old-owner')).rejects.toThrow(
      'DAILY_RESEARCH_EXECUTION_FENCE_LOST',
    );

    expect(subject.status()).toBe('RUNNING');
    expect(subject.executionFence()).toMatchObject({
      leaseOwner: 'new-owner',
      executionEpoch: 2,
    });
    expect(subject.runUpdates).not.toContainEqual(
      expect.objectContaining({ status: 'PARTIAL' }),
    );
    expect(subject.runUpdates).not.toContainEqual(
      expect.objectContaining({ status: 'FAILED' }),
    );
  });

  it.each([
    ['PAUSE_REQUESTED', 'PAUSED'],
    ['STOP_REQUESTED', 'STOPPED'],
  ] as const)(
    'parks queued work when the claim gate sees %s',
    async (controlState, expectedStatus) => {
      const subject = fixture({ controlState });

      const result = await subject.orchestrator.execute(
        'org-1',
        'run-control-1',
      );

      expect(result.status).toBe(expectedStatus);
      expect(subject.status()).toBe(expectedStatus);
      expect(subject.connectorRegistry.collect).not.toHaveBeenCalled();
      expect(subject.runUpdates).not.toContainEqual(
        expect.objectContaining({ status: 'FAILED' }),
      );
    },
  );

  it('persists an integrity-protected COLLECT snapshot before acknowledging pause', async () => {
    const subject = fixture({ requestAfterCollect: 'PAUSE_REQUESTED' });

    await expect(
      subject.orchestrator.execute('org-1', 'run-control-1'),
    ).resolves.toMatchObject({ status: 'PAUSED' });

    expect(subject.collectSnapshot()).toMatchObject({
      schemaVersion: 'daily-product-research-collect-snapshot/v1',
      connectorResults: expect.any(Array),
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it.each([
    ['PAUSE_REQUESTED', 'PAUSED'],
    ['STOP_REQUESTED', 'STOPPED'],
  ] as const)(
    'checkpoints COLLECT and returns normally when %s wins its safe boundary',
    async (requestAfterCollect, expectedStatus) => {
      const subject = fixture({ requestAfterCollect });

      const result = await subject.orchestrator.execute(
        'org-1',
        'run-control-1',
      );

      expect(result.status).toBe(expectedStatus);
      expect(subject.status()).toBe(expectedStatus);
      expect(subject.checkpoint()).toMatchObject({
        checkpointStage: 'COLLECT',
        checkpointedAt: expect.any(Date),
        controlRevision: 1,
      });
      expect(subject.runUpdates).toContainEqual(
        expect.objectContaining({
          status: expectedStatus,
          checkpointStage: 'COLLECT',
          checkpointedAt: expect.any(Date),
          controlRevision: 1,
          currentStage: null,
        }),
      );
      expect(subject.stageUpdates).toContainEqual({
        stage: 'COLLECT',
        status: 'COMPLETED',
      });
      expect(subject.stageUpdates).not.toContainEqual({
        stage: 'NORMALIZE',
        status: 'RUNNING',
      });
      expect(subject.runUpdates).not.toContainEqual(
        expect.objectContaining({ status: 'FAILED' }),
      );
    },
  );

  it.each([
    ['PAUSE_REQUESTED', 'PAUSED'],
    ['STOP_REQUESTED', 'STOPPED'],
  ] as const)(
    'does not let terminal completion overwrite %s requested after FEEDBACK',
    async (requestAfterFeedbackBoundary, expectedStatus) => {
      const subject = fixture({ requestAfterFeedbackBoundary });

      const result = await subject.orchestrator.execute(
        'org-1',
        'run-control-1',
      );

      expect(result.status).toBe(expectedStatus);
      expect(subject.status()).toBe(expectedStatus);
      expect(subject.checkpoint().checkpointStage).toBe('FEEDBACK');
      expect(subject.runUpdates).not.toContainEqual(
        expect.objectContaining({ status: 'PARTIAL' }),
      );
    },
  );

  it('reuses the durable COLLECT snapshot for a paused checkpoint', async () => {
    const subject = fixture({
      initialStatus: 'PAUSED',
      checkpointStage: 'COLLECT',
      controlState: 'RUNNING',
    });

    const result = await subject.orchestrator.execute('org-1', 'run-control-1');

    expect(result.status).toBe('PARTIAL');
    expect(subject.status()).toBe('PARTIAL');
    expect(subject.connectorRegistry.collect).not.toHaveBeenCalled();
    expect(subject.runUpdates).toContainEqual(
      expect.objectContaining({
        status: 'RUNNING',
      }),
    );
    expect(subject.runUpdates).not.toContainEqual(
      expect.objectContaining({ status: 'FAILED' }),
    );
  });

  it('fails closed without live recollection when the COLLECT snapshot is tampered', async () => {
    const subject = fixture({
      initialStatus: 'PAUSED',
      checkpointStage: 'COLLECT',
      controlState: 'RUNNING',
    });
    subject.tamperCollectSnapshot();

    await expect(
      subject.orchestrator.execute('org-1', 'run-control-1'),
    ).rejects.toThrow('DAILY_RESEARCH_COLLECT_SNAPSHOT_INTEGRITY_FAILED');
    expect(subject.connectorRegistry.collect).not.toHaveBeenCalled();
    expect(subject.status()).toBe('FAILED');
  });

  it.each(['RUNNING', 'FAILED'] as const)(
    'lets a %s Bull retry adopt a newer persisted revision after pause/resume',
    async (initialStatus) => {
      const subject = fixture({
        initialStatus,
        controlRevision: 3,
        controlState: 'RUNNING',
      });
      const executeWithRevision = subject.orchestrator.execute.bind(
        subject.orchestrator,
      ) as unknown as (
        organizationId: string,
        runId: string,
        signal: AbortSignal | undefined,
        expectedControlRevision: number,
      ) => Promise<Record<string, unknown>>;

      const result = await executeWithRevision(
        'org-1',
        'run-control-1',
        undefined,
        1,
      );

      expect(result.status).toBe('PARTIAL');
      expect(result).not.toHaveProperty('staleControlRevision');
      expect(subject.connectorRegistry.collect).toHaveBeenCalledTimes(1);
      expect(subject.runUpdates).toContainEqual(
        expect.objectContaining({
          status: 'RUNNING',
          controlRevision: 3,
        }),
      );
    },
  );

  it('returns stale normally without claiming work when a revisioned job is obsolete', async () => {
    const subject = fixture({ controlRevision: 2 });
    const executeWithRevision = subject.orchestrator.execute.bind(
      subject.orchestrator,
    ) as unknown as (
      organizationId: string,
      runId: string,
      signal: AbortSignal | undefined,
      expectedControlRevision: number,
    ) => Promise<Record<string, unknown>>;

    const result = await executeWithRevision(
      'org-1',
      'run-control-1',
      undefined,
      1,
    );

    expect(result).toMatchObject({
      status: 'PENDING',
      staleControlRevision: true,
      code: 'DAILY_RESEARCH_STALE_CONTROL_REVISION',
      expectedControlRevision: 1,
      actualControlRevision: 2,
    });
    expect(subject.connectorRegistry.collect).not.toHaveBeenCalled();
    expect(subject.runUpdates).toEqual([]);
  });

  it('parks an obsolete job when PAUSE is active instead of leaving it pending as stale', async () => {
    const subject = fixture({
      controlState: 'PAUSE_REQUESTED',
      controlRevision: 2,
    });
    const executeWithRevision = subject.orchestrator.execute.bind(
      subject.orchestrator,
    ) as unknown as (
      organizationId: string,
      runId: string,
      signal: AbortSignal | undefined,
      expectedControlRevision: number,
    ) => Promise<Record<string, unknown>>;

    const result = await executeWithRevision(
      'org-1',
      'run-control-1',
      undefined,
      1,
    );

    expect(result).toMatchObject({ status: 'PAUSED', controlRevision: 2 });
    expect(result).not.toHaveProperty('staleControlRevision');
    expect(subject.status()).toBe('PAUSED');
    expect(subject.connectorRegistry.collect).not.toHaveBeenCalled();
  });
});
