import { QueueMetricsCollector } from '../src/shared/metrics/queue-metrics.collector.js';

describe('QueueMetricsCollector', () => {
  function gauge() {
    return { set: jest.fn() };
  }

  it('exports waiting, active, failed and delayed counts for every queue', async () => {
    const queues = [
      'agent-runs',
      'automation-runs',
      'review-notifications',
      'product-launches',
    ].map((name, index) => ({
      name,
      getJobCounts: jest.fn().mockResolvedValue({
        waiting: index + 1,
        active: index + 2,
        failed: index + 3,
        delayed: index + 4,
      }),
    }));
    const waiting = gauge();
    const active = gauge();
    const failed = gauge();
    const delayed = gauge();
    const success = gauge();
    const collector = new QueueMetricsCollector(
      queues[0] as never,
      queues[1] as never,
      queues[2] as never,
      queues[3] as never,
      waiting as never,
      active as never,
      failed as never,
      delayed as never,
      success as never,
    );

    await collector.collect();

    expect(waiting.set).toHaveBeenCalledWith({ queue: 'agent-runs' }, 1);
    expect(active.set).toHaveBeenCalledWith({ queue: 'automation-runs' }, 3);
    expect(failed.set).toHaveBeenCalledWith(
      { queue: 'review-notifications' },
      5,
    );
    expect(delayed.set).toHaveBeenCalledWith({ queue: 'product-launches' }, 7);
    expect(success.set).toHaveBeenCalledTimes(4);
    expect(success.set).toHaveBeenCalledWith({ queue: 'agent-runs' }, 1);
  });

  it('marks scrape failure without throwing away other queue metrics', async () => {
    const healthy = (name: string) => ({
      name,
      getJobCounts: jest
        .fn()
        .mockResolvedValue({ waiting: 0, active: 0, failed: 0, delayed: 0 }),
    });
    const broken = {
      name: 'automation-runs',
      getJobCounts: jest.fn().mockRejectedValue(new Error('redis timeout')),
    };
    const success = gauge();
    const collector = new QueueMetricsCollector(
      healthy('agent-runs') as never,
      broken as never,
      healthy('review-notifications') as never,
      healthy('product-launches') as never,
      gauge() as never,
      gauge() as never,
      gauge() as never,
      gauge() as never,
      success as never,
    );

    await expect(collector.collect()).resolves.toBeUndefined();
    expect(success.set).toHaveBeenCalledWith({ queue: 'automation-runs' }, 0);
    expect(success.set).toHaveBeenCalledWith({ queue: 'agent-runs' }, 1);
  });
});
