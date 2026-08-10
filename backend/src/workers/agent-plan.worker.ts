import { Processor, WorkerHost } from '@nestjs/bullmq';
import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import {
  AgentConsoleService,
  type AgentPlanJobData,
} from '../features/agent-console/agent-console.service.js';

@Processor('agent-plans', { concurrency: 2 })
export class AgentPlanWorker extends WorkerHost {
  private readonly logger = new Logger(AgentPlanWorker.name);

  constructor(private readonly agentConsole: AgentConsoleService) {
    super();
  }

  async process(job: Job<AgentPlanJobData>) {
    this.logger.log(`Processing Agent plan ${job.data.planId} (${job.id})`);
    try {
      return await this.agentConsole.runQueuedPlan(job.data);
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw new UnrecoverableError(error.message);
      }
      throw error;
    }
  }
}
