import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { dailyResearchQueuePayloadSchema } from '../features/product-research/daily/contracts/daily-product-research.contract.js';
import { DailyProductResearchOrchestratorService } from '../features/product-research/daily/services/daily-product-research-orchestrator.service.js';

@Processor('daily-product-research', { concurrency: 1 })
export class DailyProductResearchWorker extends WorkerHost {
  private readonly logger = new Logger(DailyProductResearchWorker.name);

  constructor(
    private readonly orchestrator: DailyProductResearchOrchestratorService,
  ) {
    super();
  }

  async process(job: Job<unknown>) {
    const payload = dailyResearchQueuePayloadSchema.parse(job.data);
    await job.updateProgress(1);
    const result = await this.orchestrator.execute(
      payload.organizationId,
      payload.researchRunId,
    );
    await job.updateProgress(100);
    return result;
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error) {
    this.logger.error(
      `Daily research job ${job?.id ?? 'unknown'} failed: ${error.message}`,
    );
  }
}
