import { AgentRoadmapService } from '../src/features/agent-roadmap/agent-roadmap.service.js';

interface CountArgs {
  where: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function statusIncludes(
  where: Record<string, unknown>,
  status: string,
): boolean {
  const statusFilter = where.status;
  return (
    isRecord(statusFilter) &&
    Array.isArray(statusFilter.in) &&
    statusFilter.in.includes(status)
  );
}

function utcDayOffset(daysAgo: number): Date {
  const now = new Date();
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysAgo,
    ),
  );
}

function createPrismaMock(
  options: {
    progressSnapshots?: number;
    readinessPassedSamples?: number;
    readinessPassedDates?: Date[];
  } = {},
) {
  return {
    agentRun: {
      count: jest.fn().mockImplementation(({ where }: CountArgs) => {
        if (where.agentType === 'PLANNER') return Promise.resolve(1);
        if (where.progress)
          return Promise.resolve(options.progressSnapshots ?? 2);
        if (where.status === 'COMPLETED') return Promise.resolve(98);
        if (statusIncludes(where, 'FAILED')) return Promise.resolve(2);
        if (statusIncludes(where, 'PENDING')) return Promise.resolve(1);
        return Promise.resolve(100);
      }),
    },
    reviewTask: {
      count: jest.fn().mockResolvedValue(5),
    },
    deadLetterJob: {
      count: jest.fn().mockResolvedValue(0),
    },
    agentWorkMemory: {
      count: jest.fn().mockImplementation(({ where }: CountArgs) => {
        const score = where.score;
        if (isRecord(score) && score.gte === 60) return Promise.resolve(8);
        if (isRecord(score) && score.not === null) return Promise.resolve(10);
        return Promise.resolve(12);
      }),
    },
    agentExperienceCard: {
      count: jest.fn().mockResolvedValue(3),
    },
    agentAutonomyDailyMetric: {
      count: jest
        .fn()
        .mockImplementation(({ where }: CountArgs) =>
          Promise.resolve(
            where.passed ? (options.readinessPassedSamples ?? 1) : 2,
          ),
        ),
      findMany: jest.fn().mockResolvedValue(
        (options.readinessPassedDates ?? [utcDayOffset(0)]).map((date) => ({
          date,
        })),
      ),
    },
    auditLog: {
      count: jest.fn().mockImplementation(({ where }: CountArgs) => {
        if (where.action === 'agent-autonomy.awareness-recorded')
          return Promise.resolve(1);
        if (where.action === 'agent-autonomy.suggestion-created')
          return Promise.resolve(4);
        if (where.action === 'agent-autonomy.suggestion-scheduled')
          return Promise.resolve(2);
        if (where.action === 'agent-proxy.unauthorized')
          return Promise.resolve(0);
        return Promise.resolve(0);
      }),
    },
    teamTask: {
      count: jest.fn().mockResolvedValue(1),
    },
    automationFlow: {
      count: jest.fn().mockResolvedValue(1),
    },
    channelConnection: {
      count: jest.fn().mockResolvedValue(1),
    },
    featureFlag: {
      findUnique: jest.fn().mockResolvedValue({ enabled: true, orgIds: [] }),
      upsert: jest.fn().mockResolvedValue({ enabled: true, orgIds: [] }),
    },
  };
}

function createService(
  options: {
    config?: Record<string, string | undefined>;
    progressSnapshots?: number;
    readinessPassedSamples?: number;
    readinessPassedDates?: Date[];
  } = {},
) {
  const prisma = createPrismaMock({
    progressSnapshots: options.progressSnapshots,
    readinessPassedSamples: options.readinessPassedSamples,
    readinessPassedDates: options.readinessPassedDates,
  });
  const config = {
    get: jest.fn().mockImplementation((key: string) => {
      const values: Record<string, string> = {
        AGENT_BASE_URL: 'http://agent.local',
        AGENT_API_KEY: 'agent-key',
        AGENT_WEBHOOK_SECRET: 'webhook-secret-min-16',
      };
      if (
        options.config &&
        Object.prototype.hasOwnProperty.call(options.config, key)
      ) {
        return options.config[key];
      }
      return values[key];
    }),
  };
  const queue = {
    getJobCounts: jest.fn().mockResolvedValue({
      waiting: 0,
      active: 0,
      delayed: 0,
      failed: 0,
      completed: 10,
      paused: 0,
    }),
  };
  const autonomy = {
    handlePlatformEvent: jest.fn().mockResolvedValue({
      awarenessTaskId: 'awareness-task-1',
      suggestionNotificationId: 'suggestion-notification-1',
    }),
    scheduleSuggestion: jest.fn().mockResolvedValue({
      taskId: 'scheduled-task-1',
      flowId: 'scheduled-flow-1',
    }),
    prepareListingBatch: jest.fn().mockResolvedValue({
      productCount: 1,
      agentRunId: 'operator-run-1',
      flowId: 'operator-flow-1',
      reviewNotificationId: 'review-notification-1',
      publish: { status: 'pending_confirmation', productIds: ['product-1'] },
    }),
  };
  const agentMemory = {
    recordWorkMemory: jest.fn().mockResolvedValue({ id: 'work-memory-1' }),
    learnFromReview: jest.fn().mockResolvedValue({ id: 'experience-card-1' }),
    computeReadiness: jest.fn().mockResolvedValue({
      passed: false,
      metrics: {
        taskSuccessRate: 98,
        suggestionAdoptionRate: 100,
        autonomousCompletionRate: 80,
        memoryQueryAccuracy: 100,
        unauthorizedActionCount: 0,
      },
    }),
  };
  const agentRuns = {
    recordEvent: jest.fn().mockResolvedValue({ recorded: true }),
  };
  const agentPermissions = {
    listActions: jest.fn().mockReturnValue([
      { name: 'profit.analyze', permissionLevel: 1 },
      { name: 'product.research', permissionLevel: 1 },
      { name: 'keyword.analyze', permissionLevel: 1 },
      { name: 'trend.analyze', permissionLevel: 1 },
      { name: 'listing.draft', permissionLevel: 2 },
      { name: 'image.generate', permissionLevel: 2 },
      { name: 'notification.suggest', permissionLevel: 3 },
      { name: 'task.schedule', permissionLevel: 3 },
      { name: 'operator.prepare_listing_batch', permissionLevel: 3 },
      { name: 'product.update', permissionLevel: 3 },
      { name: 'task.create', permissionLevel: 3 },
      { name: 'store.product.update', permissionLevel: 4 },
      { name: 'listing.publish', permissionLevel: 4 },
      { name: 'order.process', permissionLevel: 4 },
      { name: 'order.refund', permissionLevel: 4 },
      { name: 'price.adjust', permissionLevel: 4 },
      { name: 'ads.campaign.update', permissionLevel: 4 },
      { name: 'payment.execute', permissionLevel: 4 },
      { name: 'ozon.product.update', permissionLevel: 4 },
      { name: 'ozon.listing.publish', permissionLevel: 4 },
      { name: 'ozon.price.update', permissionLevel: 4 },
      { name: 'ozon.stock.update', permissionLevel: 4 },
      { name: 'ozon.order.refund', permissionLevel: 4 },
      { name: 'ozon.ads.update', permissionLevel: 4 },
    ]),
  };
  const reviewService = {
    createFromAgentRun: jest.fn().mockResolvedValue({
      id: 'review-task-1',
      status: 'APPROVED',
      autoApproved: true,
      score: 92,
      threshold: 60,
    }),
  };

  return {
    service: new AgentRoadmapService(
      prisma as unknown as ConstructorParameters<typeof AgentRoadmapService>[0],
      config as unknown as ConstructorParameters<typeof AgentRoadmapService>[1],
      queue as unknown as ConstructorParameters<typeof AgentRoadmapService>[2],
      queue as unknown as ConstructorParameters<typeof AgentRoadmapService>[3],
      autonomy as unknown as ConstructorParameters<
        typeof AgentRoadmapService
      >[4],
      agentMemory as unknown as ConstructorParameters<
        typeof AgentRoadmapService
      >[5],
      agentRuns as unknown as ConstructorParameters<
        typeof AgentRoadmapService
      >[6],
      agentPermissions as unknown as ConstructorParameters<
        typeof AgentRoadmapService
      >[7],
      reviewService as unknown as ConstructorParameters<
        typeof AgentRoadmapService
      >[8],
      {
        run: jest.fn(
          (_organizationId: string, operation: (tx: unknown) => unknown) =>
            operation(prisma),
        ),
      } as unknown as ConstructorParameters<typeof AgentRoadmapService>[9],
    ),
    prisma,
    autonomy,
    agentMemory,
    agentRuns,
    agentPermissions,
    reviewService,
  };
}

describe('AgentRoadmapService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    if (originalFetch) {
      global.fetch = originalFetch;
    }
    jest.restoreAllMocks();
  });

  it('returns all 20 phases from backend facts and keeps stage 20 strict', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'ok',
          integration: 'enabled',
          mockMode: false,
        }),
    } as Response);
    const { service } = createService();

    const report = await service.getRoadmap({
      sub: 'user-1',
      email: 'qa@example.com',
      orgId: 'org-1',
    });

    expect(report.phases).toHaveLength(20);
    expect(report.contract.version).toBe('1.3.0');
    expect(report.contract.taskTypes).toContain('plan_and_execute');
    expect(report.operationSafety).toEqual(
      expect.objectContaining({
        connectedStoreChannels: 1,
        externalWriteAdapterConnected: true,
        highRiskActionMode: 'human_confirmation_required',
      }),
    );
    expect(report.operationSafety.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'store.product.update',
          approvalStatus: 'notification_center_ready',
          externalExecutionStatus: 'guarded_adapter_connected',
        }),
        expect.objectContaining({
          action: 'price.adjust',
          approvalStatus: 'notification_center_ready',
          externalExecutionStatus: 'guarded_adapter_connected',
        }),
        expect.objectContaining({
          action: 'ozon.price.update',
          approvalStatus: 'notification_center_ready',
          externalExecutionStatus: 'guarded_adapter_connected',
        }),
        expect.objectContaining({
          action: 'ozon.stock.update',
          approvalStatus: 'notification_center_ready',
          externalExecutionStatus: 'guarded_adapter_connected',
        }),
      ]),
    );
    const agentHealth = report.liveChecks.find(
      (check) => check.key === 'agent-health',
    );
    expect(agentHealth?.status).toBe('ok');
    expect(agentHealth?.detail).toContain('mockMode=false');
    expect(report.phases[0]).toEqual(
      expect.objectContaining({ id: 1, status: 'passed' }),
    );
    expect(report.phases[1]).toEqual(
      expect.objectContaining({ id: 2, status: 'passed', blockers: [] }),
    );
    expect(report.phases[2]).toEqual(
      expect.objectContaining({ id: 3, status: 'passed', blockers: [] }),
    );
    expect(report.phases[2].evidence).toContain(
      '本页展示结构化过程视图：scenePlan、qualityRationale、verifier、failureReason',
    );
    expect(report.phases[4]).toEqual(
      expect.objectContaining({ id: 5, status: 'passed', blockers: [] }),
    );
    expect(report.phases[6]).toEqual(
      expect.objectContaining({ id: 7, status: 'passed', blockers: [] }),
    );
    expect(report.phases[8]).toEqual(
      expect.objectContaining({ id: 9, status: 'passed', blockers: [] }),
    );
    expect(report.phases[9]).toEqual(
      expect.objectContaining({ id: 10, status: 'passed', blockers: [] }),
    );
    expect(report.phases[10]).toEqual(
      expect.objectContaining({ id: 11, status: 'passed', blockers: [] }),
    );
    expect(report.phases[11]).toEqual(
      expect.objectContaining({ id: 12, status: 'passed', blockers: [] }),
    );
    expect(report.phases[15]).toEqual(
      expect.objectContaining({ id: 16, status: 'passed', blockers: [] }),
    );
    expect(report.phases[16]).toEqual(
      expect.objectContaining({ id: 17, status: 'passed', blockers: [] }),
    );
    expect(report.phases[16].evidence).toEqual(
      expect.arrayContaining([
        expect.stringContaining('order.refund'),
        expect.stringContaining('ozon.order.refund'),
        'unconnectedWriteActions=none',
      ]),
    );
    expect(report.phases[19]).toEqual(
      expect.objectContaining({ id: 20, status: 'partial' }),
    );
    expect(report.phases[19].blockers).toContain(
      '没有连续两周 readiness passed 样本',
    );
  });

  it('does not pass the contract phase when the agent is still mock mode', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'ok',
          integration: 'enabled',
          mockMode: true,
        }),
    } as Response);
    const { service } = createService();

    const report = await service.getRoadmap({
      sub: 'user-1',
      email: 'qa@example.com',
      orgId: 'org-1',
    });

    expect(report.phases[0].status).toBe('backend');
    const agentHealth = report.liveChecks.find(
      (check) => check.key === 'agent-health',
    );
    expect(agentHealth?.status).toBe('warn');
  });

  it('keeps event push partial when webhook secret is missing', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'ok',
          integration: 'enabled',
          mockMode: false,
        }),
    } as Response);
    const { service } = createService({
      config: { AGENT_WEBHOOK_SECRET: undefined },
    });

    const report = await service.getRoadmap({
      sub: 'user-1',
      email: 'qa@example.com',
      orgId: 'org-1',
    });

    expect(report.phases[1]).toEqual(
      expect.objectContaining({ id: 2, status: 'partial' }),
    );
    expect(report.phases[1].blockers).toContain('AGENT_WEBHOOK_SECRET 未配置');
  });

  it('does not pass stage 20 when 14 readiness samples are not consecutive', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'ok',
          integration: 'enabled',
          mockMode: false,
        }),
    } as Response);
    const nonConsecutiveDates = [
      utcDayOffset(0),
      utcDayOffset(2),
      utcDayOffset(3),
      utcDayOffset(4),
      utcDayOffset(5),
      utcDayOffset(6),
      utcDayOffset(7),
      utcDayOffset(8),
      utcDayOffset(9),
      utcDayOffset(10),
      utcDayOffset(11),
      utcDayOffset(12),
      utcDayOffset(13),
      utcDayOffset(14),
    ];
    const { service } = createService({
      readinessPassedSamples: 14,
      readinessPassedDates: nonConsecutiveDates,
    });

    const report = await service.getRoadmap({
      sub: 'user-1',
      email: 'qa@example.com',
      orgId: 'org-1',
    });

    expect(report.metrics.readinessPassedSamples).toBe(14);
    expect(report.metrics.readinessConsecutivePassedDays).toBe(1);
    expect(report.phases[19]).toEqual(
      expect.objectContaining({ id: 20, status: 'partial' }),
    );
    expect(report.phases[19].evidence).toContain(
      'readinessConsecutivePassedDays=1/14',
    );
  });

  it('checks existing acceptance evidence without creating synthetic records or enabling autonomy', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'ok',
          integration: 'enabled',
          mockMode: false,
        }),
    } as Response);
    const { service, prisma, autonomy, agentMemory, agentRuns, reviewService } =
      createService();

    const result = await service.runAcceptanceEvidence({
      sub: 'user-1',
      email: 'qa@example.com',
      orgId: 'org-1',
    });

    expect(prisma.featureFlag.upsert).not.toHaveBeenCalled();
    expect(autonomy.handlePlatformEvent).not.toHaveBeenCalled();
    expect(autonomy.scheduleSuggestion).not.toHaveBeenCalled();
    expect(autonomy.prepareListingBatch).not.toHaveBeenCalled();
    expect(agentRuns.recordEvent).not.toHaveBeenCalled();
    expect(reviewService.createFromAgentRun).not.toHaveBeenCalled();
    expect(agentMemory.recordWorkMemory).not.toHaveBeenCalled();
    expect(agentMemory.learnFromReview).not.toHaveBeenCalled();
    expect(agentMemory.computeReadiness).not.toHaveBeenCalled();
    expect(result.mutationPerformed).toBe(false);
    expect(result.message).toContain('existing persisted evidence');
    expect(result.report.phases).toHaveLength(20);
    expect(result.report.phases[19]).toEqual(
      expect.objectContaining({ id: 20, status: 'partial' }),
    );
  });
});
