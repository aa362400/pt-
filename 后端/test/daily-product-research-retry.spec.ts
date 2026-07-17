import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  RequestMethod,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DailyProductResearchController } from '../src/features/product-research/daily/daily-product-research.controller.js';
import { DailyProductResearchService } from '../src/features/product-research/daily/daily-product-research.service.js';

const user = {
  sub: 'user-1',
  orgId: 'org-1',
  role: 'OWNER',
} as never;

function fixture(input?: {
  status?:
    | 'PENDING'
    | 'RUNNING'
    | 'PAUSED'
    | 'PARTIAL'
    | 'COMPLETED'
    | 'FAILED'
    | 'CANCELLED'
    | 'STOPPED';
  queueState?:
    | 'active'
    | 'completed'
    | 'delayed'
    | 'failed'
    | 'prioritized'
    | 'unknown'
    | 'waiting'
    | 'waiting-children';
  queueJobMissing?: boolean;
  retryFailure?: boolean;
  removeFailure?: boolean;
}) {
  const run = {
    id: 'run-1',
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    status: input?.status ?? 'FAILED',
    trigger: 'MANUAL',
    controlRevision: 7,
    checkpointStage: 'COLLECT',
    checkpointedAt: new Date('2026-07-17T01:00:00.000Z'),
    createdBy: 'user-1',
  };
  const productResearchRun = {
    findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      where.id === run.id && where.organizationId === run.organizationId
        ? run
        : null,
    ),
    update: jest.fn(),
    updateMany: jest.fn(),
  };
  const tenantDatabase = {
    run: jest.fn(
      async (
        organizationId: string,
        operation: (client: {
          productResearchRun: typeof productResearchRun;
        }) => unknown,
      ) => {
        expect(organizationId).toBeTruthy();
        return operation({ productResearchRun });
      },
    ),
  };
  const currentJob = {
    getState: jest
      .fn()
      .mockResolvedValue(
        input?.retryFailure ? 'waiting' : (input?.queueState ?? 'failed'),
      ),
    updateData: jest.fn().mockResolvedValue(undefined),
    retry: input?.retryFailure
      ? jest.fn().mockRejectedValue(new Error('retry race'))
      : jest.fn().mockResolvedValue(undefined),
    remove: input?.removeFailure
      ? jest.fn().mockRejectedValue(new Error('remove failed'))
      : jest.fn().mockResolvedValue(undefined),
  };
  const failedJob = {
    ...currentJob,
    getState: jest.fn().mockResolvedValue(input?.queueState ?? 'failed'),
  };
  const queue = {
    getJob: input?.retryFailure
      ? jest.fn().mockResolvedValueOnce(failedJob).mockResolvedValue(currentJob)
      : jest.fn().mockResolvedValue(input?.queueJobMissing ? null : failedJob),
    add: jest.fn().mockResolvedValue(undefined),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const agentPermissions = {
    check: jest.fn().mockResolvedValue({ allowed: true }),
  };
  const service = new DailyProductResearchService(
    {} as never,
    tenantDatabase as never,
    audit as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    agentPermissions as never,
    queue as never,
    {} as never,
  );
  return {
    service,
    run,
    productResearchRun,
    tenantDatabase,
    failedJob,
    currentJob,
    queue,
    audit,
    agentPermissions,
  };
}

describe('DailyProductResearchService.retryRun', () => {
  it('retries the retained failed BullMQ job with reset attempts and keeps the durable run/checkpoint', async () => {
    const subject = fixture();

    await expect(subject.service.retryRun(user, 'run-1')).resolves.toBe(
      subject.run,
    );

    expect(subject.queue.getJob).toHaveBeenCalledWith(
      'daily-product-research-run-1-control-7',
    );
    expect(subject.failedJob.updateData).toHaveBeenCalledWith({
      schemaVersion: 'daily-product-research/v1',
      researchRunId: 'run-1',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      trigger: 'RETRY',
      controlRevision: 7,
    });
    expect(subject.failedJob.retry).toHaveBeenCalledWith('failed', {
      resetAttemptsMade: true,
      resetAttemptsStarted: true,
    });
    expect(subject.queue.add).not.toHaveBeenCalled();
    expect(subject.productResearchRun.update).not.toHaveBeenCalled();
    expect(subject.productResearchRun.updateMany).not.toHaveBeenCalled();
    expect(subject.run.checkpointStage).toBe('COLLECT');
    expect(subject.audit.log).toHaveBeenCalledWith({
      organizationId: 'org-1',
      actorId: 'user-1',
      action: 'daily-product-research.retry',
      resourceType: 'ProductResearchRun',
      resourceId: 'run-1',
      after: {
        trigger: 'RETRY',
        queueAction: 'RETRIED',
        controlRevision: 7,
        checkpointStage: 'COLLECT',
      },
    });
  });

  it('recreates only the missing stable queue job without creating a new research run', async () => {
    const subject = fixture({ queueJobMissing: true });

    await expect(subject.service.retryRun(user, 'run-1')).resolves.toBe(
      subject.run,
    );

    expect(subject.queue.add).toHaveBeenCalledWith(
      'run',
      expect.objectContaining({
        researchRunId: 'run-1',
        organizationId: 'org-1',
        trigger: 'RETRY',
        controlRevision: 7,
      }),
      { jobId: 'daily-product-research-run-1-control-7' },
    );
    expect(subject.productResearchRun.update).not.toHaveBeenCalled();
    expect(subject.productResearchRun.updateMany).not.toHaveBeenCalled();
  });

  it('treats an already waiting stable job as an idempotent retry request', async () => {
    const subject = fixture({ queueState: 'waiting' });

    await expect(subject.service.retryRun(user, 'run-1')).resolves.toBe(
      subject.run,
    );

    expect(subject.failedJob.retry).not.toHaveBeenCalled();
    expect(subject.queue.add).not.toHaveBeenCalled();
    expect(subject.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({ queueAction: 'ALREADY_QUEUED' }),
      }),
    );
  });

  it('accepts a retry race when a peer has already moved the stable job to waiting', async () => {
    const subject = fixture({ retryFailure: true });

    await expect(subject.service.retryRun(user, 'run-1')).resolves.toBe(
      subject.run,
    );

    expect(subject.failedJob.retry).toHaveBeenCalledWith('failed', {
      resetAttemptsMade: true,
      resetAttemptsStarted: true,
    });
    expect(subject.queue.getJob).toHaveBeenCalledTimes(2);
    expect(subject.queue.add).not.toHaveBeenCalled();
  });

  it('fails closed when an unknown retained job cannot be removed or proven non-terminal', async () => {
    const subject = fixture({ queueState: 'unknown', removeFailure: true });

    await expect(subject.service.retryRun(user, 'run-1')).rejects.toEqual(
      new InternalServerErrorException('DAILY_RESEARCH_QUEUE_UNAVAILABLE'),
    );

    expect(subject.failedJob.remove).toHaveBeenCalledTimes(1);
    expect(subject.queue.getJob).toHaveBeenCalledTimes(2);
    expect(subject.queue.add).not.toHaveBeenCalled();
    expect(subject.audit.log).not.toHaveBeenCalled();
  });

  it.each([
    'PENDING',
    'RUNNING',
    'PAUSED',
    'PARTIAL',
    'COMPLETED',
    'CANCELLED',
    'STOPPED',
  ] as const)('rejects %s without touching the queue', async (status) => {
    const subject = fixture({ status });

    await expect(subject.service.retryRun(user, 'run-1')).rejects.toEqual(
      new ConflictException(`仅失败的选品任务可以重试，当前状态：${status}`),
    );
    expect(subject.queue.getJob).not.toHaveBeenCalled();
    expect(subject.queue.add).not.toHaveBeenCalled();
  });

  it('does not reveal or retry a run outside the current organization', async () => {
    const subject = fixture();

    await expect(
      subject.service.retryRun(
        { sub: 'user-2', orgId: 'org-2', role: 'OWNER' } as never,
        'run-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(subject.tenantDatabase.run).toHaveBeenCalledWith(
      'org-2',
      expect.any(Function),
    );
    expect(subject.queue.getJob).not.toHaveBeenCalled();
    expect(subject.audit.log).not.toHaveBeenCalled();
  });
});

describe('DailyProductResearchController retry route', () => {
  it('exposes POST /daily-product-research/runs/:id/retry and delegates the current user', async () => {
    const run = { id: 'run-1', status: 'FAILED' };
    const service = {
      retryRun: jest.fn().mockResolvedValue(run),
    };
    const controller = new DailyProductResearchController(
      service as never,
      {} as never,
    );

    await expect(controller.retry(user, 'run-1')).resolves.toBe(run);
    expect(service.retryRun).toHaveBeenCalledWith(user, 'run-1');
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        DailyProductResearchController.prototype.retry,
      ),
    ).toBe('runs/:id/retry');
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        DailyProductResearchController.prototype.retry,
      ),
    ).toBe(RequestMethod.POST);
  });
});
