import { AgentRunsService } from '../src/features/agent-runs/agent-runs.service.js';
import { asyncLocalStorage } from '../src/shared/middleware/request-id.middleware.js';

describe('AgentRunsService webhook events', () => {
  it('rejects invalid assistant input before creating an AgentRun', async () => {
    const tenantDatabase = { run: jest.fn() };
    const service = new AgentRunsService(
      {} as any,
      { add: jest.fn() } as any,
      { emit: jest.fn() } as any,
      { log: jest.fn() } as any,
      tenantDatabase as any,
    );

    await expect(
      service.create({ sub: 'user-1', orgId: 'org-1' } as any, {
        agentType: 'GENERAL_ASSISTANT',
        input: { assistantId: 'general' },
      }),
    ).rejects.toThrow('GENERAL_ASSISTANT requires a non-empty input.prompt');

    expect(tenantDatabase.run).not.toHaveBeenCalled();
  });

  it('creates AgentRun and Outbox in one transaction without direct queue delivery', async () => {
    const run = {
      id: 'run-1',
      organizationId: 'org-1',
      attempt: 1,
      agentType: 'GENERAL_ASSISTANT',
      status: 'PENDING',
    };
    const tx = {
      agentRun: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(run),
      },
      agentTransition: {
        create: jest.fn().mockResolvedValue({ id: 'transition-1' }),
      },
      outboxEvent: { create: jest.fn().mockResolvedValue({ id: 'outbox-1' }) },
    };
    const prisma = {
      agentRun: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const queue = { add: jest.fn() };
    const service = new AgentRunsService(
      prisma as any,
      queue as any,
      { emit: jest.fn() } as any,
      { log: jest.fn().mockResolvedValue(undefined) } as any,
      {
        run: jest.fn(
          (
            _organizationId: string,
            operation: (client: typeof tx) => unknown,
          ) => operation(tx),
        ),
      } as any,
    );

    const traceContext = new Map<string, string>([
      ['requestId', 'request-1'],
      ['traceId', '4bf92f3577b34da6a3ce929d0e0e4736'],
      [
        'traceparent',
        '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      ],
    ]);
    await asyncLocalStorage.run(traceContext, () =>
      service.create(
        { sub: 'user-1', orgId: 'org-1' } as any,
        {
          agentType: 'GENERAL_ASSISTANT',
          input: { prompt: 'hello' },
          clientRequestId: 'request-1',
        },
        'zh-CN',
      ),
    );

    expect(tx.agentRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      }),
    });

    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dedupeKey: 'agent-run:run-1:attempt:1',
        aggregateId: 'run-1',
        payload: {
          agentRunId: 'run-1',
          attempt: 1,
          locale: 'zh-CN',
          traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
          traceparent:
            '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
        },
      }),
    });
    expect(tx.agentTransition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        runId: 'run-1',
        fromStatus: null,
        toStatus: 'CREATED',
        eventType: 'RUN_CREATED',
        eventKey: 'agent-run:run-1:created',
      }),
    });
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dedupeKey: 'agent-lifecycle:agent-run:run-1:created',
        eventType: 'agent-run.lifecycle.changed',
      }),
    });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('returns an existing organization request instead of enqueueing it again', async () => {
    const existing = {
      id: 'run-existing',
      organizationId: 'org-1',
      clientRequestId: 'ui-request-123',
    };
    const prisma = {
      agentRun: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
      },
    };
    const queue = { add: jest.fn() };
    const service = new AgentRunsService(
      prisma as any,
      queue as any,
      { emit: jest.fn() } as any,
      { log: jest.fn() } as any,
      {
        run: jest.fn(
          (
            _organizationId: string,
            operation: (client: typeof prisma) => unknown,
          ) => operation(prisma),
        ),
      } as any,
    );

    await expect(
      service.create({ sub: 'user-1', orgId: 'org-1' } as any, {
        agentType: 'GENERAL_ASSISTANT',
        input: { prompt: 'repeat request' },
        clientRequestId: 'ui-request-123',
      }),
    ).resolves.toEqual(existing);

    expect(prisma.agentRun.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('rejects events whose body runId does not match the route id', async () => {
    const prisma = {
      agentRun: {
        findUnique: jest.fn(),
      },
    };
    const service = new AgentRunsService(
      prisma as any,
      {} as any,
      { emit: jest.fn() } as any,
      {} as any,
      { run: jest.fn() } as any,
    );

    await expect(
      service.recordEvent('route-run-id', {
        organizationId: 'org-1',
        runId: 'body-run-id',
        status: 'running',
        stage: 'generate',
        message: 'working',
        timestamp: new Date().toISOString(),
      }),
    ).rejects.toThrow('Event runId does not match route id');
    expect(prisma.agentRun.findUnique).not.toHaveBeenCalled();
  });

  it('creates a new child run and outbox records for an eligible manual retry', async () => {
    const parent = {
      id: 'run-parent',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      agentType: 'PRODUCT_RESEARCHER',
      provider: 'openai',
      lifecycleStatus: 'FAILED',
      traceId: 'trace-1',
      input: { query: '汽车风扇' },
    };
    const child = {
      id: 'run-child',
      organizationId: 'org-1',
      attempt: 1,
      traceId: 'trace-1',
    };
    const tx = {
      agentRun: {
        findFirst: jest.fn().mockResolvedValue(parent),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(child),
      },
      agentTransition: {
        create: jest.fn().mockResolvedValue({ id: 'transition-child' }),
      },
      outboxEvent: { create: jest.fn().mockResolvedValue({ id: 'outbox' }) },
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new AgentRunsService(
      {} as any,
      { add: jest.fn() } as any,
      { emit: jest.fn() } as any,
      audit as any,
      {
        run: jest.fn(
          (
            _organizationId: string,
            operation: (client: typeof tx) => unknown,
          ) => operation(tx),
        ),
      } as any,
    );

    await expect(
      service.retry({ sub: 'user-2', orgId: 'org-1' } as any, parent.id, {
        requestId: 'retry-click-1',
      }),
    ).resolves.toEqual(child);

    expect(tx.agentRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-2',
        clientRequestId: 'retry:run-parent:retry-click-1',
        lifecycleStatus: 'CREATED',
        input: expect.objectContaining({
          query: '汽车风扇',
          retryOfRunId: 'run-parent',
        }),
      }),
    });
    expect(tx.outboxEvent.create).toHaveBeenCalledTimes(2);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'agent-run.retry',
        resourceId: 'run-child',
      }),
    );
  });

  it('returns the same retry run when the retry request is replayed', async () => {
    const parent = {
      id: 'run-parent',
      organizationId: 'org-1',
      workspaceId: null,
      userId: 'user-1',
      agentType: 'GENERAL_ASSISTANT',
      provider: 'openai',
      lifecycleStatus: 'CANCELLED',
      traceId: null,
      input: { prompt: 'retry me' },
    };
    const existing = {
      id: 'run-existing-retry',
      organizationId: 'org-1',
      clientRequestId: 'retry:run-parent:retry-click-1',
    };
    const tx = {
      agentRun: {
        findFirst: jest.fn().mockResolvedValue(parent),
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
      },
      agentTransition: { create: jest.fn() },
      outboxEvent: { create: jest.fn() },
    };
    const audit = { log: jest.fn() };
    const service = new AgentRunsService(
      {} as any,
      { add: jest.fn() } as any,
      { emit: jest.fn() } as any,
      audit as any,
      {
        run: jest.fn(
          (
            _organizationId: string,
            operation: (client: typeof tx) => unknown,
          ) => operation(tx),
        ),
      } as any,
    );

    await expect(
      service.retry({ sub: 'user-1', orgId: 'org-1' } as any, parent.id, {
        requestId: 'retry-click-1',
      }),
    ).resolves.toEqual(existing);

    expect(tx.agentRun.create).not.toHaveBeenCalled();
    expect(tx.outboxEvent.create).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });
});
