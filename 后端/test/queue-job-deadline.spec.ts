import {
  QueueJobTimeoutError,
  runWithQueueJobDeadline,
} from '../src/shared/queue/queue-job-deadline.js';

function createAbortError(): Error {
  const error = new Error('operation aborted');
  error.name = 'AbortError';
  return error;
}

describe('runWithQueueJobDeadline', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('returns the operation result and gives it a combined abort signal', async () => {
    const parentController = new AbortController();
    let receivedSignal: AbortSignal | undefined;

    const result = await runWithQueueJobDeadline(
      {
        queueName: 'daily-product-research',
        jobId: 'job-success',
        timeoutMs: 1_000,
        parentSignal: parentController.signal,
      },
      (signal) => {
        receivedSignal = signal;
        return Promise.resolve('completed');
      },
    );

    expect(result).toBe('completed');
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
    expect(receivedSignal).not.toBe(parentController.signal);
    expect(receivedSignal?.aborted).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('converts a cooperative AbortError into a structured queue timeout', async () => {
    const operation = runWithQueueJobDeadline(
      {
        queueName: 'agent-runs',
        jobId: 'job-timeout',
        timeoutMs: 250,
      },
      (signal) =>
        new Promise<never>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(createAbortError()), {
            once: true,
          });
        }),
    );
    const assertion = expect(operation).rejects.toMatchObject({
      name: 'QueueJobTimeoutError',
      queueName: 'agent-runs',
      jobId: 'job-timeout',
      timeoutMs: 250,
    });

    await jest.advanceTimersByTimeAsync(250);

    await assertion;
    expect(jest.getTimerCount()).toBe(0);
  });

  it('preserves the parent abort reason instead of relabelling it as a timeout', async () => {
    const parentController = new AbortController();
    const parentReason = new Error('deployment is stopping');
    let receivedSignal: AbortSignal | undefined;
    const operation = runWithQueueJobDeadline(
      {
        queueName: 'product-launches',
        jobId: 'job-parent-abort',
        timeoutMs: 1_000,
        parentSignal: parentController.signal,
      },
      (signal) => {
        receivedSignal = signal;
        return new Promise<never>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(createAbortError()), {
            once: true,
          });
        });
      },
    );
    const assertion = expect(operation).rejects.toBe(parentReason);

    parentController.abort(parentReason);

    await assertion;
    expect(receivedSignal?.reason).toBe(parentReason);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not start the operation when the parent signal is already aborted', async () => {
    const parentController = new AbortController();
    const parentReason = new Error('worker is already stopping');
    const operation = jest.fn(() => Promise.resolve('must not run'));
    parentController.abort(parentReason);

    await expect(
      runWithQueueJobDeadline(
        {
          queueName: 'product-launches',
          jobId: 'job-pre-aborted',
          timeoutMs: 1_000,
          parentSignal: parentController.signal,
        },
        operation,
      ),
    ).rejects.toBe(parentReason);

    expect(operation).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
    'rejects invalid timeoutMs=%p before starting the operation',
    async (timeoutMs) => {
      const operation = jest.fn(() => Promise.resolve('must not run'));

      await expect(
        runWithQueueJobDeadline(
          {
            queueName: 'agent-runs',
            jobId: 'job-invalid-timeout',
            timeoutMs,
          },
          operation,
        ),
      ).rejects.toThrow(
        new RangeError('timeoutMs must be a positive safe integer'),
      );

      expect(operation).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    },
  );

  it('waits for an operation that ignores abort before rejecting its late result', async () => {
    let resolveOperation: ((value: string) => void) | undefined;
    let settled = false;
    const operation = runWithQueueJobDeadline(
      {
        queueName: 'exports',
        jobId: 'job-ignores-abort',
        timeoutMs: 100,
      },
      () =>
        new Promise<string>((resolve) => {
          resolveOperation = resolve;
        }),
    );
    void operation.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    await jest.advanceTimersByTimeAsync(100);

    expect(settled).toBe(false);
    resolveOperation?.('late success');
    await expect(operation).rejects.toBeInstanceOf(QueueJobTimeoutError);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('preserves an operation failure that happens before the deadline', async () => {
    const operationError = new Error('provider failed');

    await expect(
      runWithQueueJobDeadline(
        {
          queueName: 'notifications',
          jobId: 'job-failure',
          timeoutMs: 500,
        },
        () => Promise.reject(operationError),
      ),
    ).rejects.toBe(operationError);

    expect(jest.getTimerCount()).toBe(0);
  });

  it('rejects with the parent reason when an operation ignores parent cancellation', async () => {
    const parentController = new AbortController();
    const parentReason = { code: 'SAFE_STOP' };
    let resolveOperation: ((value: string) => void) | undefined;
    const operation = runWithQueueJobDeadline(
      {
        queueName: 'agent-plans',
        jobId: 'job-ignores-parent',
        timeoutMs: 1_000,
        parentSignal: parentController.signal,
      },
      () =>
        new Promise<string>((resolve) => {
          resolveOperation = resolve;
        }),
    );
    const assertion = expect(operation).rejects.toBe(parentReason);

    parentController.abort(parentReason);
    resolveOperation?.('late success');

    await assertion;
    expect(jest.getTimerCount()).toBe(0);
  });
});
