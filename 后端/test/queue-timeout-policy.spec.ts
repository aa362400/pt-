import {
  QUEUE_CONFIG,
  type QueueName,
} from '../src/shared/queue/queue.module.js';

const EXPECTED_EXECUTION_TIMEOUTS = {
  'agent-runs': 900_000,
  'agent-plans': 300_000,
  'daily-product-research': 1_800_000,
  exports: 60_000,
  notifications: 30_000,
  'platform-events': 10_000,
  'product-launches': 900_000,
} satisfies Partial<Record<QueueName, number>>;

describe('queue execution timeout policy', () => {
  it('keeps application execution deadlines outside BullMQ default job options', () => {
    for (const config of Object.values(QUEUE_CONFIG)) {
      expect(config.defaultJobOptions).not.toHaveProperty('timeout');
      expect(config.defaultJobOptions).not.toHaveProperty('executionTimeoutMs');
    }
  });

  it('preserves the seven existing deadline intents as application metadata', () => {
    const actualExecutionTimeouts = Object.fromEntries(
      Object.entries(QUEUE_CONFIG).flatMap(([queueName, config]) =>
        'executionTimeoutMs' in config
          ? [[queueName, config.executionTimeoutMs]]
          : [],
      ),
    );

    expect(actualExecutionTimeouts).toEqual(EXPECTED_EXECUTION_TIMEOUTS);
  });

  it('leaves queues without an execution deadline unchanged', () => {
    for (const queueName of [
      'automation-runs',
      'review-notifications',
      'dead-letter',
    ] as const satisfies readonly QueueName[]) {
      expect(QUEUE_CONFIG[queueName]).not.toHaveProperty('executionTimeoutMs');
    }
  });
});
