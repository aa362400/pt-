import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';

const RUN_LEASE_MS = 10 * 60_000;
const STEP_LEASE_MS = 10 * 60_000;

@Injectable()
export class AutomationStepExecutionsService {
  constructor(private readonly tenantDatabase: TenantDatabaseContextService) {}

  async claimRun(input: {
    organizationId: string;
    automationRunId: string;
    leaseOwner: string;
    now?: Date;
  }): Promise<boolean> {
    const now = input.now ?? new Date();
    const result = await this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.automationRun.updateMany({
        where: {
          id: input.automationRunId,
          flow: { organizationId: input.organizationId },
          OR: [
            { status: 'PENDING' },
            { status: 'RUNNING', leaseExpiresAt: null },
            { status: 'RUNNING', leaseExpiresAt: { lt: now } },
          ],
        },
        data: {
          status: 'RUNNING',
          leaseOwner: input.leaseOwner,
          leaseExpiresAt: new Date(now.getTime() + RUN_LEASE_MS),
          attempt: { increment: 1 },
        },
      }),
    );
    return result.count === 1;
  }

  async finishRun(input: {
    organizationId: string;
    automationRunId: string;
    leaseOwner: string;
    status: 'COMPLETED' | 'PARTIAL';
    result: Record<string, unknown>;
    now?: Date;
  }): Promise<void> {
    const updated = await this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.automationRun.updateMany({
        where: {
          id: input.automationRunId,
          flow: { organizationId: input.organizationId },
          status: 'RUNNING',
          leaseOwner: input.leaseOwner,
        },
        data: {
          status: input.status,
          finishedAt: input.now ?? new Date(),
          result: input.result as Prisma.InputJsonValue,
          error: Prisma.DbNull,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      }),
    );
    if (updated.count !== 1) {
      throw new Error(
        `Automation run ${input.automationRunId} lease changed before completion`,
      );
    }
  }

  async releaseRun(input: {
    organizationId: string;
    automationRunId: string;
    leaseOwner: string;
    finalAttempt: boolean;
    error: unknown;
    now?: Date;
  }): Promise<void> {
    const message =
      input.error instanceof Error ? input.error.message : String(input.error);
    await this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.automationRun.updateMany({
        where: {
          id: input.automationRunId,
          flow: { organizationId: input.organizationId },
          leaseOwner: input.leaseOwner,
        },
        data: input.finalAttempt
          ? {
              status: 'FAILED',
              finishedAt: input.now ?? new Date(),
              error: { message },
              leaseOwner: null,
              leaseExpiresAt: null,
            }
          : {
              status: 'PENDING',
              finishedAt: null,
              error: Prisma.DbNull,
              leaseOwner: null,
              leaseExpiresAt: null,
            },
      }),
    );
  }

  async loadTerminalSteps(organizationId: string, automationRunId: string) {
    return this.tenantDatabase.run(organizationId, (tx) =>
      tx.automationStepExecution.findMany({
        where: {
          organizationId,
          automationRunId,
          status: { in: ['COMPLETED', 'BLOCKED'] },
        },
        orderBy: { stepIndex: 'asc' },
      }),
    );
  }

  async claimStep(input: {
    organizationId: string;
    automationRunId: string;
    stepKey: string;
    stepIndex: number;
    action: string;
    leaseOwner: string;
    now?: Date;
  }): Promise<boolean> {
    const now = input.now ?? new Date();
    await this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.automationStepExecution.upsert({
        where: {
          automationRunId_stepKey: {
            automationRunId: input.automationRunId,
            stepKey: input.stepKey,
          },
        },
        create: {
          organizationId: input.organizationId,
          automationRunId: input.automationRunId,
          stepKey: input.stepKey,
          stepIndex: input.stepIndex,
          action: input.action,
        },
        update: {},
      }),
    );
    const result = await this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.automationStepExecution.updateMany({
        where: {
          organizationId: input.organizationId,
          automationRunId: input.automationRunId,
          stepKey: input.stepKey,
          OR: [
            { status: { in: ['PENDING', 'FAILED'] } },
            { status: 'RUNNING', leaseExpiresAt: { lt: now } },
          ],
        },
        data: {
          status: 'RUNNING',
          leaseOwner: input.leaseOwner,
          leaseExpiresAt: new Date(now.getTime() + STEP_LEASE_MS),
          attempt: { increment: 1 },
          startedAt: now,
          finishedAt: null,
          error: Prisma.DbNull,
        },
      }),
    );
    return result.count === 1;
  }

  async finishStep(input: {
    organizationId: string;
    automationRunId: string;
    stepKey: string;
    leaseOwner: string;
    result: Record<string, unknown>;
    now?: Date;
  }): Promise<void> {
    const completed = input.result.status === 'completed';
    const result = await this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.automationStepExecution.updateMany({
        where: {
          organizationId: input.organizationId,
          automationRunId: input.automationRunId,
          stepKey: input.stepKey,
          status: 'RUNNING',
          leaseOwner: input.leaseOwner,
        },
        data: {
          status: completed ? 'COMPLETED' : 'BLOCKED',
          result: input.result as Prisma.InputJsonValue,
          leaseOwner: null,
          leaseExpiresAt: null,
          finishedAt: input.now ?? new Date(),
        },
      }),
    );
    if (result.count !== 1) {
      throw new Error(`Automation step ${input.stepKey} lease changed`);
    }
  }

  async failStep(input: {
    organizationId: string;
    automationRunId: string;
    stepKey: string;
    leaseOwner: string;
    error: unknown;
    now?: Date;
  }): Promise<void> {
    await this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.automationStepExecution.updateMany({
        where: {
          organizationId: input.organizationId,
          automationRunId: input.automationRunId,
          stepKey: input.stepKey,
          status: 'RUNNING',
          leaseOwner: input.leaseOwner,
        },
        data: {
          status: 'FAILED',
          error: {
            message:
              input.error instanceof Error
                ? input.error.message
                : String(input.error),
          },
          leaseOwner: null,
          leaseExpiresAt: null,
          finishedAt: input.now ?? new Date(),
        },
      }),
    );
  }
}
