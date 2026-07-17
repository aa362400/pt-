import { DailyProductResearchOrchestratorService } from '../src/features/product-research/daily/services/daily-product-research-orchestrator.service.js';
import { QueueJobTimeoutError } from '../src/shared/queue/queue-job-deadline.js';

describe('DailyProductResearchOrchestratorService observability', () => {
  const executionFence = {
    leaseOwner: 'test-execution-owner',
    executionEpoch: 1,
  };

  it('logs every successful stage with the parent research run id', async () => {
    const service = new DailyProductResearchOrchestratorService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const logger = { log: jest.fn(), error: jest.fn() };
    const markStage = jest
      .fn()
      .mockResolvedValue({ active: true, control: null });
    const internals = service as unknown as {
      logger: typeof logger;
      markStage: typeof markStage;
      throwIfCancelled: jest.Mock;
      runStage<T>(
        organizationId: string,
        runId: string,
        fence: typeof executionFence,
        stage: string,
        signal: AbortSignal | undefined,
        operation: () => Promise<T>,
      ): Promise<T>;
    };
    internals.logger = logger;
    internals.markStage = markStage;
    internals.throwIfCancelled = jest.fn().mockResolvedValue(undefined);

    const result = await internals.runStage(
      'org-1',
      'run-1',
      executionFence,
      'NORMALIZE',
      undefined,
      async () => ({ candidates: 10 }),
    );

    expect(result).toEqual({ candidates: 10 });
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('daily_research_stage_started'),
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('daily_research_stage_completed'),
    );
    expect(logger.log.mock.calls.flat().join(' ')).toContain('run-1');
    expect(logger.log.mock.calls.flat().join(' ')).toContain('NORMALIZE');
  });

  it('does not start a later stage when the current stage crosses the execution deadline', async () => {
    const service = new DailyProductResearchOrchestratorService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const controller = new AbortController();
    const timeoutError = new QueueJobTimeoutError(
      'daily-product-research',
      'daily-job-1',
      1_800_000,
    );
    const markStage = jest
      .fn()
      .mockResolvedValue({ active: true, control: null });
    const laterStage = jest.fn().mockResolvedValue(undefined);
    const internals = service as unknown as {
      logger: { log: jest.Mock; error: jest.Mock };
      markStage: typeof markStage;
      throwIfCancelled: jest.Mock;
      runStage<T>(
        organizationId: string,
        runId: string,
        fence: typeof executionFence,
        stage: string,
        signal: AbortSignal | undefined,
        operation: () => Promise<T>,
      ): Promise<T>;
    };
    internals.logger = { log: jest.fn(), error: jest.fn() };
    internals.markStage = markStage;
    internals.throwIfCancelled = jest.fn().mockResolvedValue(undefined);

    const pipeline = async () => {
      await internals.runStage(
        'org-1',
        'run-1',
        executionFence,
        'COLLECT',
        controller.signal,
        async () => {
          controller.abort(timeoutError);
          return { candidates: 0 };
        },
      );
      await laterStage();
    };

    await expect(pipeline()).rejects.toBe(timeoutError);
    expect(laterStage).not.toHaveBeenCalled();
    expect(markStage).toHaveBeenCalledWith(
      'org-1',
      'run-1',
      executionFence,
      'COLLECT',
      'FAILED',
      expect.objectContaining({ errorMessage: timeoutError.message }),
    );
    expect(markStage).not.toHaveBeenCalledWith(
      'org-1',
      'run-1',
      executionFence,
      'COLLECT',
      'COMPLETED',
      expect.anything(),
    );
  });
});
