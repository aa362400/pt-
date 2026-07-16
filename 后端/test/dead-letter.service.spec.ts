import { BadRequestException, ConflictException } from '@nestjs/common';
import { DeadLetterService } from '../src/features/dead-letter/dead-letter.service.js';
import { DeadLetterTriageService } from '../src/features/dead-letter/dead-letter-triage.service.js';

const user = { sub: 'user-1', orgId: 'org-1', role: 'OWNER' } as const;
const replayDto = {
  reason: 'Operator verified the transient queue failure',
  idempotencyKey: 'dead-letter-replay-0001',
};

function createService(deadLetter: Record<string, unknown>) {
  let replayClaimed = false;
  const tx = {
    deadLetterJob: {
      findFirst: jest.fn().mockResolvedValue(deadLetter),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockImplementation(({ where }) => {
        if (where?.replayEligible === true) {
          if (replayClaimed) return Promise.resolve({ count: 0 });
          replayClaimed = true;
        }
        return Promise.resolve({ count: 1 });
      }),
      update: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ ...deadLetter, ...data }),
        ),
    },
    automationRun: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'automation-run-1',
        flowId: 'flow-1',
        status: 'FAILED',
      }),
    },
  };
  const tenantDatabase = {
    run: jest.fn((_organizationId, operation) => operation(tx)),
  };
  const agentRuns = {
    retry: jest.fn().mockResolvedValue({ id: 'agent-retry-1' }),
  };
  const automation = {
    recoverFromFailure: jest.fn().mockResolvedValue({
      status: 'queued',
      automationRunId: 'automation-retry-1',
    }),
  };
  const audit = { appendStrict: jest.fn().mockResolvedValue(undefined) };
  const service = new DeadLetterService(
    tenantDatabase as never,
    agentRuns as never,
    automation as never,
    new DeadLetterTriageService(),
    audit as never,
  );
  return { service, tx, agentRuns, automation, audit };
}

describe('DeadLetterService controlled recovery', () => {
  it('blocks provider failures until an operator explicitly reclassifies them', async () => {
    const { service, agentRuns } = createService({
      id: 'dead-provider-1',
      organizationId: 'org-1',
      queueName: 'agent-runs',
      data: { agentRunId: 'agent-run-1' },
      classification: 'PROVIDER_FAILURE',
      replayEligible: false,
      resolutionStatus: 'OPEN',
      inspectedAt: null,
    });

    await expect(
      service.replay(user, 'dead-provider-1', replayDto),
    ).rejects.toThrow(BadRequestException);
    expect(agentRuns.retry).not.toHaveBeenCalled();
  });

  it('retries an eligible agent run through the idempotent AgentRunsService', async () => {
    const { service, tx, agentRuns, audit } = createService({
      id: 'dead-agent-1',
      organizationId: 'org-1',
      queueName: 'agent-runs',
      data: { agentRunId: 'agent-run-1' },
      classification: 'RETRYABLE',
      replayEligible: true,
      resolutionStatus: 'OPEN',
      inspectedAt: null,
      notes: null,
    });

    await expect(
      service.replay(user, 'dead-agent-1', replayDto),
    ).resolves.toEqual(
      expect.objectContaining({
        replayed: true,
        replayRunId: 'agent-retry-1',
      }),
    );
    expect(agentRuns.retry).toHaveBeenCalledWith(user, 'agent-run-1', {
      requestId: expect.stringMatching(
        /^dead-letter:dead-agent-1:[0-9a-f]{32}$/,
      ),
    });
    expect(tx.deadLetterJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          resolutionStatus: 'REPLAYING',
          replayClaimedBy: 'user-1',
        }),
        data: expect.objectContaining({
          resolutionStatus: 'REPLAYED',
          replayRunId: 'agent-retry-1',
          replayEligible: false,
        }),
      }),
    );
    expect(tx.deadLetterJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          replayReason: replayDto.reason,
          replayIdempotencyKey: replayDto.idempotencyKey,
        }),
      }),
    );
    expect(audit.appendStrict).toHaveBeenCalled();
  });

  it('recovers automation by creating a fresh run instead of replaying the old queue payload', async () => {
    const { service, automation } = createService({
      id: 'dead-automation-1',
      organizationId: 'org-1',
      queueName: 'automation-runs',
      data: { automationRunId: 'automation-run-1' },
      classification: 'RETRYABLE',
      replayEligible: true,
      resolutionStatus: 'OPEN',
      inspectedAt: null,
      notes: null,
    });

    await service.replay(user, 'dead-automation-1', replayDto);

    expect(automation.recoverFromFailure).toHaveBeenCalledWith({
      organizationId: 'org-1',
      actorId: 'user-1',
      flowId: 'flow-1',
      failedRunId: 'automation-run-1',
      reason: replayDto.reason,
      idempotencyKey: replayDto.idempotencyKey,
      source: 'dead_letter_triage',
    });
  });

  it('atomically claims a replay so concurrent requests create only one recovery run', async () => {
    const { service, tx, agentRuns } = createService({
      id: 'dead-agent-concurrent-1',
      organizationId: 'org-1',
      queueName: 'agent-runs',
      data: { agentRunId: 'agent-run-1' },
      classification: 'RETRYABLE',
      replayEligible: true,
      resolutionStatus: 'OPEN',
      inspectedAt: null,
      notes: null,
    });

    const results = await Promise.allSettled([
      service.replay(user, 'dead-agent-concurrent-1', replayDto),
      service.replay(user, 'dead-agent-concurrent-1', replayDto),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: expect.any(ConflictException),
    });
    const claimCalls = tx.deadLetterJob.updateMany.mock.calls.filter(
      ([input]) => input.where?.replayEligible === true,
    );
    expect(claimCalls).toHaveLength(2);
    expect(agentRuns.retry).toHaveBeenCalledTimes(1);
  });

  it('keeps a failed claimed replay closed and records an audit event', async () => {
    const { service, tx, agentRuns, audit } = createService({
      id: 'dead-agent-failed-replay-1',
      organizationId: 'org-1',
      queueName: 'agent-runs',
      data: { agentRunId: 'agent-run-1' },
      classification: 'RETRYABLE',
      replayEligible: true,
      resolutionStatus: 'OPEN',
      inspectedAt: null,
      notes: null,
    });
    agentRuns.retry.mockRejectedValueOnce(new Error('queue unavailable'));

    await expect(
      service.replay(user, 'dead-agent-failed-replay-1', replayDto),
    ).rejects.toThrow('queue unavailable');

    expect(tx.deadLetterJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'dead-agent-failed-replay-1',
          resolutionStatus: 'OPEN',
          replayEligible: true,
        }),
        data: expect.objectContaining({ replayEligible: false }),
      }),
    );
    expect(tx.deadLetterJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'dead-agent-failed-replay-1',
          resolutionStatus: 'REPLAYING',
        }),
        data: expect.objectContaining({
          resolutionStatus: 'OPEN',
          replayEligible: false,
        }),
      }),
    );
    expect(audit.appendStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'dead-letter.replay-failed',
        resourceId: 'dead-agent-failed-replay-1',
      }),
    );
  });

  it('reopens an expired replay claim as non-replayable for manual inspection', async () => {
    const { service, tx, audit } = createService({
      id: 'unused',
      organizationId: 'org-1',
    });
    tx.deadLetterJob.findMany
      .mockResolvedValueOnce([
        {
          id: 'dead-stale-claim-1',
          organizationId: 'org-1',
          queueName: 'automation-runs',
          jobId: 'job-stale-1',
          resolutionStatus: 'REPLAYING',
          replayEligible: false,
          replayClaimedAt: new Date('2026-07-15T00:00:00.000Z'),
          replayClaimedBy: 'user-old',
          notes: null,
        },
      ])
      .mockResolvedValueOnce([]);

    await expect(service.triageOpen(user)).resolves.toEqual(
      expect.objectContaining({ staleClaimsReleased: 1 }),
    );

    expect(tx.deadLetterJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'dead-stale-claim-1',
          resolutionStatus: 'REPLAYING',
        }),
        data: expect.objectContaining({
          resolutionStatus: 'OPEN',
          replayEligible: false,
          replayClaimedAt: null,
          replayClaimedBy: null,
        }),
      }),
    );
    expect(audit.appendStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'dead-letter.replay-claim-expired',
        resourceId: 'dead-stale-claim-1',
      }),
    );
  });
});
