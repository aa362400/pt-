import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrganizationAgentControlService } from '../../shared/agent-control/organization-agent-control.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';

const RUN_LEASE_MS = 10 * 60_000;
const STEP_LEASE_MS = 10 * 60_000;

export type AutomationRunClaimResult = {
  outcome: 'claimed' | 'paused' | 'stopped' | 'stale' | 'unavailable';
  controlRevision: number;
  checkpointStepIndex: number | null;
};

export type AutomationRunCheckpointResult = {
  outcome: 'continue' | 'paused' | 'stopped';
  controlRevision: number;
  checkpointStepIndex: number;
};

export type AutomationStepClaimResult = {
  outcome: 'claimed' | 'paused' | 'stopped' | 'stale';
  controlRevision: number;
  checkpointStepIndex: number | null;
};

export type AutomationRunFinishResult = {
  outcome: 'completed' | 'paused' | 'stopped';
  controlRevision: number;
};

@Injectable()
export class AutomationStepExecutionsService {
  constructor(
    private readonly tenantDatabase: TenantDatabaseContextService,
    private readonly control: OrganizationAgentControlService,
  ) {}

  async claimRun(input: {
    organizationId: string;
    automationRunId: string;
    leaseOwner: string;
    expectedControlRevision: number;
    now?: Date;
  }): Promise<AutomationRunClaimResult> {
    const now = input.now ?? new Date();
    return this.tenantDatabase.run(input.organizationId, async (tx) => {
      const control = await this.control.lockEffectiveState(
        tx,
        input.organizationId,
      );
      const run = await tx.automationRun.findFirst({
        where: {
          id: input.automationRunId,
          flow: { organizationId: input.organizationId },
        },
        select: {
          status: true,
          controlRevision: true,
          checkpointStepIndex: true,
          leaseExpiresAt: true,
        },
      });
      const checkpointStepIndex = run?.checkpointStepIndex ?? null;
      if (!run) {
        return {
          outcome: 'unavailable',
          controlRevision: control.revision,
          checkpointStepIndex,
        };
      }
      if (run.controlRevision !== input.expectedControlRevision) {
        return {
          outcome: 'stale',
          controlRevision: control.revision,
          checkpointStepIndex,
        };
      }

      const runLeaseIsClaimable =
        run.status !== 'RUNNING' ||
        run.leaseExpiresAt === null ||
        run.leaseExpiresAt < now;
      const resumableStatus = ['PENDING', 'RUNNING', 'PAUSED'].includes(
        run.status,
      );
      if (!resumableStatus || !runLeaseIsClaimable) {
        return {
          outcome: 'unavailable',
          controlRevision: control.revision,
          checkpointStepIndex,
        };
      }

      if (control.state !== 'RUNNING') {
        const stopped = control.state === 'STOP_REQUESTED';
        const result = await tx.automationRun.updateMany({
          where: {
            id: input.automationRunId,
            flow: { organizationId: input.organizationId },
            status: run.status,
            controlRevision: run.controlRevision,
          },
          data: {
            status: stopped ? 'STOPPED' : 'PAUSED',
            controlRevision: control.revision,
            checkpointedAt: now,
            finishedAt: stopped ? now : null,
            leaseOwner: null,
            leaseExpiresAt: null,
          },
        });
        return {
          outcome:
            result.count === 1
              ? stopped
                ? 'stopped'
                : 'paused'
              : 'unavailable',
          controlRevision: control.revision,
          checkpointStepIndex,
        };
      }

      const resumesPausedRun = run.status === 'PAUSED';
      if (
        (!resumesPausedRun && run.controlRevision !== control.revision) ||
        (resumesPausedRun && run.controlRevision > control.revision)
      ) {
        return {
          outcome: 'stale',
          controlRevision: control.revision,
          checkpointStepIndex,
        };
      }

      const result = await tx.automationRun.updateMany({
        where: {
          id: input.automationRunId,
          flow: { organizationId: input.organizationId },
          status: run.status,
          controlRevision: run.controlRevision,
          ...(run.status === 'RUNNING'
            ? {
                OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
              }
            : {}),
        },
        data: {
          status: 'RUNNING',
          controlRevision: control.revision,
          leaseOwner: input.leaseOwner,
          leaseExpiresAt: new Date(now.getTime() + RUN_LEASE_MS),
          attempt: { increment: 1 },
          finishedAt: null,
          error: Prisma.DbNull,
        },
      });
      return {
        outcome: result.count === 1 ? 'claimed' : 'unavailable',
        controlRevision: control.revision,
        checkpointStepIndex,
      };
    });
  }

  async finishRun(input: {
    organizationId: string;
    automationRunId: string;
    leaseOwner: string;
    expectedControlRevision: number;
    status: 'COMPLETED' | 'PARTIAL';
    result: Record<string, unknown>;
    now?: Date;
  }): Promise<AutomationRunFinishResult> {
    const now = input.now ?? new Date();
    return this.tenantDatabase.run(input.organizationId, async (tx) => {
      const control = await this.control.lockEffectiveState(
        tx,
        input.organizationId,
      );
      const stopped = control.state === 'STOP_REQUESTED';
      const paused = control.state === 'PAUSE_REQUESTED';
      const updated = await tx.automationRun.updateMany({
        where: {
          id: input.automationRunId,
          flow: { organizationId: input.organizationId },
          status: 'RUNNING',
          leaseOwner: input.leaseOwner,
          controlRevision: input.expectedControlRevision,
        },
        data:
          stopped || paused
            ? {
                status: stopped ? 'STOPPED' : 'PAUSED',
                controlRevision: control.revision,
                checkpointedAt: now,
                finishedAt: stopped ? now : null,
                leaseOwner: null,
                leaseExpiresAt: null,
              }
            : {
                status: input.status,
                controlRevision: control.revision,
                finishedAt: now,
                result: input.result as Prisma.InputJsonValue,
                error: Prisma.DbNull,
                leaseOwner: null,
                leaseExpiresAt: null,
              },
      });
      if (updated.count !== 1) {
        throw new Error(
          `Automation run ${input.automationRunId} lease changed before completion`,
        );
      }
      return {
        outcome: stopped ? 'stopped' : paused ? 'paused' : 'completed',
        controlRevision: control.revision,
      };
    });
  }

  async releaseRun(input: {
    organizationId: string;
    automationRunId: string;
    leaseOwner: string;
    expectedControlRevision: number;
    finalAttempt: boolean;
    error: unknown;
    now?: Date;
  }): Promise<boolean> {
    const message =
      input.error instanceof Error ? input.error.message : String(input.error);
    const result = await this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.automationRun.updateMany({
        where: {
          id: input.automationRunId,
          flow: { organizationId: input.organizationId },
          status: 'RUNNING',
          leaseOwner: input.leaseOwner,
          controlRevision: input.expectedControlRevision,
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
    return result.count === 1;
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
    expectedControlRevision: number;
    expectedCheckpointStepIndex: number | null;
    now?: Date;
  }): Promise<AutomationStepClaimResult> {
    const now = input.now ?? new Date();
    return this.tenantDatabase.run(input.organizationId, async (tx) => {
      const control = await this.control.lockEffectiveState(
        tx,
        input.organizationId,
      );
      const stopped = control.state === 'STOP_REQUESTED';
      const paused = control.state === 'PAUSE_REQUESTED';
      if (stopped || paused) {
        const run = await tx.automationRun.updateMany({
          where: {
            id: input.automationRunId,
            flow: { organizationId: input.organizationId },
            status: 'RUNNING',
            leaseOwner: input.leaseOwner,
            controlRevision: input.expectedControlRevision,
            checkpointStepIndex: input.expectedCheckpointStepIndex,
          },
          data: {
            status: stopped ? 'STOPPED' : 'PAUSED',
            controlRevision: control.revision,
            checkpointedAt: now,
            finishedAt: stopped ? now : null,
            leaseOwner: null,
            leaseExpiresAt: null,
          },
        });
        return {
          outcome: run.count === 1 ? (stopped ? 'stopped' : 'paused') : 'stale',
          controlRevision: control.revision,
          checkpointStepIndex: input.expectedCheckpointStepIndex,
        };
      }

      if (control.revision < input.expectedControlRevision) {
        return {
          outcome: 'stale',
          controlRevision: control.revision,
          checkpointStepIndex: input.expectedCheckpointStepIndex,
        };
      }
      const run = await tx.automationRun.updateMany({
        where: {
          id: input.automationRunId,
          flow: { organizationId: input.organizationId },
          status: 'RUNNING',
          leaseOwner: input.leaseOwner,
          controlRevision: input.expectedControlRevision,
          checkpointStepIndex: input.expectedCheckpointStepIndex,
        },
        data: {
          controlRevision: control.revision,
          leaseExpiresAt: new Date(now.getTime() + RUN_LEASE_MS),
        },
      });
      if (run.count !== 1) {
        return {
          outcome: 'stale',
          controlRevision: control.revision,
          checkpointStepIndex: input.expectedCheckpointStepIndex,
        };
      }

      await tx.automationStepExecution.upsert({
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
      });
      const result = await tx.automationStepExecution.updateMany({
        where: {
          organizationId: input.organizationId,
          automationRunId: input.automationRunId,
          stepKey: input.stepKey,
          stepIndex: input.stepIndex,
          action: input.action,
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
      });
      if (result.count !== 1) {
        throw new Error(`Automation step ${input.stepKey} is already claimed`);
      }
      return {
        outcome: 'claimed',
        controlRevision: control.revision,
        checkpointStepIndex: input.expectedCheckpointStepIndex,
      };
    });
  }

  async finishStep(input: {
    organizationId: string;
    automationRunId: string;
    stepKey: string;
    stepIndex: number;
    leaseOwner: string;
    expectedControlRevision: number;
    expectedCheckpointStepIndex: number | null;
    result: Record<string, unknown>;
    now?: Date;
  }): Promise<AutomationRunCheckpointResult> {
    const completed = input.result.status === 'completed';
    const now = input.now ?? new Date();
    return this.tenantDatabase.run(input.organizationId, async (tx) => {
      const control = await this.control.lockEffectiveState(
        tx,
        input.organizationId,
      );
      const result = await tx.automationStepExecution.updateMany({
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
          finishedAt: now,
        },
      });
      if (result.count !== 1) {
        throw new Error(`Automation step ${input.stepKey} lease changed`);
      }

      const checkpointStepIndex = input.stepIndex + 1;
      const stopped = control.state === 'STOP_REQUESTED';
      const paused = control.state === 'PAUSE_REQUESTED';
      const run = await tx.automationRun.updateMany({
        where: {
          id: input.automationRunId,
          flow: { organizationId: input.organizationId },
          status: 'RUNNING',
          leaseOwner: input.leaseOwner,
          controlRevision: input.expectedControlRevision,
          checkpointStepIndex: input.expectedCheckpointStepIndex,
        },
        data:
          stopped || paused
            ? {
                status: stopped ? 'STOPPED' : 'PAUSED',
                checkpointStepIndex,
                checkpointedAt: now,
                controlRevision: control.revision,
                finishedAt: stopped ? now : null,
                leaseOwner: null,
                leaseExpiresAt: null,
              }
            : {
                status: 'RUNNING',
                checkpointStepIndex,
                checkpointedAt: now,
                controlRevision: control.revision,
                leaseExpiresAt: new Date(now.getTime() + RUN_LEASE_MS),
              },
      });
      if (run.count !== 1) {
        throw new Error(
          `Automation run ${input.automationRunId} lease changed before checkpoint`,
        );
      }
      return {
        outcome: stopped ? 'stopped' : paused ? 'paused' : 'continue',
        controlRevision: control.revision,
        checkpointStepIndex,
      };
    });
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
