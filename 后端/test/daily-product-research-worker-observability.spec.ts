import { asyncLocalStorage } from '../src/shared/middleware/request-id.middleware.js';
import { QueueJobTimeoutError } from '../src/shared/queue/queue-job-deadline.js';
import { QUEUE_CONFIG } from '../src/shared/queue/queue.module.js';
import { DailyProductResearchWorker } from '../src/workers/daily-product-research.worker.js';

describe('DailyProductResearchWorker observability', () => {
  it('correlates successful queue work with the run and tenant', async () => {
    let context: Record<string, string> = {};
    const orchestrator = {
      execute: jest.fn(async () => {
        context = Object.fromEntries(asyncLocalStorage.getStore() ?? []);
        return {
          researchRunId: 'run-1',
          status: 'PARTIAL',
          summary: { testNow: 0, rejected: 4 },
        };
      }),
    };
    const queue = { setGlobalConcurrency: jest.fn() };
    const worker = new DailyProductResearchWorker(
      orchestrator as never,
      queue as never,
    );
    const logger = { log: jest.fn(), error: jest.fn() };
    (worker as unknown as { logger: typeof logger }).logger = logger;
    const job = {
      id: 'daily-product-research-run-1',
      attemptsMade: 0,
      data: {
        schemaVersion: 'daily-product-research/v1',
        researchRunId: 'run-1',
        organizationId: 'org-1',
        workspaceId: null,
        trigger: 'MANUAL',
        controlRevision: 7,
      },
      updateProgress: jest.fn().mockResolvedValue(undefined),
    };

    await worker.process(job as never);

    expect(context).toMatchObject({
      requestId: 'run-1:attempt:1',
      runId: 'run-1',
      tenantId: 'org-1',
    });
    expect(context.traceId).toMatch(/^[a-f0-9]{32}$/);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('daily_research_job_started'),
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('daily_research_job_completed'),
    );
    expect(logger.log.mock.calls.flat().join(' ')).toContain('run-1');
    expect(job.updateProgress.mock.calls).toEqual([[1], [100]]);
    expect(orchestrator.execute).toHaveBeenCalledWith(
      'org-1',
      'run-1',
      expect.any(AbortSignal),
      7,
      expect.stringMatching(/^daily-worker-[a-f0-9-]+$/),
    );
  });

  it('enforces the configured concurrency across backend replicas', async () => {
    const queue = {
      setGlobalConcurrency: jest.fn().mockResolvedValue(undefined),
    };
    const worker = new DailyProductResearchWorker(
      { execute: jest.fn() } as never,
      queue as never,
    );

    await worker.onApplicationBootstrap();

    expect(queue.setGlobalConcurrency).toHaveBeenCalledWith(1);
  });

  it.each(['PAUSED', 'STOPPED'] as const)(
    'acknowledges %s as a normal queue result without throwing for a Bull retry',
    async (status) => {
      const orchestrator = {
        execute: jest.fn().mockResolvedValue({
          researchRunId: 'run-controlled',
          status,
          reused: false,
        }),
      };
      const worker = new DailyProductResearchWorker(
        orchestrator as never,
        { setGlobalConcurrency: jest.fn() } as never,
      );
      const job = {
        id: 'daily-job-controlled',
        attemptsMade: 0,
        data: {
          schemaVersion: 'daily-product-research/v1',
          researchRunId: 'run-controlled',
          organizationId: 'org-1',
          workspaceId: null,
          trigger: 'MANUAL',
          controlRevision: 3,
        },
        updateProgress: jest.fn().mockResolvedValue(undefined),
      };

      await expect(worker.process(job as never)).resolves.toMatchObject({
        status,
      });
      expect(job.updateProgress.mock.calls).toEqual([[1], [100]]);
      expect(orchestrator.execute).toHaveBeenCalledWith(
        'org-1',
        'run-controlled',
        expect.any(AbortSignal),
        3,
        expect.stringMatching(/^daily-worker-[a-f0-9-]+$/),
      );
    },
  );

  it('aborts orchestration at the configured execution deadline without reporting 100% progress', async () => {
    jest.useFakeTimers();
    const orchestrator = {
      execute: jest.fn(
        (_organizationId: string, _runId: string, signal: AbortSignal) =>
          new Promise<never>((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => reject(signal.reason as Error),
              { once: true },
            );
          }),
      ),
    };
    const worker = new DailyProductResearchWorker(
      orchestrator as never,
      { setGlobalConcurrency: jest.fn() } as never,
    );
    const job = {
      id: 'daily-job-timeout',
      attemptsMade: 0,
      data: {
        schemaVersion: 'daily-product-research/v1',
        researchRunId: 'run-timeout',
        organizationId: 'org-1',
        workspaceId: null,
        trigger: 'MANUAL',
      },
      updateProgress: jest.fn().mockResolvedValue(undefined),
    };

    try {
      const processing = worker.process(job as never);
      const assertion = expect(processing).rejects.toMatchObject({
        name: 'QueueJobTimeoutError',
        queueName: 'daily-product-research',
        jobId: 'daily-job-timeout',
        timeoutMs: QUEUE_CONFIG['daily-product-research'].executionTimeoutMs,
      });

      await jest.advanceTimersByTimeAsync(
        QUEUE_CONFIG['daily-product-research'].executionTimeoutMs,
      );

      await assertion;
      expect(orchestrator.execute).toHaveBeenCalledWith(
        'org-1',
        'run-timeout',
        expect.any(AbortSignal),
        undefined,
        expect.stringMatching(/^daily-worker-[a-f0-9-]+$/),
      );
      expect(job.updateProgress).toHaveBeenCalledTimes(1);
      expect(job.updateProgress).toHaveBeenCalledWith(1);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  it('preserves the Bull parent abort reason', async () => {
    const parentController = new AbortController();
    const parentReason = new QueueJobTimeoutError(
      'parent-queue',
      'parent-job',
      5_000,
    );
    const orchestrator = {
      execute: jest.fn(
        (_organizationId: string, _runId: string, signal: AbortSignal) =>
          new Promise<never>((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => reject(signal.reason as Error),
              { once: true },
            );
          }),
      ),
    };
    const worker = new DailyProductResearchWorker(
      orchestrator as never,
      { setGlobalConcurrency: jest.fn() } as never,
    );
    const job = {
      id: 'daily-job-parent-abort',
      attemptsMade: 1,
      data: {
        schemaVersion: 'daily-product-research/v1',
        researchRunId: 'run-parent-abort',
        organizationId: 'org-1',
        workspaceId: null,
        trigger: 'SCHEDULE',
      },
      updateProgress: jest.fn().mockResolvedValue(undefined),
    };
    const processing = worker.process(
      job as never,
      undefined,
      parentController.signal,
    );
    const assertion = expect(processing).rejects.toBe(parentReason);

    await Promise.resolve();
    parentController.abort(parentReason);

    await assertion;
    expect(job.updateProgress).toHaveBeenCalledTimes(1);
  });

  it('waits for final progress to finish, then times out without logging completion', async () => {
    jest.useFakeTimers();
    let resolveFinalProgress: (() => void) | undefined;
    let settled = false;
    const orchestrator = {
      execute: jest.fn().mockResolvedValue({
        researchRunId: 'run-final-progress-timeout',
        status: 'PARTIAL',
      }),
    };
    const worker = new DailyProductResearchWorker(
      orchestrator as never,
      { setGlobalConcurrency: jest.fn() } as never,
    );
    const logger = { log: jest.fn(), error: jest.fn() };
    (worker as unknown as { logger: typeof logger }).logger = logger;
    const job = {
      id: 'daily-job-final-progress-timeout',
      attemptsMade: 0,
      data: {
        schemaVersion: 'daily-product-research/v1',
        researchRunId: 'run-final-progress-timeout',
        organizationId: 'org-1',
        workspaceId: null,
        trigger: 'MANUAL',
      },
      updateProgress: jest.fn((progress: number) =>
        progress === 100
          ? new Promise<void>((resolve) => {
              resolveFinalProgress = resolve;
            })
          : Promise.resolve(),
      ),
    };

    try {
      const processing = worker.process(job as never);
      void processing.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );
      const assertion = expect(processing).rejects.toMatchObject({
        name: 'QueueJobTimeoutError',
        queueName: 'daily-product-research',
        jobId: 'daily-job-final-progress-timeout',
      });
      await jest.advanceTimersByTimeAsync(0);

      expect(job.updateProgress.mock.calls).toEqual([[1], [100]]);
      await jest.advanceTimersByTimeAsync(
        QUEUE_CONFIG['daily-product-research'].executionTimeoutMs,
      );

      expect(settled).toBe(false);
      resolveFinalProgress?.();
      await assertion;
      expect(logger.log).not.toHaveBeenCalledWith(
        expect.stringContaining('daily_research_job_completed'),
      );
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });
});
