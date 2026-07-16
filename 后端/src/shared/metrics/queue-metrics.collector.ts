import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { getToken } from '@willsoto/nestjs-prometheus';
import type { Queue } from 'bullmq';
import type { Gauge } from 'prom-client';

@Injectable()
export class QueueMetricsCollector implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueMetricsCollector.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    @InjectQueue('agent-runs') private readonly agentRuns: Queue,
    @InjectQueue('automation-runs') private readonly automationRuns: Queue,
    @InjectQueue('review-notifications')
    private readonly reviewNotifications: Queue,
    @InjectQueue('product-launches') private readonly productLaunches: Queue,
    @Inject(getToken('bullmq_jobs_waiting'))
    private readonly waiting: Gauge<string>,
    @Inject(getToken('bullmq_jobs_active'))
    private readonly active: Gauge<string>,
    @Inject(getToken('bullmq_jobs_failed'))
    private readonly failed: Gauge<string>,
    @Inject(getToken('bullmq_jobs_delayed'))
    private readonly delayed: Gauge<string>,
    @Inject(getToken('bullmq_queue_scrape_success'))
    private readonly scrapeSuccess: Gauge<string>,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    void this.collect();
    this.timer = setInterval(() => void this.collect(), 15_000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async collect(): Promise<void> {
    const queues = [
      this.agentRuns,
      this.automationRuns,
      this.reviewNotifications,
      this.productLaunches,
    ];
    await Promise.all(
      queues.map(async (queue) => {
        const label = { queue: queue.name };
        try {
          const counts = await queue.getJobCounts(
            'waiting',
            'active',
            'failed',
            'delayed',
          );
          this.waiting.set(label, counts.waiting ?? 0);
          this.active.set(label, counts.active ?? 0);
          this.failed.set(label, counts.failed ?? 0);
          this.delayed.set(label, counts.delayed ?? 0);
          this.scrapeSuccess.set(label, 1);
        } catch (error) {
          this.scrapeSuccess.set(label, 0);
          this.logger.warn(
            `Queue metrics collection failed for ${queue.name}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }),
    );
  }
}
