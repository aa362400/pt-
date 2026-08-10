import { DeadLetterWorker } from '../src/shared/queue/dead-letter.worker.js';

function createWorker() {
  const prisma = {
    deadLetterJob: {
      create: jest.fn().mockResolvedValue({ id: 'dead-letter-1' }),
    },
  };
  const tenantDatabase = {
    run: jest.fn((organizationId, operation) => operation(prisma)),
  };
  return {
    worker: new (DeadLetterWorker as any)(prisma, tenantDatabase),
    prisma,
    tenantDatabase,
  };
}

describe('DeadLetterWorker tenant isolation', () => {
  it('persists a dead letter inside the originating tenant context', async () => {
    const { worker, prisma, tenantDatabase } = createWorker();
    const updateProgress = jest.fn().mockResolvedValue(undefined);

    await expect(
      worker.process({
        data: {
          originalQueue: 'agent-runs',
          originalJobId: 'job-1',
          originalData: { agentRunId: 'run-1' },
          failedReason: 'provider unavailable',
          failedAttempts: 3,
          organizationId: 'org-1',
        },
        updateProgress,
      } as any),
    ).resolves.toEqual({ status: 'recorded', deadLetterId: 'dead-letter-1' });

    expect(tenantDatabase.run).toHaveBeenCalledWith(
      'org-1',
      expect.any(Function),
    );
    expect(prisma.deadLetterJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          failedAttempts: 3,
          classification: 'PROVIDER_FAILURE',
          replayEligible: false,
          resolutionStatus: 'OPEN',
        }),
      }),
    );
    expect(updateProgress).toHaveBeenCalledWith(100);
  });

  it('rejects a dead letter without an organization id', async () => {
    const { worker, prisma, tenantDatabase } = createWorker();

    await expect(
      worker.process({
        data: {
          originalQueue: 'agent-runs',
          originalJobId: 'job-1',
          originalData: {},
          failedReason: 'provider unavailable',
          failedAttempts: 3,
        },
        updateProgress: jest.fn(),
      } as any),
    ).rejects.toThrow('organizationId');

    expect(tenantDatabase.run).not.toHaveBeenCalled();
    expect(prisma.deadLetterJob.create).not.toHaveBeenCalled();
  });
});
