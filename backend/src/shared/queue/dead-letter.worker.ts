import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../database/prisma.service.js';
import { TenantDatabaseContextService } from '../database/tenant-database-context.service.js';
import { classifyDeadLetter } from '../../features/dead-letter/dead-letter-triage.service.js';

export interface DeadLetterJobData {
  originalQueue: string;
  originalJobId: string;
  originalData: unknown;
  failedReason: string;
  failedAttempts: number;
  organizationId?: string;
}

@Injectable()
@Processor('dead-letter')
export class DeadLetterWorker extends WorkerHost {
  private readonly logger = new Logger(DeadLetterWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantDatabase: TenantDatabaseContextService,
  ) {
    super();
  }

  async process(job: Job<DeadLetterJobData>): Promise<unknown> {
    const {
      originalQueue,
      originalJobId,
      originalData,
      failedReason,
      failedAttempts,
      organizationId,
    } = job.data;

    this.logger.warn(
      `Dead-letter received: queue=${originalQueue} jobId=${originalJobId} reason="${failedReason}"`,
    );

    if (!organizationId) {
      throw new Error('Dead-letter payload is missing organizationId');
    }

    const triage = classifyDeadLetter({
      queueName: originalQueue,
      data: originalData,
      failedReason,
    });

    // Persist to database for admin inspection
    const record = await this.tenantDatabase.run(
      organizationId,
      (transaction) =>
        transaction.deadLetterJob.create({
          data: {
            organizationId,
            queueName: originalQueue,
            jobId: originalJobId ?? 'unknown',
            data: originalData ?? {},
            failedReason: failedReason ?? 'Unknown error',
            failedAttempts: failedAttempts ?? 0,
            failedAt: new Date(),
            classification: triage.classification,
            classificationReason: triage.classificationReason,
            replayEligible: triage.replayEligible,
            classifiedAt: new Date(),
            classifiedBy: 'system:dead-letter-worker',
            resolutionStatus: 'OPEN',
          },
        }),
    );

    await job.updateProgress(100);

    this.logger.log(`Dead-letter job persisted with id=${record.id}`);

    return {
      status: 'recorded',
      deadLetterId: record.id,
    };
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job): void {
    this.logger.log(`Dead-letter job ${job.id ?? 'unknown'} processed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error): void {
    this.logger.error(`Dead-letter job ${job.id ?? 'unknown'} failed itself`, {
      error: error.message,
    });
  }
}
