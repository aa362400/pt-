import { createHash } from 'node:crypto';
import { OrganizationAgentControlResumeDispatcherService } from '../src/shared/agent-control/organization-agent-control-resume-dispatcher.service.js';

function fixture(input?: {
  state?: 'RUNNING' | 'PAUSE_REQUESTED' | 'STOP_REQUESTED';
  revision?: number;
  automationQueueFails?: boolean;
  runStatus?: 'PENDING' | 'PAUSED' | 'RUNNING';
  researchLeaseExpired?: boolean;
  automationJobState?: 'waiting' | 'completed' | 'failed' | 'unknown';
  productLaunchPaused?: boolean;
  publishQueueMissing?: boolean;
  publishQueueJobState?: 'waiting' | 'completed' | 'failed';
  publishGrantTtlMs?: number;
}) {
  const runStatus = input?.runStatus ?? 'PAUSED';
  const researchLeaseExpiresAt =
    runStatus === 'RUNNING'
      ? new Date(Date.now() + (input?.researchLeaseExpired ? -60_000 : 60_000))
      : null;
  const publishGrant = 'plg_test_publish_grant';
  const prisma = {
    organization: {
      findMany: jest.fn().mockResolvedValue([{ id: 'org-1' }]),
    },
  };
  const automationRun = {
    findMany: jest.fn().mockResolvedValue([
      {
        id: 'automation-paused-1',
        status: runStatus,
        idempotencyKey: 'automation-key-1',
        triggerSource: 'manual',
        triggerReason: 'Original automation reason',
        traceId: 'a'.repeat(32),
        jobSnapshot: {
          traceparent: `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`,
        },
        controlRevision: 6,
        flow: {
          workspaceId: 'workspace-1',
          name: '[智能体自动运营] Ozon 选品巡检',
          triggerConfig: { source: 'connected_store_operator' },
        },
      },
    ]),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const researchRuns = [
    {
      id: 'research-resumable-1',
      status: runStatus,
      trigger: 'MANUAL',
      workspaceId: 'workspace-1',
      checkpointStage: null,
      controlRevision: 6,
      leaseOwner: runStatus === 'RUNNING' ? 'crashed-owner' : null,
      leaseExpiresAt: researchLeaseExpiresAt,
      executionEpoch: runStatus === 'RUNNING' ? 3 : 0,
      currentStage: runStatus === 'RUNNING' ? 'COLLECT' : null,
    },
    {
      id: 'research-unsupported-1',
      status: runStatus,
      trigger: 'MANUAL',
      workspaceId: 'workspace-1',
      checkpointStage: 'COLLECT',
      controlRevision: 6,
      leaseOwner: runStatus === 'RUNNING' ? 'crashed-owner' : null,
      leaseExpiresAt: researchLeaseExpiresAt,
      executionEpoch: runStatus === 'RUNNING' ? 3 : 0,
      currentStage: runStatus === 'RUNNING' ? 'NORMALIZE' : null,
    },
  ];
  const productResearchRun = {
    findMany: jest
      .fn()
      .mockImplementation(async () =>
        runStatus === 'RUNNING' && !input?.researchLeaseExpired
          ? []
          : researchRuns,
      ),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const productResearchStageRun = {
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const productLaunch = {
    findMany: jest.fn().mockResolvedValue([
      {
        id: 'launch-paused-1',
        execution: { preparationAttemptId: 'prepare-attempt-1' },
        failureCode:
          input?.productLaunchPaused === false
            ? null
            : 'PRODUCT_LAUNCH_PAUSED_BEFORE_PREPARATION',
        confirmAutoPublish: false,
        approvedPublishSnapshotHash: null,
        publishExecutionGrantHash: null,
        publishExecutionGrantExpiresAt: null,
        externalSubmissions: [],
      },
      ...(input?.publishQueueMissing || input?.publishQueueJobState
        ? [
            {
              id: 'launch-publish-missing-1',
              execution: {},
              failureCode: null,
              confirmAutoPublish: true,
              approvedPublishSnapshotHash: 'snapshot-hash-1',
              publishExecutionGrantHash: createHash('sha256')
                .update(publishGrant)
                .digest('hex'),
              publishExecutionGrantExpiresAt: new Date(
                Date.now() + (input?.publishGrantTtlMs ?? 5 * 60_000),
              ),
              externalSubmissions: [{ status: 'PREPARED' }],
            },
          ]
        : []),
    ]),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const organizationAgentControl = {
    findUnique: jest.fn().mockResolvedValue({
      state: input?.state ?? 'RUNNING',
      revision: input?.revision ?? 7,
    }),
  };
  const tx = {
    automationRun,
    productResearchRun,
    productResearchStageRun,
    productLaunch,
    organizationAgentControl,
  };
  const tenantDatabase = {
    run: jest.fn(
      async (
        _organizationId: string,
        operation: (client: typeof tx) => unknown,
      ) => operation(tx),
    ),
  };
  const control = {
    lockEffectiveState: jest.fn().mockResolvedValue({
      state: input?.state ?? 'RUNNING',
      revision: input?.revision ?? 7,
    }),
  };
  const existingAutomationJob = input?.automationJobState
    ? {
        getState: jest.fn().mockResolvedValue(input.automationJobState),
        updateData: jest.fn().mockResolvedValue(undefined),
        retry: jest.fn().mockResolvedValue(undefined),
        remove: jest.fn().mockResolvedValue(undefined),
      }
    : null;
  const automationQueue = {
    getJob:
      input?.automationJobState === 'unknown'
        ? jest
            .fn()
            .mockResolvedValueOnce(existingAutomationJob)
            .mockResolvedValue(null)
        : jest.fn().mockResolvedValue(existingAutomationJob),
    add: input?.automationQueueFails
      ? jest
          .fn()
          .mockRejectedValueOnce(new Error('SECRET_REDIS_DETAIL'))
          .mockResolvedValue(undefined)
      : jest.fn().mockResolvedValue(undefined),
  };
  const researchQueue = {
    getJob: jest.fn().mockResolvedValue(null),
    add: jest.fn().mockResolvedValue(undefined),
  };
  const publishQueueJob = input?.publishQueueJobState
    ? {
        data: { publishExecutionGrant: publishGrant },
        getState: jest.fn().mockResolvedValue(input.publishQueueJobState),
        retry: jest.fn().mockResolvedValue(undefined),
        remove: jest.fn().mockResolvedValue(undefined),
      }
    : null;
  const productLaunchQueue = {
    getJob: jest.fn(async (jobId: string) =>
      jobId.includes('-publish-') ? publishQueueJob : null,
    ),
    add: jest.fn().mockResolvedValue(undefined),
  };
  const service = new OrganizationAgentControlResumeDispatcherService(
    prisma as never,
    tenantDatabase as never,
    control as never,
    automationQueue as never,
    researchQueue as never,
    productLaunchQueue as never,
  );
  const logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  Object.assign(service as object, { logger });
  return {
    service,
    prisma,
    organizationAgentControl,
    control,
    automationRun,
    productResearchRun,
    productResearchStageRun,
    productLaunch,
    automationQueue,
    existingAutomationJob,
    researchQueue,
    productLaunchQueue,
    publishQueueJob,
    logger,
  };
}

describe('OrganizationAgentControlResumeDispatcherService', () => {
  it('moves resumable PAUSED revisions forward under the control lock and uses revision-qualified jobs', async () => {
    const subject = fixture();

    await expect(subject.service.dispatch('org-1', 7)).resolves.toEqual({
      schemaVersion: 'organization-agent-resume-dispatch/v1',
      controlRevision: 7,
      state: 'DISPATCHED',
      automation: { eligible: 1, ensured: 1, failed: [] },
      research: {
        eligible: 2,
        ensured: 2,
        unsupported: [],
        failed: [],
      },
      productLaunch: { eligible: 1, ensured: 1, failed: [] },
    });
    expect(subject.control.lockEffectiveState).toHaveBeenCalledWith(
      expect.objectContaining({
        automationRun: subject.automationRun,
        productResearchRun: subject.productResearchRun,
      }),
      'org-1',
    );
    expect(subject.automationRun.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'automation-paused-1',
        flow: { organizationId: 'org-1' },
        status: 'PAUSED',
        controlRevision: 6,
      },
      data: { controlRevision: 7 },
    });
    expect(subject.automationQueue.add).toHaveBeenCalledWith(
      'run',
      expect.objectContaining({
        automationRunId: 'automation-paused-1',
        organizationId: 'org-1',
        controlRevision: 7,
      }),
      {
        priority: 0,
        jobId: 'automation-run-automation-paused-1-control-7',
      },
    );
    expect(subject.researchQueue.add).toHaveBeenCalledWith(
      'run',
      expect.objectContaining({
        researchRunId: 'research-resumable-1',
        trigger: 'RETRY',
        controlRevision: 7,
      }),
      {
        jobId: 'daily-product-research-research-resumable-1-control-7',
      },
    );
    expect(subject.productResearchRun.updateMany).toHaveBeenCalledTimes(2);
    expect(subject.productResearchRun.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'research-unsupported-1',
        organizationId: 'org-1',
        status: 'PAUSED',
        controlRevision: 6,
        checkpointStage: 'COLLECT',
      },
      data: {
        controlRevision: 7,
      },
    });
    expect(subject.productLaunch.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        status: 'QUEUED',
        OR: [
          { confirmAutoPublish: false },
          {
            confirmAutoPublish: true,
            updatedAt: { lte: expect.any(Date) },
          },
        ],
      },
      select: {
        id: true,
        execution: true,
        failureCode: true,
        confirmAutoPublish: true,
        approvedPublishSnapshotHash: true,
        publishExecutionGrantHash: true,
        publishExecutionGrantExpiresAt: true,
        externalSubmissions: { select: { status: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    expect(subject.productLaunchQueue.add).toHaveBeenCalledWith(
      'product-launch',
      {
        productLaunchId: 'launch-paused-1',
        organizationId: 'org-1',
        preparationAttemptId: 'prepare-attempt-1',
        controlRevision: 7,
      },
      {
        jobId:
          'product-launch-launch-paused-1-prepare-prepare-attempt-1-control-7',
      },
    );
  });

  it('does not mutate or enqueue when control changed after resume', async () => {
    const subject = fixture({ state: 'PAUSE_REQUESTED', revision: 8 });

    await expect(subject.service.dispatch('org-1', 7)).resolves.toMatchObject({
      state: 'CONTROL_CHANGED',
      controlRevision: 8,
    });
    expect(subject.automationRun.findMany).not.toHaveBeenCalled();
    expect(subject.productResearchRun.findMany).not.toHaveBeenCalled();
    expect(subject.automationQueue.add).not.toHaveBeenCalled();
    expect(subject.researchQueue.add).not.toHaveBeenCalled();
    expect(subject.productLaunchQueue.add).not.toHaveBeenCalled();
  });

  it('reports a sanitized queue failure and leaves the PAUSED row retryable', async () => {
    const subject = fixture({ automationQueueFails: true });

    const report = await subject.service.dispatch('org-1', 7);

    expect(report.automation).toEqual({
      eligible: 1,
      ensured: 0,
      failed: [{ runId: 'automation-paused-1', code: 'QUEUE_ADD_FAILED' }],
    });
    expect(JSON.stringify(report)).not.toContain('SECRET_REDIS_DETAIL');

    await expect(subject.service.dispatch('org-1', 7)).resolves.toMatchObject({
      automation: { eligible: 1, ensured: 1, failed: [] },
    });
    expect(subject.automationQueue.add).toHaveBeenNthCalledWith(
      2,
      'run',
      expect.objectContaining({
        automationRunId: 'automation-paused-1',
        controlRevision: 7,
      }),
      expect.objectContaining({
        jobId: 'automation-run-automation-paused-1-control-7',
      }),
    );
  });

  it('periodically re-dispatches durable RUNNING controls', async () => {
    const subject = fixture();

    await subject.service.reconcileMissingJobs();

    expect(subject.prisma.organization.findMany).toHaveBeenCalledWith({
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    expect(subject.organizationAgentControl.findUnique).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      select: { state: true, revision: true },
    });
    expect(subject.automationQueue.add).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['PAUSE_REQUESTED', 'PAUSED'],
    ['STOP_REQUESTED', 'STOPPED'],
  ] as const)(
    'parks an expired RUNNING research lease as %s after a hard crash under %s control',
    async (controlState, expectedStatus) => {
      const subject = fixture({
        state: controlState,
        revision: 8,
        runStatus: 'RUNNING',
        researchLeaseExpired: true,
      });

      await subject.service.reconcileMissingJobs();

      expect(subject.productResearchRun.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'research-resumable-1',
          organizationId: 'org-1',
          status: 'RUNNING',
          leaseOwner: 'crashed-owner',
          leaseExpiresAt: expect.any(Date),
          executionEpoch: 3,
        },
        data: {
          status: expectedStatus,
          currentStage: null,
          controlRevision: 8,
          leaseOwner: null,
          leaseExpiresAt: null,
          finishedAt: expectedStatus === 'STOPPED' ? expect.any(Date) : null,
        },
      });
      expect(subject.productResearchStageRun.updateMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          researchRunId: 'research-resumable-1',
          stage: 'COLLECT',
          attempt: 0,
          status: 'RUNNING',
        },
        data: {
          status: 'FAILED',
          finishedAt: expect.any(Date),
          errorCode: 'DAILY_RESEARCH_EXECUTION_LEASE_EXPIRED',
          errorMessage:
            'The execution lease expired before the organization control transition reached a safe stage boundary.',
        },
      });
      expect(subject.researchQueue.add).not.toHaveBeenCalled();
      expect(subject.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('daily_research_expired_lease_parked'),
      );
    },
  );

  it('leaves a future RUNNING research lease untouched while pause is pending', async () => {
    const subject = fixture({
      state: 'PAUSE_REQUESTED',
      revision: 8,
      runStatus: 'RUNNING',
      researchLeaseExpired: false,
    });

    await subject.service.reconcileMissingJobs();

    expect(subject.productResearchRun.findMany).toHaveBeenCalled();
    expect(subject.productResearchRun.updateMany).not.toHaveBeenCalled();
    expect(subject.productResearchStageRun.updateMany).not.toHaveBeenCalled();
    expect(subject.researchQueue.add).not.toHaveBeenCalled();
  });

  it('recovers initial PENDING rows using their original trigger and job identity', async () => {
    const subject = fixture({
      runStatus: 'PENDING',
      productLaunchPaused: false,
    });

    const report = await subject.service.dispatch('org-1', 7);

    expect(report).toMatchObject({
      automation: { eligible: 1, ensured: 1, failed: [] },
      research: { eligible: 2, ensured: 2, failed: [] },
      productLaunch: { eligible: 1, ensured: 1, failed: [] },
    });
    expect(subject.automationQueue.add).toHaveBeenCalledWith(
      'run',
      expect.objectContaining({
        trigger: 'manual',
        reason: 'Original automation reason',
      }),
      expect.objectContaining({
        jobId: 'automation-run-automation-paused-1-control-7',
      }),
    );
    expect(subject.researchQueue.add).toHaveBeenCalledWith(
      'run',
      expect.objectContaining({ trigger: 'MANUAL' }),
      expect.any(Object),
    );
    expect(subject.productLaunchQueue.add).toHaveBeenCalledWith(
      'product-launch',
      expect.any(Object),
      {
        jobId: 'product-launch-launch-paused-1-prepare-prepare-attempt-1',
      },
    );
  });

  it('atomically recovers expired RUNNING research leases before stable requeue', async () => {
    const subject = fixture({
      runStatus: 'RUNNING',
      researchLeaseExpired: true,
    });

    const report = await subject.service.dispatch('org-1', 7);

    expect(report.research).toMatchObject({
      eligible: 2,
      ensured: 2,
      failed: [],
    });
    expect(subject.productResearchRun.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'research-resumable-1',
        organizationId: 'org-1',
        status: 'RUNNING',
        leaseOwner: 'crashed-owner',
        leaseExpiresAt: expect.any(Date),
        executionEpoch: 3,
      }),
      data: {
        status: 'PENDING',
        currentStage: null,
        controlRevision: 7,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    expect(subject.researchQueue.add).toHaveBeenCalledWith(
      'run',
      expect.objectContaining({
        researchRunId: 'research-resumable-1',
        trigger: 'RETRY',
        controlRevision: 7,
      }),
      {
        jobId: 'daily-product-research-research-resumable-1-control-7',
      },
    );
  });

  it('atomically retries a retained failed job with reset attempts', async () => {
    const subject = fixture({ automationJobState: 'failed' });

    const report = await subject.service.dispatch('org-1', 7);
    expect(report.automation).toEqual({
      eligible: 1,
      ensured: 1,
      failed: [],
    });
    expect(subject.existingAutomationJob?.updateData).toHaveBeenCalledWith(
      expect.objectContaining({
        automationRunId: 'automation-paused-1',
        controlRevision: 7,
      }),
    );
    expect(subject.existingAutomationJob?.retry).toHaveBeenCalledWith(
      'failed',
      { resetAttemptsMade: true, resetAttemptsStarted: true },
    );
    expect(subject.automationQueue.add).not.toHaveBeenCalled();
  });

  it('treats an existing non-terminal job as ensured without duplicating it', async () => {
    const subject = fixture({ automationJobState: 'waiting' });

    const report = await subject.service.dispatch('org-1', 7);

    expect(report.automation).toEqual({
      eligible: 1,
      ensured: 1,
      failed: [],
    });
    expect(subject.automationQueue.add).not.toHaveBeenCalled();
  });

  it('removes an orphaned unknown job before recreating its stable id', async () => {
    const subject = fixture({ automationJobState: 'unknown' });

    const report = await subject.service.dispatch('org-1', 7);

    expect(report.automation).toEqual({
      eligible: 1,
      ensured: 1,
      failed: [],
    });
    expect(subject.existingAutomationJob?.remove).toHaveBeenCalledTimes(1);
    expect(subject.automationQueue.add).toHaveBeenCalledWith(
      'run',
      expect.any(Object),
      expect.objectContaining({
        jobId: 'automation-run-automation-paused-1-control-7',
      }),
    );
  });

  it('fails a missing publish job back to explicit reapproval instead of fabricating a grant', async () => {
    const subject = fixture({ publishQueueMissing: true });

    const report = await subject.service.dispatch('org-1', 7);

    expect(report.productLaunch).toEqual({
      eligible: 2,
      ensured: 1,
      failed: [
        {
          runId: 'launch-publish-missing-1',
          code: 'PUBLISH_REAPPROVAL_REQUIRED',
        },
      ],
    });
    expect(subject.productLaunch.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'launch-publish-missing-1',
        organizationId: 'org-1',
        status: 'QUEUED',
        confirmAutoPublish: true,
        approvedPublishSnapshotHash: 'snapshot-hash-1',
        publishExecutionGrantHash: createHash('sha256')
          .update('plg_test_publish_grant')
          .digest('hex'),
      }),
      data: expect.objectContaining({
        status: 'AWAITING_PUBLISH_APPROVAL',
        confirmAutoPublish: false,
        publishExecutionGrantHash: null,
        failureCode: 'PUBLISH_QUEUE_JOB_MISSING_REAPPROVAL_REQUIRED',
      }),
    });
  });

  it('atomically retries a retained publish job without reconstructing its plaintext grant', async () => {
    const subject = fixture({ publishQueueJobState: 'failed' });

    const report = await subject.service.dispatch('org-1', 7);

    expect(report.productLaunch).toEqual({
      eligible: 2,
      ensured: 2,
      failed: [],
    });
    expect(subject.publishQueueJob?.retry).toHaveBeenCalledWith('failed', {
      resetAttemptsMade: true,
      resetAttemptsStarted: true,
    });
    expect(subject.productLaunch.updateMany).not.toHaveBeenCalled();
  });

  it('requires reapproval instead of retrying a terminal publish job with a near-expiry grant', async () => {
    const subject = fixture({
      publishQueueJobState: 'failed',
      publishGrantTtlMs: 30_000,
    });

    const report = await subject.service.dispatch('org-1', 7);

    expect(report.productLaunch).toEqual({
      eligible: 2,
      ensured: 1,
      failed: [
        {
          runId: 'launch-publish-missing-1',
          code: 'PUBLISH_REAPPROVAL_REQUIRED',
        },
      ],
    });
    expect(subject.publishQueueJob?.retry).not.toHaveBeenCalled();
    expect(subject.publishQueueJob?.remove).toHaveBeenCalledTimes(1);
    expect(subject.productLaunch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'AWAITING_PUBLISH_APPROVAL',
          confirmAutoPublish: false,
          publishExecutionGrantHash: null,
        }),
      }),
    );
  });
});
