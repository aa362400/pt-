import { AgentMemoryService } from '../src/features/agent-memory/agent-memory.service.js';

function createService() {
  const prisma = {
    agentWorkMemory: {
      create: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'memory-1', ...data }),
        ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'memory-1',
          taskType: 'LISTING_OPTIMIZER',
          productName: 'Travel Mug',
          status: 'COMPLETED',
          score: 91,
          reviewStatus: 'APPROVED',
          durationSeconds: 12.5,
          metadata: { governance: { trustStatus: 'trusted' } },
          createdAt: new Date('2026-07-03T10:00:00.000Z'),
        },
      ]),
      count: jest.fn().mockResolvedValue(10),
    },
    agentExperienceCard: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'experience-1', ...data }),
        ),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'experience-1',
          category: 'style',
          taskType: 'IMAGE_CREATIVE',
          title: 'Avoid heavy shadows',
          lesson:
            'White background images were rejected because shadows were too heavy.',
          evidence: { governance: { trustStatus: 'trusted' } },
          createdAt: new Date('2026-07-04T10:00:00.000Z'),
        },
      ]),
    },
    agentAutonomyDailyMetric: {
      upsert: jest
        .fn()
        .mockImplementation(({ create }) =>
          Promise.resolve({ id: 'metric-1', ...create }),
        ),
    },
    auditLog: {
      count: jest.fn().mockImplementation(({ where }) => {
        if (where.action === 'agent-autonomy.suggestion-created') return 10;
        if (where.action === 'agent-autonomy.suggestion-scheduled') return 6;
        if (where.action?.startsWith === 'agent-proxy.') return 0;
        return 0;
      }),
    },
  };
  const tenantDatabase = {
    run: jest
      .fn()
      .mockImplementation(
        (_organizationId: string, operation: (tx: typeof prisma) => unknown) =>
          operation(prisma),
      ),
  };
  return {
    service: new AgentMemoryService(prisma as any, tenantDatabase as any),
    prisma,
    tenantDatabase,
  };
}

describe('AgentMemoryService', () => {
  it('persists structured work memory by org instead of storing it as a task note', async () => {
    const { service, prisma, tenantDatabase } = createService();

    const record = await service.recordWorkMemory({
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      agentRunId: 'run-1',
      taskType: 'LISTING_OPTIMIZER',
      productName: 'Travel Mug',
      productId: 'product-1',
      status: 'COMPLETED',
      score: 91,
      reviewStatus: 'APPROVED',
      durationSeconds: 12.5,
      result: { title: 'Insulated Travel Mug' },
      metadata: { source: 'agent-run-worker' },
    });

    expect(record.id).toBe('memory-1');
    expect(tenantDatabase.run).toHaveBeenCalledWith(
      'org-1',
      expect.any(Function),
    );
    expect(prisma.agentWorkMemory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        agentRunId: 'run-1',
        taskType: 'LISTING_OPTIMIZER',
        productName: 'Travel Mug',
        status: 'COMPLETED',
        score: 91,
        metadata: expect.objectContaining({
          governance: expect.objectContaining({
            sourceType: 'agent_run',
            sourceId: 'run-1',
            version: 1,
            trustStatus: 'trusted',
            contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          }),
        }),
      }),
    });
  });

  it('answers product work-history queries from durable memory records', async () => {
    const { service, prisma } = createService();

    const result = await service.queryWorkMemory({
      organizationId: 'org-1',
      productName: 'Travel Mug',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-08T00:00:00.000Z',
      limit: 20,
    });

    expect(result.items).toHaveLength(1);
    expect(result.answer).toContain('Travel Mug');
    expect(result.answer).toContain('LISTING_OPTIMIZER');
    expect(prisma.agentWorkMemory.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        productName: { contains: 'Travel Mug', mode: 'insensitive' },
        createdAt: {
          gte: new Date('2026-07-01T00:00:00.000Z'),
          lte: new Date('2026-07-08T00:00:00.000Z'),
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 60,
    });
  });

  it('does not return quarantined or expired memory to the agent', async () => {
    const { service, prisma } = createService();
    prisma.agentWorkMemory.findMany.mockResolvedValue([
      {
        id: 'quarantined',
        taskType: 'LISTING_OPTIMIZER',
        status: 'COMPLETED',
        metadata: { governance: { trustStatus: 'quarantined' } },
        createdAt: new Date(),
      },
      {
        id: 'expired',
        taskType: 'LISTING_OPTIMIZER',
        status: 'COMPLETED',
        metadata: {
          governance: {
            trustStatus: 'trusted',
            validUntil: '2020-01-01T00:00:00.000Z',
          },
        },
        createdAt: new Date(),
      },
      {
        id: 'trusted',
        taskType: 'LISTING_OPTIMIZER',
        status: 'COMPLETED',
        metadata: { governance: { trustStatus: 'trusted' } },
        createdAt: new Date(),
      },
    ]);

    const result = await service.queryWorkMemory({
      organizationId: 'org-1',
    });

    expect(result.items).toHaveLength(1);
    expect((result.items[0] as { id: string }).id).toBe('trusted');
  });

  it('turns review rejection into an org-scoped experience card', async () => {
    const { service, prisma } = createService();

    const card = await service.learnFromReview({
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      sourceReviewTaskId: 'review-1',
      taskType: 'IMAGE_CREATIVE',
      entityType: 'IMAGE_GENERATION',
      score: 42,
      notes: 'White background rejected because the shadow is too heavy.',
    });

    expect(card.id).toBe('experience-1');
    expect(prisma.agentExperienceCard.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        sourceReviewTaskId: 'review-1',
        taskType: 'IMAGE_CREATIVE',
        category: 'style',
        lesson: expect.stringContaining('shadow is too heavy'),
      }),
    });
  });

  it('computes stage-20 readiness metrics from memory and audit facts', async () => {
    const { service, prisma } = createService();

    const report = await service.computeReadiness({
      organizationId: 'org-1',
      date: '2026-07-08',
      totalTasks: 100,
      successfulTasks: 98,
      autonomousCompletions: 82,
      memoryQaTotal: 5,
      memoryQaCorrect: 5,
    });

    expect(report.passed).toBe(true);
    expect(report.metrics).toEqual(
      expect.objectContaining({
        taskSuccessRate: 98,
        suggestionAdoptionRate: 60,
        autonomousCompletionRate: 82,
        memoryQueryAccuracy: 100,
        unauthorizedActionCount: 0,
      }),
    );
    expect(prisma.agentAutonomyDailyMetric.upsert).toHaveBeenCalledWith({
      where: {
        organizationId_date: {
          organizationId: 'org-1',
          date: new Date('2026-07-08T00:00:00.000Z'),
        },
      },
      create: expect.objectContaining({
        organizationId: 'org-1',
        taskSuccessRate: 98,
        suggestionAdoptionRate: 60,
        autonomousCompletionRate: 82,
        memoryQueryAccuracy: 100,
        unauthorizedActionCount: 0,
      }),
      update: expect.objectContaining({
        taskSuccessRate: 98,
        suggestionAdoptionRate: 60,
        autonomousCompletionRate: 82,
        memoryQueryAccuracy: 100,
        unauthorizedActionCount: 0,
      }),
    });
  });

  it('derives task success rate from durable memory when explicit success counts are omitted', async () => {
    const { service, prisma } = createService();
    prisma.agentWorkMemory.count = jest.fn().mockImplementation(({ where }) => {
      if (where.status) return 8;
      return 10;
    });

    const report = await service.computeReadiness({
      organizationId: 'org-1',
      date: '2026-07-08',
      autonomousCompletions: 8,
      memoryQaTotal: 1,
      memoryQaCorrect: 1,
    });

    expect(report.metrics.taskSuccessRate).toBe(80);
    expect(prisma.agentWorkMemory.count).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        createdAt: {
          gte: new Date('2026-07-08T00:00:00.000Z'),
          lt: new Date('2026-07-09T00:00:00.000Z'),
        },
        status: { in: ['COMPLETED', 'SUCCEEDED', 'SUCCESS'] },
      },
    });
  });

  it('updates durable work memory with the final human review outcome', async () => {
    const { service, prisma } = createService();

    const result = await (service as any).updateReviewOutcome({
      organizationId: 'org-1',
      agentRunId: 'run-1',
      reviewStatus: 'REWORK',
      reviewNotes: 'Listing title needs the real material.',
    });

    expect(result).toEqual({ count: 1 });
    expect(prisma.agentWorkMemory.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        agentRunId: 'run-1',
      },
      data: {
        reviewStatus: 'REWORK',
        reviewNotes: 'Listing title needs the real material.',
      },
    });
  });
});
