import { AgentRunWorker } from '../src/workers/agent-run.worker.js';
import { UnrecoverableError } from 'bullmq';

function createWorker(overrides: Record<string, unknown> = {}) {
  const prisma = {
    agentRun: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ agentType: 'GENERAL_ASSISTANT' }),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'regenerated-run-1', ...data }),
        ),
    },
    agentTransition: {
      create: jest.fn().mockResolvedValue({ id: 'transition-1' }),
    },
    outboxEvent: {
      create: jest.fn().mockResolvedValue({}),
    },
    routerDecisionLog: {
      upsert: jest.fn().mockResolvedValue({ id: 'route-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    reviewTask: {
      aggregate: jest.fn().mockResolvedValue({
        _sum: { autoRegenerations: 0 },
      }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const deadLetterQueue = { add: jest.fn() };
  const agentRunQueue = { add: jest.fn() };
  const reviewService = {
    createFromAgentRun: jest.fn().mockResolvedValue({
      id: 'review-1',
      status: 'PENDING',
      autoApproved: false,
    }),
  };
  const agentRunsCounter = { inc: jest.fn() };
  const qualityCounter = { inc: jest.fn() };
  const memoryService = { recordWorkMemory: jest.fn().mockResolvedValue({}) };
  const tenantDatabase = {
    run: jest
      .fn()
      .mockImplementation(
        (_organizationId: string, operation: (tx: typeof prisma) => unknown) =>
          operation(prisma),
      ),
  };
  const lifecycle = {
    applyEvent: jest.fn().mockResolvedValue({ applied: true }),
  };

  const worker = new AgentRunWorker(
    prisma as any,
    {} as any,
    reviewService as any,
    deadLetterQueue as any,
    { get: jest.fn().mockReturnValue(60) } as any,
    agentRunsCounter as any,
    qualityCounter as any,
    memoryService as any,
    tenantDatabase as any,
    lifecycle as any,
  );

  return {
    prisma,
    deadLetterQueue,
    agentRunQueue,
    reviewService,
    agentRunsCounter,
    qualityCounter,
    memoryService,
    lifecycle,
    worker,
    ...overrides,
  };
}

describe('AgentRunWorker failed jobs', () => {
  it('records durable work memory when an agent run completes', async () => {
    const { worker, prisma, memoryService } = createWorker();
    const run = {
      id: 'run-1',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      agentType: 'LISTING_OPTIMIZER',
      input: {
        productId: 'product-1',
        productName: 'Travel Mug',
        platform: 'amazon',
      },
    };
    prisma.agentRun.findFirst = jest.fn().mockResolvedValue(run);
    prisma.agentRun.update = jest.fn().mockResolvedValue({});
    (prisma as any).user = {
      findUnique: jest.fn().mockResolvedValue({ locale: 'zh-CN' }),
    };
    const agentProvider = {
      runListingGeneration: jest.fn().mockResolvedValue({
        title: 'Insulated Travel Mug',
        description: 'Keeps drinks warm.',
        bulletPoints: ['Leakproof'],
        keywords: ['travel mug'],
      }),
    };
    (worker as any).agentProvider = agentProvider;
    (worker as any).reviewService = { createFromAgentRun: jest.fn() };

    await worker.process({
      id: 'job-1',
      data: {
        agentRunId: 'run-1',
        organizationId: 'org-1',
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      },
      updateProgress: jest.fn(),
    } as any);

    expect(agentProvider.runListingGeneration).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      }),
    );

    expect(memoryService.recordWorkMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        agentRunId: 'run-1',
        productId: 'product-1',
        productName: 'Travel Mug',
        taskType: 'LISTING_OPTIMIZER',
        status: 'COMPLETED',
        result: expect.objectContaining({
          title: 'Insulated Travel Mug',
        }),
      }),
    );
  });

  it('rethrows provider failures so BullMQ can retry the queue job', async () => {
    const { worker, prisma, memoryService, agentRunsCounter, deadLetterQueue } =
      createWorker();
    const run = {
      id: 'run-provider-down',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      agentType: 'GENERAL_ASSISTANT',
      input: { prompt: '请分析我的 Ozon 店铺' },
    };
    prisma.agentRun.findFirst = jest.fn().mockResolvedValue(run);
    prisma.agentRun.update = jest.fn().mockResolvedValue({});
    (prisma as any).user = {
      findUnique: jest.fn().mockResolvedValue({ locale: 'zh-CN' }),
    };
    (worker as any).agentProvider = {
      runAssistant: jest.fn().mockRejectedValue(new Error('fetch failed')),
    };

    await expect(
      worker.process({
        id: 'job-provider-down',
        data: { agentRunId: run.id, organizationId: 'org-1' },
        updateProgress: jest.fn(),
      } as any),
    ).rejects.toThrow('fetch failed');

    expect(prisma.agentRun.updateMany).toHaveBeenLastCalledWith({
      where: expect.objectContaining({
        id: run.id,
        organizationId: 'org-1',
        attempt: 1,
        status: { in: ['RUNNING', 'RETRYING', 'FAILED'] },
      }),
      data: expect.objectContaining({
        status: 'RETRYING',
        errorCode: 'AGENT_RETRYING',
        errorMessage: 'fetch failed',
      }),
    });
    expect(memoryService.recordWorkMemory).not.toHaveBeenCalled();
    expect(agentRunsCounter.inc).not.toHaveBeenCalled();
    expect(deadLetterQueue.add).not.toHaveBeenCalled();
  });

  it('does not retry image provider quota exhaustion and preserves its error code', async () => {
    const { worker, prisma } = createWorker();
    const run = {
      id: 'run-image-quota',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      agentType: 'IMAGE_CREATIVE',
      input: {
        productName: 'Travel Mug',
        imageUrl: 'https://example.test/mug.jpg',
      },
    };
    prisma.agentRun.findFirst = jest.fn().mockResolvedValue(run);
    prisma.agentRun.update = jest.fn().mockResolvedValue({});
    (prisma as any).user = {
      findUnique: jest.fn().mockResolvedValue({ locale: 'zh-CN' }),
    };
    (worker as any).agentProvider = {
      runImageGeneration: jest
        .fn()
        .mockRejectedValue(
          new Error('[IMAGE_PROVIDER_QUOTA_EXHAUSTED] 生图供应商额度不足'),
        ),
    };

    await expect(
      worker.process({
        id: 'job-image-quota',
        data: { agentRunId: run.id, organizationId: 'org-1' },
        updateProgress: jest.fn(),
      } as any),
    ).rejects.toMatchObject({ name: 'UnrecoverableError' });

    expect(prisma.agentRun.updateMany).toHaveBeenLastCalledWith({
      where: expect.objectContaining({ id: run.id, attempt: 1 }),
      data: expect.objectContaining({
        status: 'FAILED',
        errorCode: 'IMAGE_PROVIDER_QUOTA_EXHAUSTED',
      }),
    });
  });

  it('does not retry model provider quota exhaustion', async () => {
    const { worker, prisma } = createWorker();
    const run = {
      id: 'run-model-quota',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      agentType: 'IMAGE_CREATIVE',
      input: {
        productName: 'Travel Mug',
        imageUrl: 'https://example.test/mug.jpg',
      },
    };
    prisma.agentRun.findFirst = jest.fn().mockResolvedValue(run);
    prisma.agentRun.update = jest.fn().mockResolvedValue({});
    (prisma as any).user = {
      findUnique: jest.fn().mockResolvedValue({ locale: 'zh-CN' }),
    };
    (worker as any).agentProvider = {
      runImageGeneration: jest
        .fn()
        .mockRejectedValue(
          new Error('[MODEL_PROVIDER_QUOTA_EXHAUSTED] 模型供应商额度不足'),
        ),
    };

    await expect(
      worker.process({
        id: 'job-model-quota',
        data: { agentRunId: run.id, organizationId: 'org-1' },
        updateProgress: jest.fn(),
      } as any),
    ).rejects.toMatchObject({ name: 'UnrecoverableError' });

    expect(prisma.agentRun.updateMany).toHaveBeenLastCalledWith({
      where: expect.objectContaining({ id: run.id, attempt: 1 }),
      data: expect.objectContaining({
        errorCode: 'MODEL_PROVIDER_QUOTA_EXHAUSTED',
      }),
    });
  });

  it('does not retry exhausted model fallback routes', async () => {
    const { worker, prisma } = createWorker();
    const run = {
      id: 'run-model-fallback',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      agentType: 'IMAGE_CREATIVE',
      input: {
        productName: 'Travel Mug',
        imageUrl: 'https://example.test/mug.jpg',
      },
    };
    prisma.agentRun.findFirst = jest.fn().mockResolvedValue(run);
    prisma.agentRun.update = jest.fn().mockResolvedValue({});
    (prisma as any).user = {
      findUnique: jest.fn().mockResolvedValue({ locale: 'zh-CN' }),
    };
    (worker as any).agentProvider = {
      runImageGeneration: jest
        .fn()
        .mockRejectedValue(
          new Error(
            '[MODEL_PROVIDER_FALLBACK_EXHAUSTED] 主模型额度不足，备用模型不可用',
          ),
        ),
    };

    await expect(
      worker.process({
        id: 'job-model-fallback',
        data: { agentRunId: run.id, organizationId: 'org-1' },
        updateProgress: jest.fn(),
      } as any),
    ).rejects.toMatchObject({ name: 'UnrecoverableError' });

    expect(prisma.agentRun.updateMany).toHaveBeenLastCalledWith({
      where: expect.objectContaining({ id: run.id, attempt: 1 }),
      data: expect.objectContaining({
        errorCode: 'MODEL_PROVIDER_FALLBACK_EXHAUSTED',
      }),
    });
  });

  it('does not retry exhausted image fallback routes', async () => {
    const { worker, prisma } = createWorker();
    const run = {
      id: 'run-image-fallback',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      agentType: 'IMAGE_CREATIVE',
      input: {
        productName: 'Travel Mug',
        imageUrl: 'https://example.test/mug.jpg',
      },
    };
    prisma.agentRun.findFirst = jest.fn().mockResolvedValue(run);
    prisma.agentRun.update = jest.fn().mockResolvedValue({});
    (prisma as any).user = {
      findUnique: jest.fn().mockResolvedValue({ locale: 'zh-CN' }),
    };
    (worker as any).agentProvider = {
      runImageGeneration: jest
        .fn()
        .mockRejectedValue(
          new Error(
            '[IMAGE_PROVIDER_FALLBACK_EXHAUSTED] 主图片额度不足，备用模型不可用',
          ),
        ),
    };

    await expect(
      worker.process({
        id: 'job-image-fallback',
        data: { agentRunId: run.id, organizationId: 'org-1' },
        updateProgress: jest.fn(),
      } as any),
    ).rejects.toMatchObject({ name: 'UnrecoverableError' });

    expect(prisma.agentRun.updateMany).toHaveBeenLastCalledWith({
      where: expect.objectContaining({ id: run.id, attempt: 1 }),
      data: expect.objectContaining({
        errorCode: 'IMAGE_PROVIDER_FALLBACK_EXHAUSTED',
      }),
    });
  });

  it('skips stale jobs when the agent run record is already gone', async () => {
    const { worker, prisma, agentRunsCounter, deadLetterQueue } =
      createWorker();
    prisma.agentRun.findFirst = jest.fn().mockResolvedValue(null);
    prisma.agentRun.update = jest.fn().mockResolvedValue({});

    const result = await worker.process({
      id: 'job-stale',
      data: { agentRunId: 'missing-run', organizationId: 'org-1' },
      updateProgress: jest.fn(),
    } as any);

    expect(result).toEqual({
      status: 'skipped',
      agentRunId: 'missing-run',
      reason: 'not_found',
    });
    expect(prisma.agentRun.update).not.toHaveBeenCalled();
    expect(prisma.agentRun.updateMany).not.toHaveBeenCalled();
    expect(agentRunsCounter.inc).toHaveBeenCalledWith({
      agent_type: 'unknown',
      status: 'skipped',
    });
    expect(deadLetterQueue.add).not.toHaveBeenCalled();
  });

  it('dispatches planner runs to plan_and_execute provider method with context', async () => {
    const agentProvider = {
      runPlanAndExecute: jest.fn().mockResolvedValue({}),
    };
    const { worker } = createWorker();
    (worker as any).agentProvider = agentProvider;

    await (worker as any).dispatch(
      'PLANNER',
      { goal: 'prepare a launch', context: { marketplace: 'amazon.com' } },
      {
        orgId: 'org-1',
        workspaceId: 'workspace-1',
        userId: 'user-1',
        agentRunId: 'run-1',
        locale: 'zh-CN',
      },
    );

    expect(agentProvider.runPlanAndExecute).toHaveBeenCalledWith(
      {
        goal: 'prepare a launch',
        context: { marketplace: 'amazon.com' },
      },
      {
        orgId: 'org-1',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        agentRunId: 'run-1',
        locale: 'zh-CN',
      },
    );
  });

  it('uses a unique stable request id for an image regeneration attempt', async () => {
    const { worker, prisma } = createWorker();
    const run = {
      id: 'run-image-regeneration',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      agentType: 'IMAGE_CREATIVE',
      attempt: 3,
      status: 'QUEUED',
      input: {
        productName: 'Travel Mug',
        imageUrl: 'https://example.test/mug.jpg',
      },
    };
    prisma.agentRun.findFirst = jest.fn().mockResolvedValue(run);
    (prisma as any).user = {
      findUnique: jest.fn().mockResolvedValue({ locale: 'zh-CN' }),
    };
    const runImageGeneration = jest.fn().mockResolvedValue({ images: [] });
    (worker as any).agentProvider = { runImageGeneration };

    await worker.process({
      id: 'job-regeneration-2',
      data: {
        agentRunId: run.id,
        organizationId: 'org-1',
        attempt: 3,
        regenerationAttempt: 2,
      },
      updateProgress: jest.fn(),
    } as any);

    expect(runImageGeneration).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        agentRunId: run.id,
        requestId: `${run.id}:attempt:3:generation:2`,
      }),
    );
  });

  it('creates a new child run through the transactional outbox when low quality is retried', async () => {
    const { worker, prisma, agentRunQueue } = createWorker();
    prisma.reviewTask.aggregate = jest.fn().mockResolvedValue({
      _sum: { autoRegenerations: 1 },
    });

    await (worker as any).handleConsistencyScoring(
      {
        id: 'run-low-quality',
        organizationId: 'org-1',
        userId: 'user-1',
        agentType: 'IMAGE_CREATIVE',
        attempt: 3,
        provider: 'openai',
        input: { productName: 'Travel Mug' },
      },
      { consistencyScore: 24 },
    );

    expect(prisma.agentRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientRequestId: 'quality-regeneration:run-low-quality:2',
        attempt: 1,
        status: 'PENDING',
        lifecycleStatus: 'CREATED',
        input: expect.objectContaining({
          regenerationOfRunId: 'run-low-quality',
          regenerationAttempt: 2,
        }),
      }),
    });
    expect(prisma.outboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dedupeKey: 'agent-run:regenerated-run-1:attempt:1',
        eventType: 'agent-run.enqueue',
        payload: {
          agentRunId: 'regenerated-run-1',
          attempt: 1,
          regenerationAttempt: 2,
          parentRunId: 'run-low-quality',
        },
      }),
    });
    expect(agentRunQueue.add).not.toHaveBeenCalled();
  });

  it('skips terminal AgentRuns without calling the provider or overwriting the result', async () => {
    const { worker, prisma } = createWorker();
    prisma.agentRun.findFirst.mockResolvedValue({
      id: 'run-complete',
      organizationId: 'org-1',
      agentType: 'GENERAL_ASSISTANT',
      attempt: 1,
      status: 'COMPLETED',
    });
    const runAssistant = jest.fn();
    (worker as any).agentProvider = { runAssistant };

    const result = await worker.process({
      id: 'job-complete',
      data: { agentRunId: 'run-complete', organizationId: 'org-1', attempt: 1 },
      updateProgress: jest.fn(),
    } as any);

    expect(result).toEqual({
      status: 'skipped',
      agentRunId: 'run-complete',
      reason: 'terminal',
    });
    expect(runAssistant).not.toHaveBeenCalled();
    expect(prisma.agentRun.updateMany).not.toHaveBeenCalled();
  });

  it('skips stale jobs whose attempt no longer matches the AgentRun', async () => {
    const { worker, prisma } = createWorker();
    prisma.agentRun.findFirst.mockResolvedValue({
      id: 'run-new-attempt',
      organizationId: 'org-1',
      agentType: 'GENERAL_ASSISTANT',
      attempt: 3,
      status: 'PENDING',
    });

    const result = await worker.process({
      id: 'job-old-attempt',
      data: {
        agentRunId: 'run-new-attempt',
        organizationId: 'org-1',
        attempt: 2,
      },
      updateProgress: jest.fn(),
    } as any);

    expect(result).toEqual({
      status: 'skipped',
      agentRunId: 'run-new-attempt',
      reason: 'stale_attempt',
    });
    expect(prisma.agentRun.updateMany).not.toHaveBeenCalled();
  });

  it('does not call the provider when another worker already claimed the attempt', async () => {
    const { worker, prisma } = createWorker();
    prisma.agentRun.findFirst.mockResolvedValue({
      id: 'run-claimed',
      organizationId: 'org-1',
      agentType: 'GENERAL_ASSISTANT',
      attempt: 1,
      status: 'QUEUED',
    });
    prisma.agentRun.updateMany.mockResolvedValue({ count: 0 });
    const runAssistant = jest.fn();
    (worker as any).agentProvider = { runAssistant };

    const result = await worker.process({
      id: 'job-claimed',
      data: { agentRunId: 'run-claimed', organizationId: 'org-1', attempt: 1 },
      updateProgress: jest.fn(),
    } as any);

    expect(result).toEqual({
      status: 'skipped',
      agentRunId: 'run-claimed',
      reason: 'already_claimed',
    });
    expect(runAssistant).not.toHaveBeenCalled();
  });

  it('does not enqueue a dead letter while BullMQ still has retries left', async () => {
    const { worker, deadLetterQueue, agentRunsCounter } = createWorker();

    await worker.onFailed(
      {
        id: 'job-1',
        data: { agentRunId: 'run-1', organizationId: 'org-1' },
        opts: { attempts: 3 },
        attemptsMade: 2,
      } as any,
      new Error('transient'),
    );

    expect(deadLetterQueue.add).not.toHaveBeenCalled();
    expect(agentRunsCounter.inc).not.toHaveBeenCalled();
  });

  it('persists an unrecoverable failure even when retry attempts remain', async () => {
    const { worker, deadLetterQueue, prisma } = createWorker();
    prisma.agentRun.findFirst = jest.fn().mockResolvedValue({
      id: 'run-unrecoverable',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      agentType: 'IMAGE_CREATIVE',
      input: { productName: 'Travel Mug' },
    });

    await worker.onFailed(
      {
        id: 'job-unrecoverable',
        data: { agentRunId: 'run-unrecoverable', organizationId: 'org-1' },
        opts: { attempts: 3 },
        attemptsMade: 1,
      } as any,
      new UnrecoverableError(
        '[MODEL_PROVIDER_QUOTA_EXHAUSTED] 模型供应商额度不足',
      ),
    );

    expect(prisma.agentRun.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'run-unrecoverable',
        organizationId: 'org-1',
        attempt: 1,
        status: 'FAILED',
      }),
      data: expect.objectContaining({
        errorCode: 'MODEL_PROVIDER_QUOTA_EXHAUSTED',
      }),
    });
    expect(deadLetterQueue.add).toHaveBeenCalledTimes(1);
  });

  it('enqueues a dead letter and records a failed metric after final retry', async () => {
    const { worker, deadLetterQueue, agentRunsCounter, prisma, memoryService } =
      createWorker();
    prisma.agentRun.findFirst = jest.fn().mockResolvedValue({
      id: 'run-1',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      agentType: 'GENERAL_ASSISTANT',
      input: { prompt: 'retry final failure' },
    });

    await worker.onFailed(
      {
        id: 'job-1',
        data: { agentRunId: 'run-1', organizationId: 'org-1' },
        opts: { attempts: 3 },
        attemptsMade: 3,
      } as any,
      new Error('permanent'),
    );

    expect(agentRunsCounter.inc).toHaveBeenCalledWith({
      agent_type: 'GENERAL_ASSISTANT',
      status: 'failed',
    });
    expect(deadLetterQueue.add).toHaveBeenCalledWith('record', {
      originalQueue: 'agent-runs',
      originalJobId: 'job-1',
      originalData: { agentRunId: 'run-1', organizationId: 'org-1' },
      failedReason: 'permanent',
      failedAttempts: 3,
      organizationId: 'org-1',
    });
    expect(prisma.agentRun.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'run-1',
        organizationId: 'org-1',
        attempt: 1,
        status: 'FAILED',
      }),
      data: expect.objectContaining({
        errorCode: 'AGENT_ERROR',
        errorMessage: 'permanent',
        finishedAt: expect.any(Date),
      }),
    });
    expect(memoryService.recordWorkMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        agentRunId: 'run-1',
        status: 'FAILED',
        result: { error: 'permanent' },
      }),
    );
  });

  it('persists image provider quota exhaustion on final failure', async () => {
    const { worker, prisma } = createWorker();
    prisma.agentRun.findFirst = jest.fn().mockResolvedValue({
      id: 'run-image-quota',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      agentType: 'IMAGE_CREATIVE',
      input: { productName: 'Travel Mug' },
    });

    await worker.onFailed(
      {
        id: 'job-image-quota',
        data: { agentRunId: 'run-image-quota', organizationId: 'org-1' },
        opts: { attempts: 3 },
        attemptsMade: 3,
      } as any,
      new Error('[IMAGE_PROVIDER_QUOTA_EXHAUSTED] 生图供应商额度不足'),
    );

    expect(prisma.agentRun.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'run-image-quota',
        organizationId: 'org-1',
        attempt: 1,
        status: 'FAILED',
      }),
      data: expect.objectContaining({
        errorCode: 'IMAGE_PROVIDER_QUOTA_EXHAUSTED',
      }),
    });
  });

  it('does not let an old failed job overwrite a newer business attempt', async () => {
    const { worker, prisma, memoryService, agentRunsCounter, deadLetterQueue } =
      createWorker();
    prisma.agentRun.findFirst.mockResolvedValue({
      id: 'run-retried',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      agentType: 'GENERAL_ASSISTANT',
      input: { prompt: 'newer attempt is already pending' },
      attempt: 2,
      status: 'PENDING',
    });
    prisma.agentRun.updateMany.mockResolvedValue({ count: 0 });

    await worker.onFailed(
      {
        id: 'agent-run__run-retried__attempt__1',
        data: {
          agentRunId: 'run-retried',
          organizationId: 'org-1',
          attempt: 1,
        },
        opts: { attempts: 3 },
        attemptsMade: 3,
      } as any,
      new Error('old attempt failed late'),
    );

    expect(prisma.agentRun.updateMany).not.toHaveBeenCalled();
    expect(memoryService.recordWorkMemory).not.toHaveBeenCalled();
    expect(agentRunsCounter.inc).not.toHaveBeenCalled();
    expect(deadLetterQueue.add).toHaveBeenCalledTimes(1);
  });
});
