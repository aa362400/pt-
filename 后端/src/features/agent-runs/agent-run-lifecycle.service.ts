import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AgentLifecycleStatus as PrismaAgentLifecycleStatus,
  AgentRunStatus,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../../shared/audit/audit.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import {
  AgentLifecycleEvent,
  AgentLifecycleStatus,
  TERMINAL_AGENT_LIFECYCLE_STATUSES,
  resolveAgentTransition,
} from './agent-state-machine.js';

export interface ApplyAgentLifecycleEventInput {
  organizationId: string;
  runId: string;
  event: AgentLifecycleEvent;
  eventKey: string;
  payload?: Record<string, unknown>;
  attempt?: number;
  currentStep?: string;
}

export interface ApplyAgentLifecycleEventResult {
  applied: boolean;
  transitionId: string;
  fromStatus: AgentLifecycleStatus | null;
  toStatus: AgentLifecycleStatus;
  version: number;
}

@Injectable()
export class AgentRunLifecycleService {
  constructor(
    private readonly tenantDatabase: TenantDatabaseContextService,
    private readonly audit: AuditService,
  ) {}

  async applyEvent(
    input: ApplyAgentLifecycleEventInput,
  ): Promise<ApplyAgentLifecycleEventResult> {
    const eventKey = input.eventKey.trim();
    if (!eventKey) {
      throw new BadRequestException('Agent lifecycle eventKey is required');
    }

    try {
      return await this.tenantDatabase.run(input.organizationId, async (tx) => {
        const existing = await tx.agentTransition.findUnique({
          where: { eventKey },
        });
        if (existing) {
          if (
            existing.organizationId !== input.organizationId ||
            existing.runId !== input.runId
          ) {
            throw new ConflictException(
              'Agent lifecycle eventKey belongs to another run',
            );
          }
          const run = await tx.agentRun.findFirst({
            where: { id: input.runId, organizationId: input.organizationId },
            select: { version: true },
          });
          if (!run) throw new NotFoundException('Agent run not found');
          return {
            applied: false,
            transitionId: existing.id,
            fromStatus: this.asLifecycleStatus(existing.fromStatus),
            toStatus: this.asLifecycleStatus(existing.toStatus),
            version: run.version,
          };
        }

        const run = await tx.agentRun.findFirst({
          where: { id: input.runId, organizationId: input.organizationId },
        });
        if (!run) throw new NotFoundException('Agent run not found');

        const fromStatus = this.asLifecycleStatus(run.lifecycleStatus);
        const toStatus = resolveAgentTransition(fromStatus, input.event);
        const now = new Date();
        const terminal = TERMINAL_AGENT_LIFECYCLE_STATUSES.has(toStatus);
        const legacyStatus = this.toLegacyStatus(toStatus);
        const failureCode = this.payloadString(input.payload, 'errorCode');
        const failureMessage = this.payloadString(
          input.payload,
          'errorMessage',
        );
        const updated = await tx.agentRun.updateMany({
          where: {
            id: input.runId,
            organizationId: input.organizationId,
            lifecycleStatus: run.lifecycleStatus,
            version: run.version,
          },
          data: {
            lifecycleStatus: toStatus,
            status: legacyStatus,
            version: { increment: 1 },
            ...(input.currentStep ? { currentStep: input.currentStep } : {}),
            ...(input.event === AgentLifecycleEvent.PLAN_STARTED &&
            !run.startedAt
              ? { startedAt: now }
              : {}),
            ...(terminal ? { finishedAt: now } : {}),
            ...(toStatus === AgentLifecycleStatus.FAILED
              ? {
                  errorCode: failureCode ?? 'AGENT_LIFECYCLE_FAILED',
                  errorMessage:
                    failureMessage ?? 'Agent lifecycle entered FAILED state',
                }
              : {}),
            ...(toStatus === AgentLifecycleStatus.COMPLETED
              ? { errorCode: null, errorMessage: null }
              : {}),
          },
        });
        if (updated.count !== 1) {
          throw new ConflictException(
            'Agent run version changed while applying lifecycle event',
          );
        }

        const transition = await tx.agentTransition.create({
          data: {
            organizationId: input.organizationId,
            runId: input.runId,
            fromStatus: fromStatus,
            toStatus: toStatus,
            eventType: input.event,
            eventKey,
            payload: (input.payload ?? {}) as Prisma.InputJsonValue,
            attempt: input.attempt ?? run.attempt,
          },
        });
        await tx.outboxEvent.create({
          data: {
            dedupeKey: `agent-lifecycle:${eventKey}`,
            organizationId: input.organizationId,
            aggregateType: 'AgentRun',
            aggregateId: input.runId,
            eventType: 'agent-run.lifecycle.changed',
            payload: {
              runId: input.runId,
              transitionId: transition.id,
              event: input.event,
              fromStatus,
              toStatus,
              version: run.version + 1,
              eventKey,
            },
          },
        });

        return {
          applied: true,
          transitionId: transition.id,
          fromStatus,
          toStatus,
          version: run.version + 1,
        };
      });
    } catch (error) {
      if (this.isIllegalTransitionError(error)) {
        await this.audit.log({
          organizationId: input.organizationId,
          actorId: 'system:agent-lifecycle',
          action: 'agent-run.transition.rejected',
          resourceType: 'AgentRun',
          resourceId: input.runId,
          after: {
            event: input.event,
            eventKey,
            reason: error instanceof Error ? error.message : String(error),
          },
        });
        throw new BadRequestException(
          error instanceof Error ? error.message : String(error),
        );
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const replay = await this.findReplay(
          input.organizationId,
          input.runId,
          eventKey,
        );
        if (replay) return replay;
      }
      throw error;
    }
  }

  private toLegacyStatus(status: AgentLifecycleStatus): AgentRunStatus {
    switch (status) {
      case AgentLifecycleStatus.CREATED:
        return AgentRunStatus.PENDING;
      case AgentLifecycleStatus.RETRY_SCHEDULED:
        return AgentRunStatus.RETRYING;
      case AgentLifecycleStatus.COMPLETED:
        return AgentRunStatus.COMPLETED;
      case AgentLifecycleStatus.FAILED:
        return AgentRunStatus.FAILED;
      case AgentLifecycleStatus.CANCELLED:
        return AgentRunStatus.CANCELLED;
      default:
        return AgentRunStatus.RUNNING;
    }
  }

  private payloadString(
    payload: Record<string, unknown> | undefined,
    key: string,
  ): string | null {
    const value = payload?.[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private async findReplay(
    organizationId: string,
    runId: string,
    eventKey: string,
  ): Promise<ApplyAgentLifecycleEventResult | null> {
    return this.tenantDatabase.run(organizationId, async (tx) => {
      const transition = await tx.agentTransition.findUnique({
        where: { eventKey },
      });
      if (
        !transition ||
        transition.organizationId !== organizationId ||
        transition.runId !== runId
      ) {
        return null;
      }
      const run = await tx.agentRun.findFirst({
        where: { id: runId, organizationId },
        select: { version: true },
      });
      if (!run) return null;
      return {
        applied: false,
        transitionId: transition.id,
        fromStatus: this.asLifecycleStatus(transition.fromStatus),
        toStatus: this.asLifecycleStatus(transition.toStatus),
        version: run.version,
      };
    });
  }

  private asLifecycleStatus(
    status: PrismaAgentLifecycleStatus | null,
  ): AgentLifecycleStatus {
    if (status === null) {
      throw new Error('Agent lifecycle transition is missing a status');
    }
    return status as AgentLifecycleStatus;
  }

  private isIllegalTransitionError(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.message.includes('Illegal Agent lifecycle transition') ||
        error.message.includes('is terminal'))
    );
  }
}
