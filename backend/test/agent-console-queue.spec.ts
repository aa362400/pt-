import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AgentConsoleService } from '../src/features/agent-console/agent-console.service.js';

const user = {
  sub: 'user-1',
  email: 'operator@example.com',
  orgId: 'org-1',
};

function plan(status: string) {
  return {
    id: 'plan-1',
    organizationId: 'org-1',
    conversationId: 'conversation-1',
    goal: 'Read current store state',
    status,
    plan: {},
    result: null,
    error: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    conversation: {
      id: 'conversation-1',
      userId: 'user-1',
      autonomyLevel: 1,
    },
    executions: [],
  };
}

function serviceWith(input: {
  tenantDatabase?: unknown;
  queue?: unknown;
  tools?: unknown;
  audit?: unknown;
}) {
  return new AgentConsoleService(
    (input.tenantDatabase ?? { run: jest.fn() }) as never,
    {} as never,
    {} as never,
    (input.tools ?? { get: jest.fn(), execute: jest.fn() }) as never,
    {} as never,
    (input.audit ?? { log: jest.fn() }) as never,
    (input.queue ?? { getJob: jest.fn(), add: jest.fn() }) as never,
  );
}

describe('Agent Console queue execution', () => {
  it('uses one stable BullMQ job id and reuses an active job', async () => {
    const activeJob = {
      getState: jest.fn().mockResolvedValue('waiting'),
      remove: jest.fn(),
    };
    const queue = {
      getJob: jest.fn().mockResolvedValue(activeJob),
      add: jest.fn(),
    };
    const service = serviceWith({ queue });

    await expect(
      service.ensurePlanJob({
        planId: 'plan-1',
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    ).resolves.toBe('existing');

    expect(queue.getJob).toHaveBeenCalledWith('agent-plan__plan-1');
    expect(queue.add).not.toHaveBeenCalled();
    expect(activeJob.remove).not.toHaveBeenCalled();
  });

  it('persists QUEUED before adding the stable queue job', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(plan('PLANNED'))
      .mockResolvedValueOnce(plan('QUEUED'));
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tenantDatabase = {
      run: jest.fn(
        (
          _orgId: string,
          operation: (tx: {
            agentPlan: {
              findFirst: typeof findFirst;
              updateMany: typeof updateMany;
            };
          }) => unknown,
        ) => operation({ agentPlan: { findFirst, updateMany } }),
      ),
    };
    const queue = {
      getJob: jest.fn().mockResolvedValue(null),
      add: jest.fn().mockResolvedValue({ id: 'agent-plan__plan-1' }),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = serviceWith({ tenantDatabase, queue, audit });

    const result = await service.executePlan(user, 'plan-1');

    expect(result.status).toBe('QUEUED');
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'plan-1',
        organizationId: 'org-1',
        status: { in: ['PLANNED', 'FAILED'] },
      },
      data: { status: 'QUEUED', error: Prisma.JsonNull },
    });
    expect(queue.add).toHaveBeenCalledWith(
      'execute',
      {
        planId: 'plan-1',
        organizationId: 'org-1',
        userId: 'user-1',
      },
      { jobId: 'agent-plan__plan-1' },
    );
  });

  it('does not execute tools while a plan is paused', async () => {
    const paused = plan('PAUSED');
    const findFirst = jest.fn().mockResolvedValue(paused);
    const tenantDatabase = {
      run: jest.fn(
        (
          _orgId: string,
          operation: (tx: {
            agentPlan: { findFirst: typeof findFirst };
          }) => unknown,
        ) => operation({ agentPlan: { findFirst } }),
      ),
    };
    const tools = { get: jest.fn(), execute: jest.fn() };
    const service = serviceWith({ tenantDatabase, tools });

    const result = await service.runQueuedPlan({
      planId: 'plan-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(result.status).toBe('PAUSED');
    expect(tools.get).not.toHaveBeenCalled();
    expect(tools.execute).not.toHaveBeenCalled();
  });

  it('only resumes a paused plan', async () => {
    const current = plan('RUNNING');
    const findFirst = jest.fn().mockResolvedValue(current);
    const tenantDatabase = {
      run: jest.fn(
        (
          _orgId: string,
          operation: (tx: {
            agentPlan: { findFirst: typeof findFirst };
          }) => unknown,
        ) => operation({ agentPlan: { findFirst } }),
      ),
    };
    const service = serviceWith({ tenantDatabase });

    await expect(service.resumePlan(user, 'plan-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
