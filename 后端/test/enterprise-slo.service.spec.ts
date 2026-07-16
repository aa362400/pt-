import { EnterpriseSloService } from '../src/features/enterprise-slo/enterprise-slo.service.js';

function dailySnapshot(date: string, passed = true) {
  return {
    id: `snapshot-${date}`,
    organizationId: 'org-1',
    date: new Date(`${date}T00:00:00.000Z`),
    totalTasks: 100,
    successfulTasks: 99,
    taskSuccessRate: 99,
    qualitySamples: 20,
    qualityPassed: 20,
    qualityPassRate: 100,
    autonomousCompletions: 90,
    autonomousCompletionRate: 90,
    totalSuggestions: 10,
    acceptedSuggestions: 6,
    suggestionAdoptionRate: 60,
    unauthorizedActionCount: 0,
    blockedUnauthorizedAttemptCount: 0,
    p95LatencyMs: 1200,
    queueBacklog: 0,
    queueEvidenceAvailable: true,
    unresolvedDeadLetters: 0,
    totalCostAmount: { toString: () => '1.5' },
    costSampleCount: 100,
    averageCostPerTask: { toString: () => '0.015' },
    errorBudgetConsumed: 50,
    dataComplete: true,
    missingEvidence: [],
    passed,
    evidence: { source: 'database-and-bullmq' },
    createdAt: new Date(`${date}T01:00:00.000Z`),
    updatedAt: new Date(`${date}T01:00:00.000Z`),
  };
}

function createTenantDatabase<T>(transaction: T) {
  return {
    run: jest
      .fn()
      .mockImplementation(
        (_organizationId: string, operation: (tx: T) => unknown) =>
          operation(transaction),
      ),
  };
}

function createService(snapshots: ReturnType<typeof dailySnapshot>[] = []) {
  const prisma = {
    enterpriseSloDailySnapshot: {
      findMany: jest.fn().mockResolvedValue(snapshots),
      upsert: jest.fn(),
    },
  };
  return {
    service: new EnterpriseSloService(
      prisma as never,
      createTenantDatabase(prisma) as never,
    ),
    prisma,
  };
}

describe('EnterpriseSloService 14-day gate', () => {
  it('finalizes the previous business day whenever scheduled collection runs', async () => {
    const prisma = {
      organization: {
        findMany: jest.fn().mockResolvedValue([{ id: 'org-1' }]),
      },
    };
    const service = new EnterpriseSloService(
      prisma as never,
      createTenantDatabase(prisma) as never,
    );
    const collect = jest
      .spyOn(service, 'collectSnapshot')
      .mockResolvedValue({} as never);
    const now = new Date('2026-07-13T12:00:00.000Z');

    await service.collectAllOrganizations(now);

    expect(collect).toHaveBeenCalledTimes(2);
    expect(collect).toHaveBeenNthCalledWith(
      1,
      'org-1',
      new Date('2026-07-12T12:00:00.000Z'),
    );
    expect(collect).toHaveBeenNthCalledWith(2, 'org-1', now);
  });

  it('does not count a completed run with any review task as autonomous', async () => {
    const prisma = {
      workspace: {
        findFirst: jest.fn().mockResolvedValue({ timezone: 'UTC' }),
      },
      agentRun: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'run-1',
            status: 'COMPLETED',
            startedAt: new Date('2026-07-13T01:00:00Z'),
            finishedAt: new Date('2026-07-13T01:00:01Z'),
            costAmount: 0.01,
          },
          {
            id: 'run-2',
            status: 'COMPLETED',
            startedAt: new Date('2026-07-13T02:00:00Z'),
            finishedAt: new Date('2026-07-13T02:00:01Z'),
            costAmount: 0.01,
          },
        ]),
      },
      reviewTask: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ entityId: 'run-2' }]),
      },
      auditLog: {
        count: jest
          .fn()
          .mockImplementation(({ where }) =>
            Promise.resolve(
              where.action === 'agent-autonomy.suggestion-created' ||
                where.action === 'agent-autonomy.suggestion-scheduled'
                ? 1
                : 0,
            ),
          ),
      },
      deadLetterJob: { count: jest.fn().mockResolvedValue(0) },
      enterpriseSloDailySnapshot: {
        upsert: jest.fn().mockImplementation(({ create }) => create),
      },
      alert: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'alert-1', ...data }),
          ),
        update: jest.fn(),
      },
    };
    const service = new EnterpriseSloService(
      prisma as never,
      createTenantDatabase(prisma) as never,
    );

    const snapshot = await service.collectSnapshot(
      'org-1',
      new Date('2026-07-13T12:00:00Z'),
      'UTC',
    );

    expect(snapshot.autonomousCompletions).toBe(1);
    expect(snapshot.autonomousCompletionRate).toBe(50);
    expect(snapshot.unauthorizedActionCount).toBe(0);
    expect(snapshot.blockedUnauthorizedAttemptCount).toBe(0);
    expect(prisma.alert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        source: 'enterprise-slo',
        severity: 'WARNING',
        status: 'OPEN',
      }),
    });
  });

  it('separates blocked unauthorized attempts from successful unauthorized execution', async () => {
    const prisma = {
      workspace: {
        findFirst: jest.fn().mockResolvedValue({ timezone: 'UTC' }),
      },
      agentRun: { findMany: jest.fn().mockResolvedValue([]) },
      reviewTask: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: {
        count: jest.fn().mockImplementation(({ where }) => {
          if (where.action === 'agent-proxy.unauthorized')
            return Promise.resolve(3);
          if (where.action === 'agent-proxy.unauthorized-executed')
            return Promise.resolve(0);
          return Promise.resolve(0);
        }),
      },
      deadLetterJob: { count: jest.fn().mockResolvedValue(0) },
      enterpriseSloDailySnapshot: {
        upsert: jest.fn().mockImplementation(({ create }) => create),
      },
      alert: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'alert-1' }),
        update: jest.fn(),
      },
    };
    const service = new EnterpriseSloService(
      prisma as never,
      createTenantDatabase(prisma) as never,
    );

    const snapshot = await service.collectSnapshot(
      'org-1',
      new Date('2026-07-13T12:00:00Z'),
      'UTC',
    );

    expect(snapshot.blockedUnauthorizedAttemptCount).toBe(3);
    expect(snapshot.unauthorizedActionCount).toBe(0);
    expect(snapshot.evidence).toEqual(
      expect.objectContaining({ blockedUnauthorizedAttempts: 3 }),
    );
  });

  it('uses the organization business day instead of UTC midnight', () => {
    const { service } = createService();

    const window = (service as any).businessDay(
      new Date('2026-07-12T17:15:00.000Z'),
      'Asia/Shanghai',
    );

    expect(window.label.toISOString()).toBe('2026-07-13T00:00:00.000Z');
    expect(window.start.toISOString()).toBe('2026-07-12T16:00:00.000Z');
    expect(window.end.toISOString()).toBe('2026-07-13T16:00:00.000Z');
  });

  it('keeps a single passing day in observing state', async () => {
    const { service } = createService([dailySnapshot('2026-07-12')]);

    const report = await service.getReport('org-1', {
      now: new Date('2026-07-13T12:00:00.000Z'),
      collectToday: false,
      timezone: 'UTC',
    });

    expect(report.status).toBe('observing');
    expect(report.claimAllowed).toBe(false);
    expect(report.observedDays).toBe(1);
    expect(report.requiredDays).toBe(14);
  });

  it('excludes the in-progress business day from the completed 14-day claim window', async () => {
    const snapshots = [
      dailySnapshot('2026-07-13', false),
      ...Array.from({ length: 14 }, (_, index) =>
        dailySnapshot(
          new Date(Date.UTC(2026, 6, 12 - index)).toISOString().slice(0, 10),
        ),
      ),
    ];
    const { service } = createService(snapshots);

    const report = await service.getReport('org-1', {
      now: new Date('2026-07-13T12:00:00.000Z'),
      collectToday: false,
      timezone: 'UTC',
    });

    expect(report.status).toBe('passed');
    expect(report.claimAllowed).toBe(true);
    expect(report.days).toHaveLength(14);
    expect(report.currentDay?.date.toISOString()).toBe(
      '2026-07-13T00:00:00.000Z',
    );
    expect(
      report.days.some((day) =>
        day.date.toISOString().startsWith('2026-07-13'),
      ),
    ).toBe(false);
  });

  it('rejects fourteen passing snapshots when calendar dates contain a gap', async () => {
    const snapshots = Array.from({ length: 14 }, (_, index) =>
      dailySnapshot(
        new Date(Date.UTC(2026, 6, 12 - index - (index >= 7 ? 1 : 0)))
          .toISOString()
          .slice(0, 10),
      ),
    );
    const { service } = createService(snapshots);

    const report = await service.getReport('org-1', {
      now: new Date('2026-07-13T12:00:00.000Z'),
      collectToday: false,
      timezone: 'UTC',
    });

    expect(report.claimAllowed).toBe(false);
    expect(report.status).toBe('observing');
    expect(report.consecutiveObservedDays).toBe(7);
  });

  it('allows the claim only after fourteen consecutive complete passing days', async () => {
    const snapshots = Array.from({ length: 14 }, (_, index) =>
      dailySnapshot(
        new Date(Date.UTC(2026, 6, 12 - index)).toISOString().slice(0, 10),
      ),
    );
    const { service } = createService(snapshots);

    const report = await service.getReport('org-1', {
      now: new Date('2026-07-13T12:00:00.000Z'),
      collectToday: false,
      timezone: 'UTC',
    });

    expect(report.status).toBe('passed');
    expect(report.claimAllowed).toBe(true);
    expect(report.consecutiveObservedDays).toBe(14);
    expect(report.consecutivePassedDays).toBe(14);
  });

  it('fails a complete fourteen-day window when any daily snapshot failed', async () => {
    const snapshots = Array.from({ length: 14 }, (_, index) =>
      dailySnapshot(
        new Date(Date.UTC(2026, 6, 12 - index)).toISOString().slice(0, 10),
        index !== 5,
      ),
    );
    const { service } = createService(snapshots);

    const report = await service.getReport('org-1', {
      now: new Date('2026-07-13T12:00:00.000Z'),
      collectToday: false,
      timezone: 'UTC',
    });

    expect(report.status).toBe('failed');
    expect(report.claimAllowed).toBe(false);
    expect(report.consecutiveObservedDays).toBe(14);
  });
});
