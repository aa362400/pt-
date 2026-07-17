export interface QueueJobDeadlineOptions {
  readonly queueName: string;
  readonly jobId: string;
  readonly timeoutMs: number;
  readonly parentSignal?: AbortSignal;
}

export class QueueJobTimeoutError extends Error {
  readonly queueName: string;
  readonly jobId: string;
  readonly timeoutMs: number;

  constructor(queueName: string, jobId: string, timeoutMs: number) {
    super(
      `Queue job ${queueName}/${jobId} exceeded its ${timeoutMs}ms execution deadline`,
    );
    this.name = 'QueueJobTimeoutError';
    this.queueName = queueName;
    this.jobId = jobId;
    this.timeoutMs = timeoutMs;
  }
}

export async function runWithQueueJobDeadline<T>(
  options: QueueJobDeadlineOptions,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new RangeError('timeoutMs must be a positive safe integer');
  }
  options.parentSignal?.throwIfAborted();

  const timeoutError = new QueueJobTimeoutError(
    options.queueName,
    options.jobId,
    options.timeoutMs,
  );
  const deadlineController = new AbortController();
  const signal = AbortSignal.any(
    options.parentSignal
      ? [options.parentSignal, deadlineController.signal]
      : [deadlineController.signal],
  );
  const timer = setTimeout(() => {
    deadlineController.abort(timeoutError);
  }, options.timeoutMs);
  timer.unref();

  try {
    try {
      const result = await operation(signal);
      signal.throwIfAborted();
      return result;
    } catch (error: unknown) {
      if (signal.aborted) {
        throw signal.reason;
      }
      throw error;
    }
  } finally {
    clearTimeout(timer);
  }
}
