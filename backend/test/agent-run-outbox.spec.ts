import { AgentRunOutboxPublisher } from '../src/features/agent-runs/agent-run-outbox.publisher.js';

function event() {
  return {
    id: 'outbox-1',
    dedupeKey: 'agent-run:run-1:attempt:1',
    organizationId: 'org-1',
    aggregateType: 'AgentRun',
    aggregateId: 'run-1',
    eventType: 'agent-run.enqueue',
    payload: {
      agentRunId: 'run-1',
      attempt: 1,
      locale: 'zh-CN',
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    },
    status: 'PENDING',
    attempts: 0,
    nextRetryAt: null,
    lockedAt: null,
    lockedBy: null,
    lastError: null,
    publishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any;
}

function createPublisher(
  queueAdd = jest.fn().mockResolvedValue({}),
  queueGetJob = jest.fn().mockResolvedValue(null),
) {
  const prisma = {
    organization: {
      findMany: jest.fn().mockResolvedValue([{ id: 'org-1' }]),
    },
    outboxEvent: {
      updateMany: jest
        .fn()
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([event()]),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    },
    agentRun: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'run-1', status: 'PENDING' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const queue = { add: queueAdd, getJob: queueGetJob };
  const tenantDatabase = {
    run: jest
      .fn()
      .mockImplementation(
        (_organizationId: string, operation: (tx: typeof prisma) => unknown) =>
          operation(prisma),
      ),
  };
  return {
    publisher: new AgentRunOutboxPublisher(
      prisma as any,
      queue as any,
      tenantDatabase as any,
    ),
    prisma,
    queue,
    tenantDatabase,
  };
}

describe('AgentRunOutboxPublisher', () => {
  it('waits for an active lifecycle scan before module shutdown completes', async () => {
    const { publisher, prisma } = createPublisher();
    let release: ((organizations: Array<{ id: string }>) => void) | undefined;
    prisma.organization.findMany.mockImplementation(
      () =>
        new Promise<Array<{ id: string }>>((resolve) => {
          release = resolve;
        }),
    );

    const scan = (publisher as any).startPublishing();
    let shutdownCompleted = false;
    const shutdown = Promise.resolve(publisher.onModuleDestroy()).then(() => {
      shutdownCompleted = true;
    });
    await Promise.resolve();

    expect(shutdownCompleted).toBe(false);
    release?.([]);
    await scan;
    await shutdown;
    expect(shutdownCompleted).toBe(true);
  });

  it('publishes with a stable attempt-scoped BullMQ job id', async () => {
    const { publisher, prisma, queue, tenantDatabase } = createPublisher();

    await publisher.publishPending();

    expect(queue.add).toHaveBeenCalledWith(
      'run',
      {
        agentRunId: 'run-1',
        organizationId: 'org-1',
        attempt: 1,
        locale: 'zh-CN',
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      },
      { jobId: 'agent-run__run-1__attempt__1' },
    );
    expect(tenantDatabase.run).toHaveBeenCalledWith(
      'org-1',
      expect.any(Function),
    );
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'outbox-1' },
      data: expect.objectContaining({ status: 'PUBLISHED' }),
    });
    expect(prisma.agentRun.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'run-1',
        organizationId: 'org-1',
        attempt: 1,
        status: { in: ['PENDING', 'ENQUEUING', 'RETRYING'] },
      },
      data: { status: 'QUEUED' },
    });
  });

  it('records a retry without marking the AgentRun queued', async () => {
    const queueAdd = jest
      .fn()
      .mockRejectedValue(new Error('redis unavailable'));
    const { publisher, prisma } = createPublisher(queueAdd);

    await publisher.publishPending();

    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'outbox-1' },
      data: expect.objectContaining({
        status: 'RETRYING',
        attempts: 1,
        lastError: 'redis unavailable',
        nextRetryAt: expect.any(Date),
      }),
    });
    expect(prisma.agentRun.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'run-1',
        organizationId: 'org-1',
        attempt: 1,
        status: { in: ['PENDING', 'ENQUEUING', 'RETRYING'] },
      },
      data: expect.objectContaining({
        status: 'PENDING',
        errorCode: 'AGENT_ENQUEUE_RETRYING',
      }),
    });
  });

  it('dead-letters an orphaned outbox event without crashing or enqueueing it', async () => {
    const { publisher, prisma, queue } = createPublisher();
    prisma.agentRun.updateMany.mockResolvedValue({ count: 0 });
    prisma.agentRun.findFirst.mockResolvedValue(null);

    await expect(publisher.publishPending()).resolves.toBeUndefined();

    expect(queue.add).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'outbox-1' },
      data: expect.objectContaining({
        status: 'DEAD_LETTERED',
        lastError:
          'AgentRun run-1 no longer exists; orphaned event quarantined',
      }),
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('restores a missing BullMQ job for an old queued AgentRun with the same stable id', async () => {
    const { publisher, prisma, queue } = createPublisher();
    prisma.agentRun.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 'run-queued',
        organizationId: 'org-1',
        attempt: 2,
        traceId: '7b769dff1d3340fda20ce3d1e59c8688',
      },
    ]);
    prisma.outboxEvent.findMany.mockResolvedValue([]);

    await publisher.publishPending();

    expect(queue.getJob).toHaveBeenCalledWith(
      'agent-run__run-queued__attempt__2',
    );
    expect(queue.add).toHaveBeenCalledWith(
      'run',
      {
        agentRunId: 'run-queued',
        organizationId: 'org-1',
        attempt: 2,
        traceId: '7b769dff1d3340fda20ce3d1e59c8688',
        traceparent: expect.stringMatching(
          /^00-7b769dff1d3340fda20ce3d1e59c8688-[0-9a-f]{16}-01$/,
        ),
      },
      { jobId: 'agent-run__run-queued__attempt__2' },
    );
  });

  it('does not duplicate an existing BullMQ job for an old queued AgentRun', async () => {
    const existingJob = { getState: jest.fn().mockResolvedValue('waiting') };
    const { publisher, prisma, queue } = createPublisher(
      jest.fn().mockResolvedValue({}),
      jest.fn().mockResolvedValue(existingJob),
    );
    prisma.agentRun.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'run-queued', organizationId: 'org-1', attempt: 2 },
      ]);
    prisma.outboxEvent.findMany.mockResolvedValue([]);

    await publisher.publishPending();

    expect(existingJob.getState).toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});
