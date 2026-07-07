import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';

export interface DeadLetterJobData {
  originalQueue: string;
  originalJobId: string;
  originalData: unknown;
  failedReason: string;
  failedAttempts: number;
}

@Injectable()
@Processor('dead-letter')
export class DeadLetterWorker extends WorkerHost {
  private readonly logger = new Logger(DeadLetterWorker.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<DeadLetterJobData>): Promise<unknown> {
    const { originalQueue, originalJobId, originalData, failedReason } = job.data;

    this.logger.warn(
      `Dead-letter received: queue=${originalQueue} jobId=${originalJobId} reason="${failedReason}"`,
    );

    // Persist to database for admin inspection
    const record = await this.prisma.deadLetterJob.create({
      data: {
        queueName: originalQueue,
        jobId: originalJobId ?? 'unknown',
        data: (originalData ?? {}) as Prisma.InputJsonValue,
        failedReason: failedReason ?? 'Unknown error',
        failedAt: new Date(),
      },
    });

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
