import { AgentRunRecoveryService } from '../src/features/agent-runs/agent-run-recovery.service.js';
import { AgentLifecycleStatus } from '../src/features/agent-runs/agent-state-machine.js';

describe('AgentRunRecoveryService', () => {
  it('moves an expired running attempt to RETRY_SCHEDULED and enqueues the next attempt', async () => {
    const candidate = {
      id: 'run-1',
      attempt: 2,
      lifecycleStatus: AgentLifecycleStatus.WAITING_TOOL,
      lease: { ownerId: 'dead-worker', version: 4 },
    };
    const tx = {
      agentRun: {
        findMany: jest.fn().mockResolvedValue([candidate]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      outboxEvent: { create: jest.fn().mockResolvedValue({ id: 'outbox-1' }) },
      agentRunLease: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const lifecycle = {
      applyEvent: jest.fn().mockResolvedValue({
        applied: true,
        toStatus: AgentLifecycleStatus.RETRY_SCHEDULED,
      }),
    };
    const service = new AgentRunRecoveryService(
      {} as any,
      {
        run: jest.fn(
          (
            _organizationId: string,
            operation: (client: typeof tx) => unknown,
          ) => operation(tx),
        ),
      } as any,
      lifecycle as any,
      { get: jest.fn().mockReturnValue(undefined) } as any,
    );

    await expect(
      service.recoverOrganization(
        'org-1',
        new Date('2026-07-14T12:00:00.000Z'),
      ),
    ).resolves.toEqual({ scanned: 1, recovered: 1 });

    expect(lifecycle.applyEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-1',
        event: 'RETRYABLE_ERROR',
        attempt: 2,
      }),
    );
    expect(tx.agentRun.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'run-1',
        attempt: 2,
        lifecycleStatus: 'RETRY_SCHEDULED',
      }),
      data: expect.objectContaining({
        attempt: 3,
        status: 'RETRYING',
        errorCode: 'AGENT_RECOVERED',
      }),
    });
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dedupeKey: 'agent-run:run-1:attempt:3',
        payload: { agentRunId: 'run-1', attempt: 3 },
      }),
    });
  });

  it('fails safely when a worker disappears during verification', async () => {
    const tx = {
      agentRun: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'run-verifying',
            attempt: 1,
            lifecycleStatus: AgentLifecycleStatus.VERIFYING,
            lease: { ownerId: 'dead-worker', version: 1 },
          },
        ]),
      },
      agentRunLease: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const lifecycle = {
      applyEvent: jest.fn().mockResolvedValue({
        applied: true,
        toStatus: AgentLifecycleStatus.FAILED,
      }),
    };
    const service = new AgentRunRecoveryService(
      {} as any,
      {
        run: jest.fn(
          (
            _organizationId: string,
            operation: (client: typeof tx) => unknown,
          ) => operation(tx),
        ),
      } as any,
      lifecycle as any,
      { get: jest.fn().mockReturnValue(undefined) } as any,
    );

    await service.recoverOrganization('org-1');

    expect(lifecycle.applyEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-verifying',
        event: 'VERIFICATION_FAILED',
      }),
    );
    expect(tx.agentRunLease.deleteMany).toHaveBeenCalled();
  });
});
