import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { randomUUID } from 'node:crypto';
import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { dailyResearchQueuePayloadSchema } from '../features/product-research/daily/contracts/daily-product-research.contract.js';
import { DailyProductResearchOrchestratorService } from '../features/product-research/daily/services/daily-product-research-orchestrator.service.js';
import { asyncLocalStorage } from '../shared/middleware/request-id.middleware.js';
import { ensureTraceId } from '../shared/observability/trace-context.js';
import { runWithQueueJobDeadline } from '../shared/queue/queue-job-deadline.js';
import { QUEUE_CONFIG } from '../shared/queue/queue.module.js';

@Processor('daily-product-research', { concurrency: 1 })
export class DailyProductResearchWorker
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(DailyProductResearchWorker.name);
  private readonly workerInstanceId = randomUUID();

  constructor(
    private readonly orchestrator: DailyProductResearchOrchestratorService,
    @InjectQueue('daily-product-research') private readonly queue: Queue,
  ) {
    super();
  }

  async onApplicationBootstrap() {
    const concurrency = QUEUE_CONFIG['daily-product-research'].concurrency;
    await this.queue.setGlobalConcurrency(concurrency);
    this.logger.log(
      JSON.stringify({
        event: 'daily_research_global_concurrency_configured',
        concurrency,
      }),
    );
  }

  async process(
    job: Job<unknown>,
    _token?: string,
    parentSignal?: AbortSignal,
  ) {
    const payload = dailyResearchQueuePayloadSchema.parse(job.data);
    const attempt = Math.max(1, job.attemptsMade + 1);
    const leaseOwner = `daily-worker-${this.workerInstanceId}-${randomUUID()}`;
    const store = new Map<string, string>([
      ['requestId', `${payload.researchRunId}:attempt:${attempt}`],
      ['traceId', ensureTraceId(payload.researchRunId)],
      ['runId', payload.researchRunId],
      ['tenantId', payload.organizationId],
    ]);
    return asyncLocalStorage.run(store, async () => {
      const startedAt = Date.now();
      const result = await runWithQueueJobDeadline(
        {
          queueName: 'daily-product-research',
          jobId: job.id ?? payload.researchRunId,
          timeoutMs: QUEUE_CONFIG['daily-product-research'].executionTimeoutMs,
          parentSignal,
        },
        async (signal) => {
          this.logger.log(
            JSON.stringify({
              event: 'daily_research_job_started',
              runId: payload.researchRunId,
              organizationId: payload.organizationId,
              jobId: job.id ?? null,
              attempt,
              trigger: payload.trigger,
              controlRevision: payload.controlRevision ?? null,
            }),
          );
          await job.updateProgress(1);
          signal.throwIfAborted();
          const result = await this.orchestrator.execute(
            payload.organizationId,
            payload.researchRunId,
            signal,
            payload.controlRevision,
            leaseOwner,
          );
          signal.throwIfAborted();
          await job.updateProgress(100);
          signal.throwIfAborted();
          this.logger.log(
            JSON.stringify({
              event: 'daily_research_job_completed',
              runId: payload.researchRunId,
              organizationId: payload.organizationId,
              jobId: job.id ?? null,
              attempt,
              status:
                result && typeof result === 'object' && 'status' in result
                  ? result.status
                  : 'UNKNOWN',
              durationMs: Date.now() - startedAt,
            }),
          );
          signal.throwIfAborted();
          return result;
        },
      );
      return result;
    });
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error) {
    this.logger.error(
      `Daily research job ${job?.id ?? 'unknown'} failed: ${error.message}`,
    );
  }
}
