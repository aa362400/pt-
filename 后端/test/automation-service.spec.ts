import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ConflictException } from '@nestjs/common';
import {
  CreateFlowDto,
  RecoverFlowDto,
  TriggerFlowDto,
  UpdateFlowDto,
} from '../src/features/automation/automation.dto.js';
import { AutomationService } from '../src/features/automation/automation.service.js';
import { asyncLocalStorage } from '../src/shared/middleware/request-id.middleware.js';

const HTTP_TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
const FAILED_RUN_TRACE_ID = '70f5f7332f214b22a08a2546f7c64f91';
const TRACEPARENT_PATTERN = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;
const runningControl = () => ({
  lockEffectiveState: jest.fn().mockResolvedValue({
    state: 'RUNNING',
    revision: 4,
  }),
});

describe('Automation flow DTOs', () => {
  const steps = [
    {
      key: 'research',
      action: 'product.research',
      query: 'automotive fan',
    },
    {
      key: 'draft',
      action: 'listing.draft',
      dependsOn: ['research'],
      workspaceId: 'workspace-1',
    },
  ];

  it.each([CreateFlowDto, UpdateFlowDto])(
    'preserves structured automation steps when transforming %p',
    (Dto) => {
      const value = plainToInstance(
        Dto,
        {
          name: 'research to draft',
          triggerType: 'MANUAL',
          steps,
        },
        { enableImplicitConversion: true },
      );

      expect(value.steps).toEqual(steps);
    },
  );

  it('rejects non-object automation steps before they reach the worker', () => {
    const value = plainToInstance(
      CreateFlowDto,
      {
        name: 'invalid flow',
        triggerType: 'MANUAL',
        steps: ['profit.calculate'],
      },
      { enableImplicitConversion: true },
    );

    expect(validateSync(value)).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'steps' })]),
    );
  });

  it.each([TriggerFlowDto, RecoverFlowDto])(
    'requires an operator reason and idempotency key for %p',
    (Dto) => {
      const value = plainToInstance(
        Dto,
        {},
        { enableImplicitConversion: true },
      );

      expect(validateSync(value)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ property: 'reason' }),
          expect.objectContaining({ property: 'idempotencyKey' }),
        ]),
      );
    },
  );
});

describe('AutomationService', () => {
  it('persists and enqueues the current HTTP trace when a flow is triggered manually', async () => {
    const flow = {
      id: 'flow-manual',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      name: 'Manual research flow',
      triggerConfig: {},
      steps: [{ key: 'manual-step', action: 'product.research' }],
    };
    const prisma = {
      automationFlow: {
        findFirst: jest.fn().mockResolvedValue(flow),
      },
      automationRun: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'manual-run-1', ...data }),
          ),
      },
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const tenantDatabase = {
      run: jest.fn((_orgId: string, operation: (tx: unknown) => unknown) =>
        operation(prisma),
      ),
    };
    const service = new AutomationService(
      queue as any,
      tenantDatabase as any,
      runningControl() as any,
    );
    const requestTraceparent = `00-${HTTP_TRACE_ID}-00f067aa0ba902b7-01`;
    const store = new Map<string, string>([
      ['requestId', 'manual-request-1'],
      ['traceId', HTTP_TRACE_ID],
      ['traceparent', requestTraceparent],
    ]);

    const run = await asyncLocalStorage.run(store, () =>
      service.trigger({ sub: 'user-1', orgId: 'org-1' } as any, 'flow-manual', {
        reason: 'Operator requested a verified manual run',
        idempotencyKey: 'manual-request-0001',
      }),
    );

    expect(run).toEqual(
      expect.objectContaining({ id: 'manual-run-1', traceId: HTTP_TRACE_ID }),
    );
    expect(prisma.automationRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        flowId: 'flow-manual',
        traceId: HTTP_TRACE_ID,
        idempotencyKey: 'manual-request-0001',
        triggerSource: 'manual',
        triggerReason: 'Operator requested a verified manual run',
        requestedBy: 'user-1',
        controlRevision: 4,
        jobSnapshot: expect.objectContaining({
          idempotencyKey: 'manual-request-0001',
          controlRevision: 4,
          steps: flow.steps,
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
        automationRunId: 'manual-run-1',
        organizationId: 'org-1',
        trigger: 'manual',
        reason: 'Operator requested a verified manual run',
        idempotencyKey: 'manual-request-0001',
        traceId: HTTP_TRACE_ID,
        traceparent: expect.stringMatching(TRACEPARENT_PATTERN),
        controlRevision: 4,
      }),
      { priority: 1, jobId: 'automation-run-manual-run-1-control-4' },
    );
    expect(queue.add.mock.calls[0][1].traceparent).toContain(HTTP_TRACE_ID);
  });

  it('returns the existing run and enqueues only once for a repeated manual request', async () => {
    const flow = {
      id: 'flow-idempotent',
      organizationId: 'org-1',
      workspaceId: null,
      name: 'Idempotent flow',
      triggerConfig: {},
    };
    let persistedRun: Record<string, unknown> | null = null;
    const prisma = {
      automationFlow: { findFirst: jest.fn().mockResolvedValue(flow) },
      automationRun: {
        findUnique: jest.fn().mockImplementation(() => persistedRun),
        create: jest.fn().mockImplementation(({ data }) => {
          persistedRun = {
            id: 'run-idempotent-1',
            status: 'PENDING',
            parentRunId: null,
            ...data,
          };
          return Promise.resolve(persistedRun);
        }),
      },
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const tenantDatabase = {
      run: jest.fn((_orgId: string, operation: (tx: unknown) => unknown) =>
        operation(prisma),
      ),
    };
    const service = new AutomationService(
      queue as any,
      tenantDatabase as any,
      runningControl() as any,
    );
    const input = {
      reason: 'Run once even when the client retries',
      idempotencyKey: 'manual-idempotency-0001',
    };

    await service.trigger(
      { sub: 'user-1', orgId: 'org-1' } as any,
      flow.id,
      input,
    );
    const duplicate = await service.trigger(
      { sub: 'user-1', orgId: 'org-1' } as any,
      flow.id,
      input,
    );

    expect(prisma.automationRun.create).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(duplicate).toEqual(
      expect.objectContaining({ id: 'run-idempotent-1', idempotent: true }),
    );
    await expect(
      service.trigger({ sub: 'user-1', orgId: 'org-1' } as any, flow.id, {
        ...input,
        reason: 'A different request must not reuse the same key',
      }),
    ).rejects.toThrow(ConflictException);
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('updates a flow workspace only when the workspace belongs to the same organization', async () => {
    const flow = {
      id: 'flow-1',
      organizationId: 'org-1',
      workspaceId: null,
    };
    const prisma = {
      automationFlow: {
        findFirst: jest.fn().mockResolvedValue(flow),
        update: jest.fn().mockResolvedValue({
          ...flow,
          workspaceId: 'workspace-1',
        }),
      },
      workspace: {
        findFirst: jest.fn().mockResolvedValue({ id: 'workspace-1' }),
      },
    };
    const tenantDatabase = {
      run: jest.fn((_orgId: string, operation: (tx: unknown) => unknown) =>
        operation(prisma),
      ),
    };
    const service = new AutomationService(
      {} as any,
      tenantDatabase as any,
      runningControl() as any,
    );

    await service.update({ sub: 'user-1', orgId: 'org-1' } as any, 'flow-1', {
      workspaceId: 'workspace-1',
    });

    expect(prisma.workspace.findFirst).toHaveBeenCalledWith({
      where: { id: 'workspace-1', organizationId: 'org-1' },
      select: { id: true },
    });
    expect(prisma.automationFlow.update).toHaveBeenCalledWith({
      where: { id: 'flow-1' },
      data: expect.objectContaining({ workspaceId: 'workspace-1' }),
    });
  });

  it('includes the latest run when listing flows', async () => {
    const latestRun = {
      id: 'run-1',
      flowId: 'flow-1',
      status: 'FAILED',
      startedAt: new Date('2026-07-09T09:00:00.000Z'),
      finishedAt: new Date('2026-07-09T09:01:00.000Z'),
      result: null,
      error: { message: 'Agent API 502' },
    };
    const prisma = {
      automationFlow: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'flow-1',
            organizationId: 'org-1',
            name: '[智能体自动运营] Ozon 选品巡检',
            runs: [latestRun],
            _count: { runs: 1 },
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const tenantDatabase = {
      run: jest.fn((_orgId: string, operation: (tx: unknown) => unknown) =>
        operation(prisma),
      ),
    };
    const service = new AutomationService(
      {} as any,
      tenantDatabase as any,
      runningControl() as any,
    );

    const result = await service.findAll(
      { sub: 'user-1', orgId: 'org-1' } as any,
      {},
    );

    expect(prisma.automationFlow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          _count: { select: { runs: true } },
          runs: {
            orderBy: { startedAt: 'desc' },
            take: 1,
          },
        }),
      }),
    );
    expect(result.items[0].runs).toEqual([latestRun]);
  });

  it('creates a new recovery run for a failed automation without rewriting the failed run', async () => {
    const flow = {
      id: 'flow-1',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      name: '[智能体自动运营] Ozon 选品巡检',
      status: 'ACTIVE',
      triggerType: 'SCHEDULE',
      triggerConfig: {
        source: 'connected_store_operator',
        intervalMinutes: 240,
        agentProviderFailureStreak: 2,
        agentProviderBackoffUntil: '2026-07-10T10:00:00.000Z',
      },
      steps: [{ key: 'recovery-step', action: 'product.research.daily' }],
    };
    const prisma = {
      automationFlow: {
        findFirst: jest.fn().mockResolvedValue(flow),
        update: jest.fn().mockResolvedValue(flow),
      },
      automationRun: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'failed-run-1',
            status: 'FAILED',
            traceId: FAILED_RUN_TRACE_ID,
          })
          .mockResolvedValueOnce(null),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'recovery-run-1',
            ...data,
          }),
        ),
        update: jest.fn(),
      },
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const tenantDatabase = {
      run: jest.fn((_orgId: string, operation: (tx: unknown) => unknown) =>
        operation(prisma),
      ),
    };
    const service = new AutomationService(
      queue as any,
      tenantDatabase as any,
      runningControl() as any,
    );

    const result = await service.recoverFromFailure({
      organizationId: 'org-1',
      actorId: 'user-1',
      flowId: 'flow-1',
      failedRunId: 'failed-run-1',
      reason: 'Operator verified the failed run before recovery',
      idempotencyKey: 'recovery-request-0001',
      source: 'notification_center',
    });

    expect(result).toEqual({
      status: 'queued',
      action: 'automation.recover',
      flowId: 'flow-1',
      automationRunId: 'recovery-run-1',
      idempotencyKey: 'recovery-request-0001',
      externalStoreMutation: 'not_executed',
    });
    expect(prisma.automationRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        flowId: 'flow-1',
        traceId: FAILED_RUN_TRACE_ID,
        idempotencyKey: 'recovery-request-0001',
        triggerSource: 'notification_center',
        triggerReason: 'Operator verified the failed run before recovery',
        requestedBy: 'user-1',
        parentRunId: 'failed-run-1',
        controlRevision: 4,
        jobSnapshot: expect.objectContaining({
          parentRunId: 'failed-run-1',
          controlRevision: 4,
          steps: flow.steps,
          policy: {
            externalStoreMutation: 'not_executed',
            externalSideEffects: 'approval_token_required',
          },
        }),
      }),
    });
    expect(prisma.automationRun.update).not.toHaveBeenCalled();
    expect(prisma.automationFlow.update).toHaveBeenCalledWith({
      where: { id: 'flow-1' },
      data: expect.objectContaining({
        status: 'ACTIVE',
        triggerConfig: expect.objectContaining({
          agentProviderFailureStreak: 0,
          agentProviderBackoffUntil: null,
          recovery: expect.objectContaining({
            source: 'notification_center',
            actorId: 'user-1',
            failedRunId: 'failed-run-1',
            reason: 'Operator verified the failed run before recovery',
            idempotencyKey: 'recovery-request-0001',
          }),
        }),
      }),
    });
    expect(queue.add).toHaveBeenCalledWith(
      'run',
      expect.objectContaining({
        automationRunId: 'recovery-run-1',
        organizationId: 'org-1',
        trigger: 'manual_recovery',
        reason: 'Operator verified the failed run before recovery',
        idempotencyKey: 'recovery-request-0001',
        traceId: FAILED_RUN_TRACE_ID,
        traceparent: expect.stringMatching(TRACEPARENT_PATTERN),
        controlRevision: 4,
      }),
      { priority: 0, jobId: 'automation-run-recovery-run-1-control-4' },
    );
    expect(queue.add.mock.calls[0][1].traceparent).toContain(
      FAILED_RUN_TRACE_ID,
    );
  });

  it.each(['PAUSE_REQUESTED', 'STOP_REQUESTED'] as const)(
    'does not create or enqueue a manual run while control is %s',
    async (state) => {
      const prisma = {
        automationFlow: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'flow-blocked',
            organizationId: 'org-1',
            triggerConfig: {},
          }),
        },
        automationRun: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
        },
      };
      const queue = { add: jest.fn() };
      const tenantDatabase = {
        run: jest.fn((_orgId: string, operation: (tx: unknown) => unknown) =>
          operation(prisma),
        ),
      };
      const control = {
        lockEffectiveState: jest.fn().mockResolvedValue({ state, revision: 8 }),
      };
      const service = new AutomationService(
        queue as any,
        tenantDatabase as any,
        control as any,
      );

      await expect(
        service.trigger(
          { sub: 'user-1', orgId: 'org-1' } as any,
          'flow-blocked',
          {
            reason: 'Must respect durable organization control',
            idempotencyKey: `blocked-${state.toLowerCase()}`,
          },
        ),
      ).rejects.toThrow(ConflictException);

      expect(control.lockEffectiveState).toHaveBeenCalled();
      expect(prisma.automationRun.create).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    },
  );

  describe('evidence-preserving flow deletion', () => {
    const user = { sub: 'user-1', orgId: 'org-1' } as any;

    function deletionHarness(input: {
      status?: string;
      lastRunAt?: Date | null;
      runCount?: number;
      stepCount?: number;
      auditCount?: number;
      deletedCount?: number;
    }) {
      const flow = {
        id: 'flow-delete-guard',
        organizationId: 'org-1',
        status: input.status ?? 'DRAFT',
        lastRunAt: input.lastRunAt ?? null,
      };
      const prisma = {
        $queryRaw: jest.fn().mockResolvedValue([flow]),
        automationFlow: {
          findFirst: jest.fn().mockResolvedValue(flow),
          delete: jest.fn().mockResolvedValue(flow),
          deleteMany: jest
            .fn()
            .mockResolvedValue({ count: input.deletedCount ?? 1 }),
        },
        automationRun: {
          count: jest.fn().mockResolvedValue(input.runCount ?? 0),
        },
        automationStepExecution: {
          count: jest.fn().mockResolvedValue(input.stepCount ?? 0),
        },
        auditLog: {
          count: jest.fn().mockResolvedValue(input.auditCount ?? 0),
        },
      };
      const tenantDatabase = {
        run: jest.fn(
          (
            _orgId: string,
            operation: (tx: typeof prisma) => unknown,
            _options?: unknown,
          ) => operation(prisma),
        ),
      };
      return {
        flow,
        prisma,
        tenantDatabase,
        service: new AutomationService(
          {} as any,
          tenantDatabase as any,
          runningControl() as any,
        ),
      };
    }

    it('refuses physical deletion when any run or step evidence exists', async () => {
      const { service, prisma } = deletionHarness({
        runCount: 1,
        stepCount: 2,
      });

      await expect(
        service.remove(user, 'flow-delete-guard'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'AUTOMATION_FLOW_EVIDENCE_EXISTS',
          message: expect.stringContaining('停用并保留记录'),
        }),
      });

      expect(prisma.automationFlow.delete).not.toHaveBeenCalled();
      expect(prisma.automationFlow.deleteMany).not.toHaveBeenCalled();
    });

    it('refuses physical deletion when an audit record exists', async () => {
      const { service, prisma } = deletionHarness({ auditCount: 1 });

      await expect(
        service.remove(user, 'flow-delete-guard'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'AUTOMATION_FLOW_EVIDENCE_EXISTS',
          message: expect.stringContaining('审计'),
        }),
      });

      expect(prisma.auditLog.count).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          resourceId: 'flow-delete-guard',
        },
      });
      expect(prisma.automationFlow.deleteMany).not.toHaveBeenCalled();
    });

    it('treats a recorded last-run timestamp as durable evidence even if legacy rows are missing', async () => {
      const { service, prisma } = deletionHarness({
        lastRunAt: new Date('2026-07-17T00:00:00.000Z'),
      });

      await expect(
        service.remove(user, 'flow-delete-guard'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'AUTOMATION_FLOW_EVIDENCE_EXISTS',
          evidence: expect.objectContaining({ lastRunRecorded: true }),
        }),
      });

      expect(prisma.automationFlow.deleteMany).not.toHaveBeenCalled();
    });

    it('refuses physical deletion of a non-draft flow even before its first run', async () => {
      const { service, prisma } = deletionHarness({ status: 'PAUSED' });

      await expect(
        service.remove(user, 'flow-delete-guard'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'AUTOMATION_FLOW_DELETE_DRAFT_ONLY',
          message: expect.stringContaining('仅允许删除从未运行的草稿'),
        }),
      });

      expect(prisma.automationFlow.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes only a locked, never-run draft and keeps the operation tenant-scoped', async () => {
      const { service, prisma, tenantDatabase } = deletionHarness({});

      await expect(service.remove(user, 'flow-delete-guard')).resolves.toEqual({
        id: 'flow-delete-guard',
      });

      const rawQuery = prisma.$queryRaw.mock.calls[0]?.[0] as {
        strings?: readonly string[];
      };
      expect(rawQuery.strings?.join(' ')).toContain('FOR UPDATE');
      expect(prisma.automationFlow.delete).not.toHaveBeenCalled();
      expect(prisma.automationFlow.deleteMany).toHaveBeenCalledWith({
        where: {
          id: 'flow-delete-guard',
          organizationId: 'org-1',
          status: 'DRAFT',
        },
      });
      expect(tenantDatabase.run).toHaveBeenCalledTimes(1);
      expect(tenantDatabase.run.mock.calls[0]?.[2]).toEqual(
        expect.objectContaining({ isolationLevel: 'ReadCommitted' }),
      );
    });

    it('fails closed when a concurrent change prevents the guarded delete', async () => {
      const { service, prisma } = deletionHarness({ deletedCount: 0 });

      await expect(
        service.remove(user, 'flow-delete-guard'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'AUTOMATION_FLOW_DELETE_CONCURRENT_CHANGE',
          message: expect.stringContaining('未删除任何记录'),
        }),
      });

      expect(prisma.automationFlow.delete).not.toHaveBeenCalled();
    });

    it('does not repeat a physical delete after the first request succeeds', async () => {
      const { service, prisma } = deletionHarness({});
      prisma.$queryRaw
        .mockResolvedValueOnce([
          {
            id: 'flow-delete-guard',
            organizationId: 'org-1',
            status: 'DRAFT',
            lastRunAt: null,
          },
        ])
        .mockResolvedValueOnce([]);

      await expect(service.remove(user, 'flow-delete-guard')).resolves.toEqual({
        id: 'flow-delete-guard',
      });
      await expect(
        service.remove(user, 'flow-delete-guard'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'AUTOMATION_FLOW_NOT_FOUND',
          message: expect.stringContaining('未找到该自动化流程'),
        }),
      });

      expect(prisma.automationFlow.deleteMany).toHaveBeenCalledTimes(1);
    });
  });
});
