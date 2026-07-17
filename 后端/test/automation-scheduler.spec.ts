import { AutomationSchedulerService } from '../src/features/automation/automation-scheduler.service.js';

const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/;
const TRACEPARENT_PATTERN = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;

const runningControl = () => ({
  lockEffectiveState: jest.fn().mockResolvedValue({
    state: 'RUNNING',
    revision: 0,
  }),
});

describe('AutomationSchedulerService', () => {
  it('creates a connected-store operator flow and enqueues the due run', async () => {
    const dueFlow = {
      id: 'flow-1',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      name: '[智能体自动运营] Ozon 选品巡检',
      status: 'ACTIVE',
      triggerType: 'SCHEDULE',
      triggerConfig: {
        source: 'connected_store_operator',
        intervalMinutes: 240,
      },
      steps: [{ key: 'research', action: 'product.research.daily' }],
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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
      runningControl() as any,
    );

    await scheduler.run('manual');

    expect(prisma.automationFlow.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        dedupeKey: 'connected-store-operator:OZON:channel-1',
        name: '[智能体自动运营] Ozon 选品巡检',
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
        controlRevision: 0,
        jobSnapshot: expect.objectContaining({
          scheduledFor: '2026-07-09T00:00:00.000Z',
          controlRevision: 0,
          steps: dueFlow.steps,
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
        controlRevision: 0,
      }),
      {
        priority: 0,
        jobId: 'automation-run-automation-run-1-control-0',
      },
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
      runningControl() as any,
    );

    await scheduler.run('manual');

    expect(prisma.automationFlow.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        triggerConfig: expect.objectContaining({
          source: 'connected_store_operator',
          continuous: true,
          pricingMode: 'MANUAL',
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

  it('reconciles an existing continuous patrol onto the safe manual-pricing default', async () => {
    const existingFlow = {
      id: 'flow-existing-continuous',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      dedupeKey: 'connected-store-operator:OZON:channel-1',
      name: '[智能体自动运营] Ozon 选品巡检',
      status: 'ACTIVE',
      triggerType: 'SCHEDULE',
      triggerConfig: {
        source: 'connected_store_operator',
        provider: 'OZON',
        channelId: 'channel-1',
        intervalMinutes: 240,
        continuous: true,
        researchPipeline: 'daily_evidence_first_v1',
        platform: 'OZON',
      },
      steps: [
        {
          key: 'continuous-global-product-research',
          action: 'product.research.daily',
          continuous: true,
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
        findFirst: jest.fn().mockResolvedValue(existingFlow),
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
      runningControl() as any,
    );

    await scheduler.run('manual');

    expect(prisma.automationFlow.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: existingFlow.id }),
      data: expect.objectContaining({
        triggerConfig: expect.objectContaining({ pricingMode: 'MANUAL' }),
      }),
    });
  });

  it('reconciles legacy connected-store patrols onto continuous daily research', async () => {
    const legacyFlow = {
      id: 'legacy-flow-1',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      name: '[智能体自动运营] Ozon 选品巡检',
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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
      runningControl() as any,
    );

    await scheduler.run('manual');

    expect(prisma.automationFlow.create).not.toHaveBeenCalled();
    expect(prisma.automationFlow.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'legacy-flow-1',
        organizationId: 'org-1',
        status: 'ACTIVE',
        nextRunAt: legacyFlow.nextRunAt,
        triggerConfig: { equals: legacyFlow.triggerConfig },
        steps: { equals: legacyFlow.steps },
      },
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
        dedupeKey: 'connected-store-operator:OZON:channel-1',
      }),
    });
    const reconciledSteps = prisma.automationFlow.updateMany.mock.calls[0][0]
      .data.steps as Array<Record<string, unknown>>;
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
      name: '[智能体自动运营] Ozon 选品巡检',
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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
      runningControl() as any,
    );

    await scheduler.run('manual');

    expect(prisma.automationFlow.updateMany).toHaveBeenCalledWith({
      where: {
        id: pausedFlow.id,
        organizationId: 'org-1',
        status: 'PAUSED',
        nextRunAt: null,
        triggerConfig: { equals: pausedFlow.triggerConfig },
        steps: { equals: pausedFlow.steps },
      },
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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
      runningControl() as any,
    );

    await scheduler.run('manual');

    expect(prisma.automationFlow.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'flow-one-shot',
        organizationId: 'org-1',
        status: 'ACTIVE',
        triggerType: 'SCHEDULE',
        nextRunAt: oneShotFlow.nextRunAt,
        triggerConfig: { equals: oneShotFlow.triggerConfig },
      },
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

  it.each(['PAUSE_REQUESTED', 'STOP_REQUESTED'] as const)(
    'does not create, advance, or enqueue flows while organization control is %s',
    async (controlState) => {
      const dueFlow = {
        id: 'flow-paused-by-control',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        name: 'Paused by durable organization control',
        status: 'ACTIVE',
        triggerType: 'SCHEDULE',
        triggerConfig: { intervalMinutes: 60 },
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
          findFirst: jest.fn().mockResolvedValue(dueFlow),
          create: jest.fn(),
          findMany: jest.fn().mockResolvedValue([dueFlow]),
          update: jest.fn(),
          updateMany: jest.fn(),
        },
        automationRun: {
          findUnique: jest.fn(),
          findFirst: jest.fn(),
          create: jest.fn(),
        },
      };
      const control = {
        lockEffectiveState: jest.fn().mockResolvedValue({
          state: controlState,
          revision: 7,
        }),
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
        control as any,
      );

      await scheduler.run('manual');

      expect(control.lockEffectiveState).toHaveBeenCalledTimes(2);
      expect(prisma.automationFlow.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.automationFlow.create).not.toHaveBeenCalled();
      expect(prisma.automationFlow.update).not.toHaveBeenCalled();
      expect(prisma.automationFlow.updateMany).not.toHaveBeenCalled();
      expect(prisma.automationRun.create).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    },
  );

  it('does not create a second run while an earlier run is durably paused', async () => {
    const dueFlow = {
      id: 'flow-with-paused-run',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      name: 'Durably paused automation',
      status: 'ACTIVE',
      triggerType: 'SCHEDULE',
      triggerConfig: { intervalMinutes: 60 },
      createdBy: 'user-1',
      nextRunAt: new Date('2026-07-09T00:00:00.000Z'),
    };
    const prisma = {
      organization: {
        findMany: jest.fn().mockResolvedValue([{ id: 'org-1' }]),
      },
      channelConnection: { findMany: jest.fn().mockResolvedValue([]) },
      automationFlow: {
        findMany: jest.fn().mockResolvedValue([dueFlow]),
        updateMany: jest.fn(),
      },
      automationRun: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue({ id: 'paused-run-1' }),
        create: jest.fn(),
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
      runningControl() as any,
    );

    await scheduler.run('manual');

    expect(prisma.automationRun.findFirst).toHaveBeenCalledWith({
      where: {
        flowId: dueFlow.id,
        status: { in: ['PENDING', 'RUNNING', 'PAUSED'] },
      },
      select: { id: true },
    });
    expect(prisma.automationFlow.updateMany).not.toHaveBeenCalled();
    expect(prisma.automationRun.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('does not create a run when the due-flow compare-and-swap loses', async () => {
    const dueFlow = {
      id: 'flow-cas-lost',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      name: 'CAS protected schedule',
      status: 'ACTIVE',
      triggerType: 'SCHEDULE',
      triggerConfig: { intervalMinutes: 60 },
      createdBy: 'user-1',
      nextRunAt: new Date('2026-07-09T00:00:00.000Z'),
    };
    const prisma = {
      organization: {
        findMany: jest.fn().mockResolvedValue([{ id: 'org-1' }]),
      },
      channelConnection: { findMany: jest.fn().mockResolvedValue([]) },
      automationFlow: {
        findMany: jest.fn().mockResolvedValue([dueFlow]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      automationRun: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
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
      runningControl() as any,
    );

    await scheduler.run('manual');

    expect(prisma.automationFlow.updateMany).toHaveBeenCalledWith({
      where: {
        id: dueFlow.id,
        organizationId: 'org-1',
        status: 'ACTIVE',
        triggerType: 'SCHEDULE',
        nextRunAt: dueFlow.nextRunAt,
        triggerConfig: { equals: dueFlow.triggerConfig },
      },
      data: { nextRunAt: expect.any(Date) },
    });
    expect(prisma.automationRun.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});
