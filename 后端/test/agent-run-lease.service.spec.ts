import { AgentRunLeaseService } from '../src/features/agent-runs/agent-run-lease.service.js';

describe('AgentRunLeaseService', () => {
  it('acquires an expired lease with an atomic compare-and-set update', async () => {
    const tx = {
      agentRunLease: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
      },
    };
    const service = new AgentRunLeaseService({
      run: jest.fn(
        (_organizationId: string, operation: (client: typeof tx) => unknown) =>
          operation(tx),
      ),
    } as any);
    const now = new Date('2026-07-14T12:00:00.000Z');

    await expect(
      service.acquire({
        organizationId: 'org-1',
        runId: 'run-1',
        ownerId: 'worker-1',
        ttlMs: 60_000,
        now,
      }),
    ).resolves.toBe(true);

    expect(tx.agentRunLease.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        runId: 'run-1',
        organizationId: 'org-1',
      }),
      data: expect.objectContaining({
        ownerId: 'worker-1',
        heartbeatAt: now,
        leaseUntil: new Date('2026-07-14T12:01:00.000Z'),
      }),
    });
    expect(tx.agentRunLease.create).not.toHaveBeenCalled();
  });

  it('does not renew a lease after it has expired or changed owner', async () => {
    const tx = {
      agentRunLease: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const service = new AgentRunLeaseService({
      run: jest.fn(
        (_organizationId: string, operation: (client: typeof tx) => unknown) =>
          operation(tx),
      ),
    } as any);

    await expect(
      service.heartbeat({
        organizationId: 'org-1',
        runId: 'run-1',
        ownerId: 'stale-worker',
        ttlMs: 60_000,
      }),
    ).resolves.toBe(false);
  });
});
