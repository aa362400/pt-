import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, type AgentRun } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import {
  AgentRunEventDto,
  AgentLifecycleEventDto,
  CancelAgentRunDto,
  CreateAgentRunDto,
  ListAgentRunsQueryDto,
  RetryAgentRunDto,
} from './agent-runs.dto.js';
import { AgentRunLifecycleService } from './agent-run-lifecycle.service.js';
import { AgentLifecycleEvent } from './agent-state-machine.js';
import {
  getCurrentTraceId,
  getCurrentTraceparent,
} from '../../shared/middleware/request-id.middleware.js';
import {
  ensureTraceId,
  parseTraceparent,
  traceparentForTraceId,
} from '../../shared/observability/trace-context.js';

@Injectable()
export class AgentRunsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('agent-runs') private readonly queue: Queue,
    private readonly eventEmitter: EventEmitter2,
    private readonly audit: AuditService,
    private readonly tenantDatabase: TenantDatabaseContextService,
    @Optional()
    private readonly lifecycle?: AgentRunLifecycleService,
  ) {}

  private requireOrg(user: JwtPayload): string {
    if (!user.orgId) {
      throw new ForbiddenException('User does not belong to an organization');
    }
    return user.orgId;
  }

  private validateInput(dto: CreateAgentRunDto): void {
    if (
      dto.agentType === 'GENERAL_ASSISTANT' &&
      (typeof dto.input.prompt !== 'string' || dto.input.prompt.trim() === '')
    ) {
      throw new BadRequestException(
        'GENERAL_ASSISTANT requires a non-empty input.prompt',
      );
    }
  }

  async create(
    user: JwtPayload,
    dto: CreateAgentRunDto,
    locale?: string,
  ): Promise<AgentRun> {
    const orgId = this.requireOrg(user);
    this.validateInput(dto);

    const clientRequestId = dto.clientRequestId?.trim() || undefined;
    if (clientRequestId) {
      const existing = await this.tenantDatabase.run(orgId, (tx) =>
        tx.agentRun.findUnique({
          where: {
            organizationId_clientRequestId: {
              organizationId: orgId,
              clientRequestId,
            },
          },
        }),
      );
      if (existing) {
        return existing;
      }
    }

    let run: AgentRun;
    const traceId = ensureTraceId(getCurrentTraceId());
    const activeTraceparent = parseTraceparent(getCurrentTraceparent());
    const traceparent =
      activeTraceparent?.traceId === traceId
        ? activeTraceparent.traceparent
        : traceparentForTraceId(traceId);
    try {
      run = await this.tenantDatabase.run(orgId, async (tx) => {
        const created = await tx.agentRun.create({
          data: {
            organizationId: orgId,
            workspaceId: dto.workspaceId ?? null,
            userId: user.sub,
            agentType: dto.agentType,
            status: 'PENDING',
            lifecycleStatus: 'CREATED',
            version: 0,
            traceId,
            input: dto.input as Prisma.InputJsonValue,
            clientRequestId,
            attempt: 1,
          },
        });
        const eventKey = `agent-run:${created.id}:created`;
        const transition = await tx.agentTransition.create({
          data: {
            organizationId: orgId,
            runId: created.id,
            fromStatus: null,
            toStatus: 'CREATED',
            eventType: 'RUN_CREATED',
            eventKey,
            payload: {
              source: 'api',
              clientRequestId: clientRequestId ?? null,
              traceId,
            },
            attempt: created.attempt,
          },
        });
        await tx.outboxEvent.create({
          data: {
            dedupeKey: `agent-lifecycle:${eventKey}`,
            organizationId: orgId,
            aggregateType: 'AgentRun',
            aggregateId: created.id,
            eventType: 'agent-run.lifecycle.changed',
            payload: {
              runId: created.id,
              transitionId: transition.id,
              event: 'RUN_CREATED',
              fromStatus: null,
              toStatus: 'CREATED',
              version: 0,
              eventKey,
            },
          },
        });
        await tx.outboxEvent.create({
          data: {
            dedupeKey: `agent-run:${created.id}:attempt:${created.attempt}`,
            organizationId: orgId,
            aggregateType: 'AgentRun',
            aggregateId: created.id,
            eventType: 'agent-run.enqueue',
            payload: {
              agentRunId: created.id,
              attempt: created.attempt,
              ...(locale ? { locale } : {}),
              traceId,
              traceparent,
            },
          },
        });
        return created;
      });
    } catch (error) {
      if (
        clientRequestId &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.tenantDatabase.run(orgId, (tx) =>
          tx.agentRun.findUnique({
            where: {
              organizationId_clientRequestId: {
                organizationId: orgId,
                clientRequestId,
              },
            },
          }),
        );
        if (existing) {
          return existing;
        }
      }
      throw error;
    }

    // 记录审计日志（阶段4：身份贯通）
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'agent-run.create',
      resourceType: 'AgentRun',
      resourceId: run.id,
      after: { agentType: dto.agentType, workspaceId: dto.workspaceId },
    });

    return run;
  }

  async findAll(
    user: JwtPayload,
    query: ListAgentRunsQueryDto,
  ): Promise<{
    items: AgentRun[];
    total: number;
    page: number;
    limit: number;
  }> {
    const orgId = this.requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [items, total] = await this.tenantDatabase.run(orgId, (tx) =>
      Promise.all([
        tx.agentRun.findMany({
          where: { organizationId: orgId },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.agentRun.count({ where: { organizationId: orgId } }),
      ]),
    );

    return { items, total, page, limit };
  }

  async findOne(user: JwtPayload, id: string): Promise<AgentRun> {
    const orgId = this.requireOrg(user);
    const run = await this.tenantDatabase.run(orgId, (tx) =>
      tx.agentRun.findFirst({ where: { id, organizationId: orgId } }),
    );
    if (!run) {
      throw new NotFoundException('Agent run not found');
    }
    return run;
  }

  async findTimeline(user: JwtPayload, id: string) {
    const orgId = this.requireOrg(user);
    const run = await this.findOne(user, id);
    const [transitions, steps] = await this.tenantDatabase.run(orgId, (tx) =>
      Promise.all([
        tx.agentTransition.findMany({
          where: { organizationId: orgId, runId: id },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }),
        tx.agentStep.findMany({
          where: { organizationId: orgId, runId: id },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }),
      ]),
    );
    return { run, transitions, steps };
  }

  async cancel(user: JwtPayload, id: string, dto: CancelAgentRunDto) {
    const orgId = this.requireOrg(user);
    await this.findOne(user, id);
    if (!this.lifecycle) {
      throw new ServiceUnavailableException(
        'Agent lifecycle service is not configured',
      );
    }
    const result = await this.lifecycle.applyEvent({
      organizationId: orgId,
      runId: id,
      event: AgentLifecycleEvent.CANCELLED_BY_USER,
      eventKey: `agent-run:${id}:cancel:${dto.requestId}`,
      payload: { actorId: user.sub, requestId: dto.requestId },
    });
    await this.tenantDatabase.run(orgId, (tx) =>
      tx.agentRun.updateMany({
        where: {
          id,
          organizationId: orgId,
          status: { notIn: ['COMPLETED', 'FAILED', 'CANCELLED'] },
        },
        data: { status: 'CANCELLED', finishedAt: new Date() },
      }),
    );
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'agent-run.cancel',
      resourceType: 'AgentRun',
      resourceId: id,
      after: { requestId: dto.requestId, lifecycle: result },
    });
    return result;
  }

  async retry(user: JwtPayload, id: string, dto: RetryAgentRunDto) {
    const orgId = this.requireOrg(user);
    const parent = await this.findOne(user, id);
    if (!['FAILED', 'CANCELLED'].includes(parent.lifecycleStatus)) {
      throw new BadRequestException(
        'Only failed or cancelled agent runs can be retried',
      );
    }

    const clientRequestId = `retry:${id}:${dto.requestId}`;
    const parentInput =
      typeof parent.input === 'object' &&
      parent.input !== null &&
      !Array.isArray(parent.input)
        ? parent.input
        : { originalInput: parent.input };
    const retryTraceId = ensureTraceId(parent.traceId ?? parent.id);
    const retryTraceparent = traceparentForTraceId(retryTraceId);

    let result: { run: AgentRun; created: boolean };
    try {
      result = await this.tenantDatabase.run(orgId, async (tx) => {
        const existing = await tx.agentRun.findUnique({
          where: {
            organizationId_clientRequestId: {
              organizationId: orgId,
              clientRequestId,
            },
          },
        });
        if (existing) {
          return { run: existing, created: false };
        }

        const retryRun = await tx.agentRun.create({
          data: {
            organizationId: orgId,
            workspaceId: parent.workspaceId,
            userId: user.sub,
            agentType: parent.agentType,
            provider: parent.provider,
            clientRequestId,
            attempt: 1,
            status: 'PENDING',
            lifecycleStatus: 'CREATED',
            version: 0,
            traceId: retryTraceId,
            input: {
              ...parentInput,
              retryOfRunId: parent.id,
            },
            progress: {
              status: 'pending',
              stage: 'manual_retry_queued',
              parentRunId: parent.id,
            },
          },
        });
        const eventKey = `agent-run:${retryRun.id}:created`;
        const transition = await tx.agentTransition.create({
          data: {
            organizationId: orgId,
            runId: retryRun.id,
            fromStatus: null,
            toStatus: 'CREATED',
            eventType: 'RUN_CREATED',
            eventKey,
            payload: {
              source: 'manual_retry',
              parentRunId: parent.id,
              requestId: dto.requestId,
              traceId: retryTraceId,
            },
            attempt: retryRun.attempt,
          },
        });
        await tx.outboxEvent.create({
          data: {
            dedupeKey: `agent-lifecycle:${eventKey}`,
            organizationId: orgId,
            aggregateType: 'AgentRun',
            aggregateId: retryRun.id,
            eventType: 'agent-run.lifecycle.changed',
            payload: {
              runId: retryRun.id,
              transitionId: transition.id,
              event: 'RUN_CREATED',
              fromStatus: null,
              toStatus: 'CREATED',
              version: 0,
              eventKey,
            },
          },
        });
        await tx.outboxEvent.create({
          data: {
            dedupeKey: `agent-run:${retryRun.id}:attempt:${retryRun.attempt}`,
            organizationId: orgId,
            aggregateType: 'AgentRun',
            aggregateId: retryRun.id,
            eventType: 'agent-run.enqueue',
            payload: {
              agentRunId: retryRun.id,
              attempt: retryRun.attempt,
              parentRunId: parent.id,
              traceId: retryTraceId,
              traceparent: retryTraceparent,
            },
          },
        });
        return { run: retryRun, created: true };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.tenantDatabase.run(orgId, (tx) =>
          tx.agentRun.findUnique({
            where: {
              organizationId_clientRequestId: {
                organizationId: orgId,
                clientRequestId,
              },
            },
          }),
        );
        if (existing) {
          return existing;
        }
      }
      throw error;
    }

    if (result.created) {
      await this.audit.log({
        organizationId: orgId,
        actorId: user.sub,
        action: 'agent-run.retry',
        resourceType: 'AgentRun',
        resourceId: result.run.id,
        after: {
          parentRunId: parent.id,
          requestId: dto.requestId,
          clientRequestId,
        },
      });
    }
    return result.run;
  }

  async recordLifecycleEvent(id: string, event: AgentLifecycleEventDto) {
    if (event.runId !== id) {
      throw new BadRequestException('Event runId does not match route id');
    }
    if (!this.lifecycle) {
      throw new ServiceUnavailableException(
        'Agent lifecycle service is not configured',
      );
    }
    return this.lifecycle.applyEvent({
      organizationId: event.organizationId,
      runId: id,
      event: event.event,
      eventKey: event.eventKey,
      payload: event.payload,
      attempt: event.attempt,
      currentStep: event.currentStep,
    });
  }

  /**
   * 记录智能体推送的进度事件（webhook）。
   * 只更新 progress 快照；最终状态仍以 worker 轮询结果为准（幂等、可降级）。
   */
  async recordEvent(
    id: string,
    event: AgentRunEventDto,
  ): Promise<{ recorded: boolean }> {
    if (event.runId !== id) {
      throw new BadRequestException('Event runId does not match route id');
    }
    const run = await this.tenantDatabase.run(event.organizationId, (tx) =>
      tx.agentRun.findFirst({
        where: { id, organizationId: event.organizationId },
        select: { id: true, status: true },
      }),
    );
    if (!run) throw new NotFoundException('Agent run not found');
    // 终态后到达的迟到事件直接忽略
    if (run.status === 'COMPLETED' || run.status === 'FAILED') {
      return { recorded: false };
    }

    await this.tenantDatabase.run(event.organizationId, (tx) =>
      tx.agentRun.update({
        where: { id: run.id },
        data: {
          progress: {
            status: event.status,
            stage: event.stage ?? null,
            message: event.message ?? null,
            at: event.timestamp ?? new Date().toISOString(),
          },
        },
      }),
    );

    // Emit event for SSE subscribers
    const eventType =
      event.status === 'completed'
        ? 'agent-run-completed'
        : event.status === 'failed'
          ? 'agent-run-failed'
          : 'agent-run-progress';
    const eventName =
      event.status === 'completed'
        ? 'agent-run.completed'
        : event.status === 'failed'
          ? 'agent-run.failed'
          : 'agent-run.progress';

    this.eventEmitter.emit(eventName, {
      type: eventType,
      runId: id,
      data: event,
    });

    return { recorded: true };
  }

  async remove(user: JwtPayload, id: string): Promise<{ id: string }> {
    const orgId = this.requireOrg(user);
    return this.tenantDatabase.run(orgId, async (tx) => {
      const run = await tx.agentRun.findFirst({
        where: { id, organizationId: orgId },
        select: { id: true },
      });
      if (!run) throw new NotFoundException('Agent run not found');
      await tx.agentRun.delete({ where: { id: run.id } });
      return { id: run.id };
    });
  }
}
