import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { requireOrg } from '../../shared/tenancy/org-scope.js';
import {
  getCurrentTraceId,
  getCurrentTraceparent,
} from '../../shared/middleware/request-id.middleware.js';
import {
  normalizeTraceId,
  resolveTraceContext,
} from '../../shared/observability/trace-context.js';
import {
  CreateFlowDto,
  ListFlowsQueryDto,
  RecoverFlowDto,
  TriggerFlowDto,
  UpdateFlowDto,
} from './automation.dto.js';

@Injectable()
export class AutomationService {
  constructor(
    @InjectQueue('automation-runs') private readonly queue: Queue,
    private readonly tenantDatabase: TenantDatabaseContextService,
  ) {}

  async create(user: JwtPayload, dto: CreateFlowDto) {
    const orgId = requireOrg(user);
    return this.tenantDatabase.run(orgId, async (tx) => {
      if (dto.workspaceId) {
        const workspace = await tx.workspace.findFirst({
          where: { id: dto.workspaceId, organizationId: orgId },
          select: { id: true },
        });
        if (!workspace) throw new NotFoundException('Workspace not found');
      }
      return tx.automationFlow.create({
        data: {
          organizationId: orgId,
          workspaceId: dto.workspaceId,
          name: dto.name,
          description: dto.description,
          triggerType: dto.triggerType,
          status: dto.status ?? undefined,
          triggerConfig: (dto.triggerConfig ?? {}) as Prisma.InputJsonValue,
          steps: (dto.steps ?? []) as Prisma.InputJsonValue,
          nextRunAt: dto.nextRunAt ? new Date(dto.nextRunAt) : undefined,
          createdBy: user.sub,
        },
      });
    });
  }

  async findAll(user: JwtPayload, query: ListFlowsQueryDto) {
    const orgId = requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.AutomationFlowWhereInput = {
      organizationId: orgId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await this.tenantDatabase.run(orgId, (tx) =>
      Promise.all([
        tx.automationFlow.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          include: {
            _count: { select: { runs: true } },
            runs: {
              orderBy: { startedAt: 'desc' },
              take: 1,
            },
          },
        }),
        tx.automationFlow.count({ where }),
      ]),
    );
    return { items, total, page, limit };
  }

  private async findOwned(orgId: string, id: string) {
    const flow = await this.tenantDatabase.run(orgId, (tx) =>
      tx.automationFlow.findFirst({
        where: { id, organizationId: orgId },
      }),
    );
    if (!flow) {
      throw new NotFoundException('Automation flow not found');
    }
    return flow;
  }

  async findOne(user: JwtPayload, id: string) {
    return this.findOwned(requireOrg(user), id);
  }

  async update(user: JwtPayload, id: string, dto: UpdateFlowDto) {
    const orgId = requireOrg(user);
    return this.tenantDatabase.run(orgId, async (tx) => {
      const flow = await tx.automationFlow.findFirst({
        where: { id, organizationId: orgId },
      });
      if (!flow) throw new NotFoundException('Automation flow not found');
      if (dto.workspaceId) {
        const workspace = await tx.workspace.findFirst({
          where: { id: dto.workspaceId, organizationId: orgId },
          select: { id: true },
        });
        if (!workspace) throw new NotFoundException('Workspace not found');
      }
      return tx.automationFlow.update({
        where: { id: flow.id },
        data: {
          name: dto.name,
          description: dto.description,
          status: dto.status,
          triggerType: dto.triggerType,
          triggerConfig:
            dto.triggerConfig !== undefined
              ? (dto.triggerConfig as Prisma.InputJsonValue)
              : undefined,
          steps:
            dto.steps !== undefined
              ? (dto.steps as Prisma.InputJsonValue)
              : undefined,
          nextRunAt: dto.nextRunAt ? new Date(dto.nextRunAt) : undefined,
          workspaceId: dto.workspaceId,
        },
      });
    });
  }

  /** Manually triggers a flow: creates an idempotent AutomationRun and enqueues it. */
  async trigger(user: JwtPayload, id: string, dto: TriggerFlowDto) {
    const orgId = requireOrg(user);
    const traceContext = this.resolveAutomationTrace();
    const reason = dto.reason.trim();
    const idempotencyKey = dto.idempotencyKey.trim();
    const { flow, run, created } = await this.createManualRun({
      organizationId: orgId,
      actorId: user.sub,
      flowId: id,
      reason,
      idempotencyKey,
      traceId: traceContext.traceId,
      traceparent: traceContext.traceparent,
    });
    if (!created) {
      return { ...run, idempotent: true as const };
    }

    try {
      await this.queue.add(
        'run',
        {
          automationRunId: run.id,
          organizationId: orgId,
          trigger: 'manual',
          reason,
          idempotencyKey,
          traceId: traceContext.traceId,
          traceparent: traceContext.traceparent,
        },
        {
          priority: this.queuePriority(flow),
          jobId: this.queueJobId(run.id),
        },
      );
    } catch (error) {
      await this.markEnqueueFailed(orgId, run.id, 'manual_enqueue', error);
      throw new InternalServerErrorException(
        'Automation run could not be queued',
      );
    }
    return { ...run, idempotent: false as const };
  }

  async recover(user: JwtPayload, id: string, dto: RecoverFlowDto) {
    return this.recoverFromFailure({
      organizationId: requireOrg(user),
      actorId: user.sub,
      flowId: id,
      failedRunId: dto.failedRunId,
      reason: dto.reason,
      idempotencyKey: dto.idempotencyKey,
      source: 'automation_console',
    });
  }

  /**
   * Starts a fresh run after a terminal failure. The failed run remains
   * immutable evidence; recovery never re-labels it as successful.
   */
  async recoverFromFailure(input: {
    organizationId: string;
    actorId: string;
    flowId: string;
    failedRunId: string;
    reason: string;
    idempotencyKey: string;
    source: 'automation_console' | 'notification_center' | 'dead_letter_triage';
  }) {
    const normalized = {
      ...input,
      reason: input.reason.trim(),
      idempotencyKey: input.idempotencyKey.trim(),
    };
    const recovery = await this.createRecoveryRun(normalized);
    if ('alreadyQueued' in recovery) return recovery.alreadyQueued;
    if ('duplicate' in recovery && recovery.duplicate) {
      const duplicate = recovery.duplicate;
      return {
        status: ['PENDING', 'RUNNING'].includes(duplicate.status)
          ? ('already_queued' as const)
          : ('already_created' as const),
        flowId: input.flowId,
        automationRunId: duplicate.id,
        idempotencyKey: normalized.idempotencyKey,
        externalStoreMutation: 'not_executed' as const,
      };
    }
    const { flow, run, traceparent } = recovery;
    try {
      await this.queue.add(
        'run',
        {
          automationRunId: run.id,
          organizationId: input.organizationId,
          trigger: 'manual_recovery',
          reason: normalized.reason,
          idempotencyKey: normalized.idempotencyKey,
          traceId: run.traceId,
          traceparent,
        },
        {
          priority: this.queuePriority(flow),
          jobId: this.queueJobId(run.id),
        },
      );
    } catch (error) {
      await this.markEnqueueFailed(
        input.organizationId,
        run.id,
        'recovery_enqueue',
        error,
      );
      throw new InternalServerErrorException(
        'Automation recovery could not be queued',
      );
    }

    return {
      status: 'queued' as const,
      action: 'automation.recover' as const,
      flowId: flow.id,
      automationRunId: run.id,
      idempotencyKey: normalized.idempotencyKey,
      externalStoreMutation: 'not_executed' as const,
    };
  }

  private async createManualRun(input: {
    organizationId: string;
    actorId: string;
    flowId: string;
    reason: string;
    idempotencyKey: string;
    traceId: string;
    traceparent: string;
  }) {
    try {
      return await this.tenantDatabase.run(input.organizationId, async (tx) => {
        const flow = await tx.automationFlow.findFirst({
          where: {
            id: input.flowId,
            organizationId: input.organizationId,
          },
        });
        if (!flow) throw new NotFoundException('Automation flow not found');

        const existing = await tx.automationRun.findUnique({
          where: {
            flowId_idempotencyKey: {
              flowId: flow.id,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (existing) {
          this.assertSameTriggerRequest(existing, {
            source: 'manual',
            reason: input.reason,
            parentRunId: null,
          });
          return { flow, run: existing, created: false as const };
        }

        const run = await tx.automationRun.create({
          data: {
            flowId: flow.id,
            traceId: input.traceId,
            idempotencyKey: input.idempotencyKey,
            triggerSource: 'manual',
            triggerReason: input.reason,
            requestedBy: input.actorId,
            jobSnapshot: this.jobSnapshot({
              organizationId: input.organizationId,
              flowId: flow.id,
              trigger: 'manual',
              reason: input.reason,
              idempotencyKey: input.idempotencyKey,
              traceId: input.traceId,
              traceparent: input.traceparent,
              requestedBy: input.actorId,
            }),
          },
        });
        return { flow, run, created: true as const };
      });
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      return this.tenantDatabase.run(input.organizationId, async (tx) => {
        const flow = await tx.automationFlow.findFirst({
          where: {
            id: input.flowId,
            organizationId: input.organizationId,
          },
        });
        if (!flow) throw new NotFoundException('Automation flow not found');
        const existing = await tx.automationRun.findUnique({
          where: {
            flowId_idempotencyKey: {
              flowId: flow.id,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (!existing) throw error;
        this.assertSameTriggerRequest(existing, {
          source: 'manual',
          reason: input.reason,
          parentRunId: null,
        });
        return { flow, run: existing, created: false as const };
      });
    }
  }

  private async createRecoveryRun(input: {
    organizationId: string;
    actorId: string;
    flowId: string;
    failedRunId: string;
    reason: string;
    idempotencyKey: string;
    source: 'automation_console' | 'notification_center' | 'dead_letter_triage';
  }) {
    try {
      return await this.tenantDatabase.run(input.organizationId, async (tx) => {
        const flow = await tx.automationFlow.findFirst({
          where: {
            id: input.flowId,
            organizationId: input.organizationId,
          },
        });
        if (!flow) throw new NotFoundException('Automation flow not found');

        const existing = await tx.automationRun.findUnique({
          where: {
            flowId_idempotencyKey: {
              flowId: flow.id,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (existing) {
          this.assertSameTriggerRequest(existing, {
            source: input.source,
            reason: input.reason,
            parentRunId: input.failedRunId,
          });
          return { duplicate: existing };
        }

        const failedRun = await tx.automationRun.findFirst({
          where: {
            id: input.failedRunId,
            flowId: flow.id,
            status: 'FAILED',
          },
          select: { id: true, status: true, traceId: true },
        });
        if (!failedRun) {
          throw new BadRequestException(
            'Automation recovery requires the specified terminal failed run for this flow',
          );
        }

        const activeRun = await tx.automationRun.findFirst({
          where: {
            flowId: flow.id,
            status: { in: ['PENDING', 'RUNNING'] },
          },
          orderBy: { startedAt: 'desc' },
          select: { id: true },
        });
        if (activeRun) {
          return {
            alreadyQueued: {
              status: 'already_queued' as const,
              flowId: flow.id,
              automationRunId: activeRun.id,
              dedupeReason: 'active_run' as const,
              externalStoreMutation: 'not_executed' as const,
            },
          };
        }

        const now = new Date();
        const triggerConfig = this.asRecord(flow.triggerConfig);
        await tx.automationFlow.update({
          where: { id: flow.id },
          data: {
            status: 'ACTIVE',
            triggerConfig: {
              ...triggerConfig,
              agentProviderFailureStreak: 0,
              agentProviderBackoffUntil: null,
              recovery: {
                source: input.source,
                actorId: input.actorId,
                failedRunId: failedRun.id,
                reason: input.reason,
                idempotencyKey: input.idempotencyKey,
                requestedAt: now.toISOString(),
              },
            },
          },
        });

        const traceContext = this.resolveAutomationTrace(failedRun.traceId);
        const run = await tx.automationRun.create({
          data: {
            flowId: flow.id,
            traceId: traceContext.traceId,
            idempotencyKey: input.idempotencyKey,
            triggerSource: input.source,
            triggerReason: input.reason,
            requestedBy: input.actorId,
            parentRunId: failedRun.id,
            jobSnapshot: this.jobSnapshot({
              organizationId: input.organizationId,
              flowId: flow.id,
              trigger: 'manual_recovery',
              reason: input.reason,
              idempotencyKey: input.idempotencyKey,
              traceId: traceContext.traceId,
              traceparent: traceContext.traceparent,
              requestedBy: input.actorId,
              parentRunId: failedRun.id,
              source: input.source,
            }),
          },
        });
        return { flow, run, traceparent: traceContext.traceparent };
      });
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      return this.tenantDatabase.run(input.organizationId, async (tx) => {
        const existing = await tx.automationRun.findUnique({
          where: {
            flowId_idempotencyKey: {
              flowId: input.flowId,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (!existing) throw error;
        this.assertSameTriggerRequest(existing, {
          source: input.source,
          reason: input.reason,
          parentRunId: input.failedRunId,
        });
        return { duplicate: existing };
      });
    }
  }

  private assertSameTriggerRequest(
    existing: {
      triggerSource: string;
      triggerReason: string | null;
      parentRunId: string | null;
    },
    expected: {
      source: string;
      reason: string;
      parentRunId: string | null;
    },
  ): void {
    if (
      existing.triggerSource !== expected.source ||
      existing.triggerReason !== expected.reason ||
      existing.parentRunId !== expected.parentRunId
    ) {
      throw new ConflictException(
        'Idempotency key was already used with a different automation request',
      );
    }
  }

  private jobSnapshot(value: Record<string, unknown>): Prisma.InputJsonValue {
    return {
      ...value,
      policy: {
        externalStoreMutation: 'not_executed',
        externalSideEffects: 'approval_token_required',
      },
    } as Prisma.InputJsonValue;
  }

  private queueJobId(runId: string): string {
    return `automation-run-${runId}`;
  }

  private isUniqueConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private async markEnqueueFailed(
    organizationId: string,
    runId: string,
    stage: string,
    error: unknown,
  ): Promise<void> {
    const message =
      error instanceof Error ? error.message : 'Unable to enqueue automation';
    await this.tenantDatabase.run(organizationId, (tx) =>
      tx.automationRun.updateMany({
        where: { id: runId, status: 'PENDING' },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          error: { message, stage },
        },
      }),
    );
  }

  async listRuns(user: JwtPayload, id: string, query: ListFlowsQueryDto) {
    const orgId = requireOrg(user);
    const flow = await this.findOwned(orgId, id);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where = { flowId: flow.id };
    const [items, total] = await this.tenantDatabase.run(orgId, (tx) =>
      Promise.all([
        tx.automationRun.findMany({
          where,
          orderBy: { startedAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.automationRun.count({ where }),
      ]),
    );
    return { items, total, page, limit };
  }

  async remove(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const flow = await this.findOwned(orgId, id);
    await this.tenantDatabase.run(orgId, (tx) =>
      tx.automationFlow.delete({ where: { id: flow.id } }),
    );
    return { id: flow.id };
  }

  private queuePriority(flow: {
    name: string;
    workspaceId: string | null;
    triggerConfig: Prisma.JsonValue;
  }): number {
    if (this.isConnectedStoreOperatorFlow(flow)) {
      return 0;
    }
    if (flow.workspaceId) {
      return 1;
    }
    return 2;
  }

  private isConnectedStoreOperatorFlow(flow: {
    name: string;
    triggerConfig: Prisma.JsonValue;
  }): boolean {
    const config =
      flow.triggerConfig &&
      typeof flow.triggerConfig === 'object' &&
      !Array.isArray(flow.triggerConfig)
        ? (flow.triggerConfig as Record<string, unknown>)
        : {};
    return (
      config.source === 'connected_store_operator' ||
      flow.name.includes('[agentautomatictext]')
    );
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private resolveAutomationTrace(preferredTraceId?: unknown) {
    const currentTraceId = getCurrentTraceId();
    const traceId = normalizeTraceId(preferredTraceId) ?? currentTraceId;
    return resolveTraceContext({
      traceId,
      traceparent:
        traceId && traceId === currentTraceId
          ? getCurrentTraceparent()
          : undefined,
    });
  }
}
