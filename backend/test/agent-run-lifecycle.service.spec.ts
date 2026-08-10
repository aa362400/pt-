import { ConflictException } from '@nestjs/common';
import { AgentRunLifecycleService } from '../src/features/agent-runs/agent-run-lifecycle.service.js';
import {
  AgentLifecycleEvent,
  AgentLifecycleStatus,
} from '../src/features/agent-runs/agent-state-machine.js';

function createFixture(overrides?: {
  lifecycleStatus?: AgentLifecycleStatus;
  version?: number;
  existingTransition?: Record<string, unknown> | null;
  updatedCount?: number;
}) {
  const run = {
    id: 'run-1',
    organizationId: 'org-1',
    lifecycleStatus: overrides?.lifecycleStatus ?? AgentLifecycleStatus.CREATED,
    version: overrides?.version ?? 0,
    status: 'PENDING',
  };
  const transition = {
    id: 'transition-1',
    organizationId: 'org-1',
    runId: 'run-1',
    fromStatus: run.lifecycleStatus,
    toStatus: AgentLifecycleStatus.PLANNING,
    eventType: AgentLifecycleEvent.PLAN_STARTED,
    eventKey: 'run-1:plan-started:1',
    payload: {},
    attempt: 1,
    createdAt: new Date(),
    ...(overrides?.existingTransition ?? {}),
  };
  const tx = {
    agentTransition: {
      findUnique: jest
        .fn()
        .mockResolvedValue(overrides?.existingTransition ? transition : null),
      create: jest.fn().mockResolvedValue(transition),
      findMany: jest.fn().mockResolvedValue([transition]),
    },
    agentRun: {
      findFirst: jest.fn().mockResolvedValue(run),
      updateMany: jest
        .fn()
        .mockResolvedValue({ count: overrides?.updatedCount ?? 1 }),
    },
    outboxEvent: {
      create: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
    },
  };
  const tenantDatabase = {
    run: jest.fn(
      (_organizationId: string, operation: (client: typeof tx) => unknown) =>
        operation(tx),
    ),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new AgentRunLifecycleService(
    tenantDatabase as never,
    audit as never,
  );
  return { service, tx, audit, run, transition };
}

describe('AgentRunLifecycleService', () => {
  it('commits state, transition and outbox using optimistic concurrency', async () => {
    const { service, tx } = createFixture();

    const result = await service.applyEvent({
      organizationId: 'org-1',
      runId: 'run-1',
      event: AgentLifecycleEvent.PLAN_STARTED,
      eventKey: 'run-1:plan-started:1',
      payload: { source: 'queue' },
    });

    expect(result).toEqual(
      expect.objectContaining({
        applied: true,
        fromStatus: AgentLifecycleStatus.CREATED,
        toStatus: AgentLifecycleStatus.PLANNING,
        version: 1,
      }),
    );
    expect(tx.agentRun.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'run-1',
        organizationId: 'org-1',
        lifecycleStatus: AgentLifecycleStatus.CREATED,
        version: 0,
      },
      data: expect.objectContaining({
        lifecycleStatus: AgentLifecycleStatus.PLANNING,
        version: { increment: 1 },
      }),
    });
    expect(tx.agentTransition.create).toHaveBeenCalled();
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dedupeKey: 'agent-lifecycle:run-1:plan-started:1',
        eventType: 'agent-run.lifecycle.changed',
      }),
    });
  });

  it('treats a repeated event key as an idempotent replay', async () => {
    const { service, tx } = createFixture({
      lifecycleStatus: AgentLifecycleStatus.PLANNING,
      version: 1,
      existingTransition: { toStatus: AgentLifecycleStatus.PLANNING },
    });

    const result = await service.applyEvent({
      organizationId: 'org-1',
      runId: 'run-1',
      event: AgentLifecycleEvent.PLAN_STARTED,
      eventKey: 'run-1:plan-started:1',
    });

    expect(result.applied).toBe(false);
    expect(tx.agentRun.updateMany).not.toHaveBeenCalled();
    expect(tx.outboxEvent.create).not.toHaveBeenCalled();
  });

  it('rejects and audits an illegal transition', async () => {
    const { service, tx, audit } = createFixture();

    await expect(
      service.applyEvent({
        organizationId: 'org-1',
        runId: 'run-1',
        event: AgentLifecycleEvent.VERIFICATION_PASSED,
        eventKey: 'run-1:verify:1',
      }),
    ).rejects.toThrow('Illegal Agent lifecycle transition');

    expect(tx.agentRun.updateMany).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'agent-run.transition.rejected',
        resourceId: 'run-1',
      }),
    );
  });

  it('rejects a stale version instead of overwriting a concurrent event', async () => {
    const { service } = createFixture({ updatedCount: 0 });

    await expect(
      service.applyEvent({
        organizationId: 'org-1',
        runId: 'run-1',
        event: AgentLifecycleEvent.PLAN_STARTED,
        eventKey: 'run-1:plan-started:stale',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
