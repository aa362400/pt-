import { AutomationSchedulerService } from '../src/features/automation/automation-scheduler.service.js';

const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/;
const TRACEPARENT_PATTERN = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;

describe('AutomationSchedulerService', () => {
  it('creates a connected-store operator flow and enqueues the due run', async () => {
    const dueFlow = {
      id: 'flow-1',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      name: '[agentautomatictext] Ozon product researchtext',
      status: 'ACTIVE',
      triggerType: 'SCHEDULE',
      triggerConfig: {
        source: 'connected_store_operator',
        intervalMinutes: 240,
      },
      createdBy: 'user-1',
      nextRunAt: new Date('2026-07-09T00:00:00.000Z'),
    };
    const prisma = {
      organization: {
        findMany: jest.fn().mockResolvedValue([{ id: 'org-1' }]),
      },
      channelConnection: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'channel-1',
            provider: 'OZON',
            syncStatus: 'SUCCESS',
            workspace: {
              id: 'workspace-1',
              organizationId: 'org-1',
              name: 'Ozon RU',
              marketplace: 'OZON_RU',
            },
          },
        ]),
      },
      membership: {
        findFirst: jest.fn().mockResolvedValue({ userId: 'user-1' }),
      },
      automationFlow: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(dueFlow),
        findMany: jest.fn().mockResolvedValue([dueFlow]),
        update: jest.fn().mockResolvedValue({}),
      },
      automationRun: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'automation-run-1', ...data }),
          ),
      },
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const config = { get: jest.fn() };
    const scheduler = new AutomationSchedulerService(
      prisma as any,
      queue as any,
      config as any,
      {
        run: jest.fn(
          (_organizationId: string, operation: (tx: unknown) => unknown) =>
            operation(prisma),
        ),
      } as any,
    );

    await scheduler.run('manual');

    expect(prisma.automationFlow.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        name: '[agentautomatictext] Ozon product researchtext',
        status: 'ACTIVE',
        triggerType: 'SCHEDULE',
        steps: expect.arrayContaining([
          expect.objectContaining({
            action: 'product.research.daily',
            continuous: true,
          }),
        ]),
        createdBy: 'user-1',
      }),
    });
    expect(prisma.automationRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        flowId: 'flow-1',
        traceId: expect.stringMatching(TRACE_ID_PATTERN),
        idempotencyKey: 'schedule:flow-1:2026-07-09T00:00:00.000Z',
        triggerSource: 'schedule',
        triggerReason:
          'Scheduled automation (manual) for 2026-07-09T00:00:00.000Z',
        requestedBy: 'user-1',
        jobSnapshot: expect.objectContaining({
          scheduledFor: '2026-07-09T00:00:00.000Z',
          policy: {
            externalStoreMutation: 'not_executed',
            externalSideEffects: 'approval_token_required',
          },
        }),
      }),
    });
    expect(queue.add).toHaveBeenCalledWith(
      'run',
      expect.objectContaining({
        automationRunId: 'automation-run-1',
        organizationId: 'org-1',
        trigger: 'schedule',
        reason: 'Scheduled automation (manual) for 2026-07-09T00:00:00.000Z',
        idempotencyKey: 'schedule:flow-1:2026-07-09T00:00:00.000Z',
        traceId: expect.stringMatching(TRACE_ID_PATTERN),
        traceparent: expect.stringMatching(TRACEPARENT_PATTERN),
      }),
      { priority: 0, jobId: 'automation-run-automation-run-1' },
    );
    const persistedTraceId = prisma.automationRun.create.mock.calls[0][0].data
      .traceId as string;
    expect(queue.add.mock.calls[0][1].traceId).toBe(persistedTraceId);
    expect(queue.add.mock.calls[0][1].traceparent).toContain(persistedTraceId);
  });

  it('creates connected-store patrols as continuous daily product research', async () => {
    const prisma = {
      organization: {
        findMany: jest.fn().mockResolvedValue([{ id: 'org-1' }]),
      },
      channelConnection: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'channel-1',
            provider: 'OZON',
            syncStatus: 'SUCCESS',
            workspace: {
              id: 'workspace-1',
              organizationId: 'org-1',
              name: 'Ozon RU',
              marketplace: 'OZON_RU',
            },
          },
        ]),
      },
      membership: {
        findFirst: jest.fn().mockResolvedValue({ userId: 'user-1' }),
      },
      automationFlow: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'flow-1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const scheduler = new AutomationSchedulerService(
      prisma as any,
      { add: jest.fn() } as any,
      { get: jest.fn() } as any,
      {
        run: jest.fn(
          (_organizationId: string, operation: (tx: unknown) => unknown) =>
            operation(prisma),
        ),
      } as any,
    );

    await scheduler.run('manual');

    expect(prisma.automationFlow.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        triggerConfig: expect.objectContaining({
          source: 'connected_store_operator',
          continuous: true,
        }),
        steps: expect.arrayContaining([
          expect.objectContaining({
            action: 'product.research.daily',
            continuous: true,
          }),
        ]),
      }),
    });
  });

  it('reconciles legacy connected-store patrols onto continuous daily research', async () => {
    const legacyFlow = {
      id: 'legacy-flow-1',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      name: '[agentautomatictext] Ozon product researchtext',
      status: 'ACTIVE',
      triggerType: 'SCHEDULE',
      triggerConfig: {
        source: 'connected_store_operator',
        provider: 'OZON',
        channelId: 'channel-1',
        intervalMinutes: 240,
      },
      steps: [
        {
          key: 'automatic-product-research',
          action: 'product.research',
          mode: 'automatic',
          platform: 'OZON',
        },
      ],
      nextRunAt: new Date('2026-07-17T00:00:00.000Z'),
      createdBy: 'user-1',
    };
    const prisma = {
      organization: {
        findMany: jest.fn().mockResolvedValue([{ id: 'org-1' }]),
      },
      channelConnection: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'channel-1',
            provider: 'OZON',
            syncStatus: 'SUCCESS',
            workspace: {
              id: 'workspace-1',
              organizationId: 'org-1',
              name: 'Ozon RU',
              marketplace: 'OZON_RU',
            },
          },
        ]),
      },
      membership: {
        findFirst: jest.fn().mockResolvedValue({ userId: 'user-1' }),
      },
      automationFlow: {
        findFirst: jest.fn().mockResolvedValue(legacyFlow),
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const scheduler = new AutomationSchedulerService(
      prisma as any,
      { add: jest.fn() } as any,
      { get: jest.fn() } as any,
      {
        run: jest.fn(
          (_organizationId: string, operation: (tx: unknown) => unknown) =>
            operation(prisma),
        ),
      } as any,
    );

    await scheduler.run('manual');

    expect(prisma.automationFlow.create).not.toHaveBeenCalled();
    expect(prisma.automationFlow.update).toHaveBeenCalledWith({
      where: { id: 'legacy-flow-1' },
      data: expect.objectContaining({
        triggerConfig: expect.objectContaining({
          source: 'connected_store_operator',
          continuous: true,
        }),
        steps: expect.arrayContaining([
          expect.objectContaining({
            action: 'product.research.daily',
            continuous: true,
          }),
        ]),
      }),
    });
    const reconciledSteps = prisma.automationFlow.update.mock.calls[0][0].data
      .steps as Array<Record<string, unknown>>;
    expect(reconciledSteps).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'product.research' }),
      ]),
    );
  });

  it('preserves a user-paused connected-store patrol while reconciling its pipeline', async () => {
    const pausedFlow = {
      id: 'paused-flow-1',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      name: '[agentautomatictext] Ozon product researchtext',
      status: 'PAUSED',
      triggerType: 'SCHEDULE',
      triggerConfig: {
        source: 'connected_store_operator',
        provider: 'OZON',
        channelId: 'channel-1',
        intervalMinutes: 240,
      },
      steps: [{ action: 'product.research', mode: 'automatic' }],
      nextRunAt: null,
      createdBy: 'user-1',
    };
    const prisma = {
      organization: {
        findMany: jest.fn().mockResolvedValue([{ id: 'org-1' }]),
      },
      channelConnection: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'channel-1',
            provider: 'OZON',
            syncStatus: 'SUCCESS',
            workspace: {
              id: 'workspace-1',
              organizationId: 'org-1',
              name: 'Ozon RU',
              marketplace: 'OZON_RU',
            },
          },
        ]),
      },
      membership: {
        findFirst: jest.fn().mockResolvedValue({ userId: 'user-1' }),
      },
      automationFlow: {
        findFirst: jest.fn().mockResolvedValue(pausedFlow),
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const queue = { add: jest.fn() };
    const scheduler = new AutomationSchedulerService(
      prisma as any,
      queue as any,
      { get: jest.fn() } as any,
      {
        run: jest.fn(
          (_organizationId: string, operation: (tx: unknown) => unknown) =>
            operation(prisma),
        ),
      } as any,
    );

    await scheduler.run('manual');

    expect(prisma.automationFlow.update).toHaveBeenCalledWith({
      where: { id: pausedFlow.id },
      data: expect.not.objectContaining({ nextRunAt: expect.anything() }),
    });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('retires failed one-shot scheduled flows instead of enqueueing them again', async () => {
    const oneShotFlow = {
      id: 'flow-one-shot',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      name: '[Agent scheduled] One shot launch package',
      status: 'ACTIVE',
      triggerType: 'SCHEDULE',
      triggerConfig: {
        source: 'agent_suggestion',
        dueAt: '2026-07-09T00:00:00.000Z',
      },
      createdBy: 'user-1',
      nextRunAt: new Date('2026-07-09T00:00:00.000Z'),
    };
    const prisma = {
      organization: {
        findMany: jest.fn().mockResolvedValue([{ id: 'org-1' }]),
      },
      channelConnection: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      membership: {
        findFirst: jest.fn(),
      },
      automationFlow: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([oneShotFlow]),
        update: jest.fn().mockResolvedValue({}),
      },
      automationRun: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            status: 'FAILED',
            error: { message: 'fetch failed' },
            finishedAt: new Date('2026-07-09T00:05:00.000Z'),
          }),
        create: jest.fn(),
      },
    };
    const queue = { add: jest.fn() };
    const config = { get: jest.fn() };
    const scheduler = new AutomationSchedulerService(
      prisma as any,
      queue as any,
      config as any,
      {
        run: jest.fn(
          (_organizationId: string, operation: (tx: unknown) => unknown) =>
            operation(prisma),
        ),
      } as any,
    );

    await scheduler.run('manual');

    expect(prisma.automationFlow.update).toHaveBeenCalledWith({
      where: { id: 'flow-one-shot' },
      data: expect.objectContaining({
        status: 'ERROR',
        nextRunAt: null,
        triggerConfig: expect.objectContaining({
          terminalRunStatus: 'FAILED',
          terminalRunError: { message: 'fetch failed' },
        }),
      }),
    });
    expect(prisma.automationRun.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});
