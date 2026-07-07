import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/database/prisma.service.js';

export interface AutomationJobData {
  automationRunId: string;
}

@Processor('automation-runs', { concurrency: 2 })
export class AutomationWorker extends WorkerHost {
  private readonly logger = new Logger(AutomationWorker.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<AutomationJobData>): Promise<unknown> {
    const { automationRunId } = job.data;
    this.logger.log(
      `Processing automation run ${automationRunId} (job ${job.id})`,
    );

    const run = await this.prisma.automationRun.findUnique({
      where: { id: automationRunId },
      include: { flow: true },
    });
    if (!run) {
      throw new Error(`AutomationRun ${automationRunId} not found`);
    }

    await this.prisma.automationRun.update({
      where: { id: run.id },
      data: { status: 'RUNNING' },
    });

    try {
      const steps = Array.isArray(run.flow.steps)
        ? (run.flow.steps as Array<Record<string, unknown>>)
        : [];
      const results: Array<Record<string, unknown>> = [];

      for (const [index, step] of steps.entries()) {
        results.push({
          step: index + 1,
          action: step.action ?? 'unknown',
          status: 'completed',
        });
        await job.updateProgress(
          Math.round(((index + 1) / Math.max(steps.length, 1)) * 100),
        );
      }

      await this.prisma.automationRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          finishedAt: new Date(),
          result: { steps: results } as Prisma.InputJsonValue,
        },
      });
      await this.prisma.automationFlow.update({
        where: { id: run.flowId },
        data: { lastRunAt: new Date() },
      });

      return { status: 'completed', automationRunId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.automationRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          error: { message },
        },
      });
      throw error;
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job): void {
    this.logger.log(`Automation job ${job.id ?? 'unknown'} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error): void {
    this.logger.error(`Automation job ${job.id ?? 'unknown'} failed`, {
      error: error.message,
    });
  }
}
