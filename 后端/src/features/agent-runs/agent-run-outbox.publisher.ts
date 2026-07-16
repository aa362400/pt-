import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { randomUUID } from 'crypto';
import type { Queue } from 'bullmq';
import { Prisma, type OutboxEvent } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import {
  ensureTraceId,
  normalizeTraceId,
  parseTraceparent,
  traceparentForTraceId,
} from '../../shared/observability/trace-context.js';

const MAX_ATTEMPTS = 5;
const LOCK_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 2_000;
const BACKOFF_MS = [2_000, 10_000, 30_000, 120_000, 600_000];

@Injectable()
export class AgentRunOutboxPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentRunOutboxPublisher.name);
  private readonly publisherId = `outbox-${randomUUID()}`;
  private timer?: NodeJS.Timeout;
  private running = false;
  private activeRun?: Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('agent-runs') private readonly queue: Queue,
    private readonly tenantDatabase: TenantDatabaseContextService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(
      () => void this.startPublishing(),
      POLL_INTERVAL_MS,
    );
    this.timer.unref();
    void this.startPublishing();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.activeRun;
  }

  private startPublishing(): Promise<void> {
    if (this.activeRun) return this.activeRun;
    const run = this.publishPending()
      .catch((error) => {
        this.logger.error(
          'AgentRun outbox scan failed',
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => {
        if (this.activeRun === run) this.activeRun = undefined;
      });
    this.activeRun = run;
    return run;
  }

  async publishPending(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const organizations = await this.prisma.organization.findMany({
        select: { id: true },
      });
      for (const organization of organizations) {
        await this.recoverExpiredLocks(organization.id);
        await this.recoverOrphanedRuns(organization.id);
        await this.recoverQueuedRuns(organization.id);
        const now = new Date();
        const events = await this.tenantDatabase.run(organization.id, (tx) =>
          tx.outboxEvent.findMany({
            where: {
              organizationId: organization.id,
              eventType: 'agent-run.enqueue',
              status: { in: ['PENDING', 'RETRYING'] },
              OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
            },
            orderBy: { createdAt: 'asc' },
            take: 20,
          }),
        );
        for (const event of events) {
          await this.publishOne(event, organization.id);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async publishOne(
    event: OutboxEvent,
    organizationId: string,
  ): Promise<void> {
    const claimed = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.outboxEvent.updateMany({
        where: { id: event.id, organizationId, status: event.status },
        data: {
          status: 'PROCESSING',
          lockedAt: new Date(),
          lockedBy: this.publisherId,
        },
      }),
    );
    if (claimed.count !== 1) return;

    const payload = this.asRecord(event.payload);
    const agentRunId = this.asString(payload.agentRunId) ?? event.aggregateId;
    const attempt = this.asPositiveInt(payload.attempt, 1);
    const regenerationAttempt = this.asPositiveInt(
      payload.regenerationAttempt,
      0,
    );
    const locale = this.asString(payload.locale);
    const jobId = `agent-run__${agentRunId}__attempt__${attempt}`;

    try {
      const traceContext = await this.resolveRunTraceContext(
        organizationId,
        agentRunId,
        payload,
      );
      const runTransition = await this.tenantDatabase.run(
        organizationId,
        (tx) =>
          tx.agentRun.updateMany({
            where: {
              id: agentRunId,
              organizationId,
              attempt,
              status: { in: ['PENDING', 'ENQUEUING', 'RETRYING'] },
            },
            data: { status: 'ENQUEUING' },
          }),
      );
      if (runTransition.count !== 1) {
        const run = await this.tenantDatabase.run(organizationId, (tx) =>
          tx.agentRun.findFirst({
            where: { id: agentRunId, organizationId },
            select: { id: true, status: true, attempt: true },
          }),
        );
        if (!run) {
          await this.quarantineOrphanedEvent(event, organizationId, agentRunId);
          return;
        }
        if (
          run.attempt !== attempt ||
          [
            'COMPLETED',
            'FAILED',
            'CANCELLED',
            'TIMEOUT',
            'DEAD_LETTERED',
          ].includes(run.status)
        ) {
          await this.quarantineStaleEvent(
            event,
            organizationId,
            agentRunId,
            attempt,
            run.attempt,
            run.status,
          );
          return;
        }
      }
      await this.queue.add(
        'run',
        {
          agentRunId,
          organizationId,
          attempt,
          ...(locale ? { locale } : {}),
          ...(regenerationAttempt > 0 ? { regenerationAttempt } : {}),
          ...traceContext,
        },
        { jobId },
      );
      const publishedAt = new Date();
      await this.tenantDatabase.run(organizationId, (tx) =>
        Promise.all([
          tx.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: 'PUBLISHED',
              attempts: { increment: 1 },
              publishedAt,
              lockedAt: null,
              lockedBy: null,
              lastError: null,
              nextRetryAt: null,
            },
          }),
          tx.agentRun.updateMany({
            where: {
              id: agentRunId,
              organizationId,
              attempt,
              status: { in: ['PENDING', 'ENQUEUING', 'RETRYING'] },
            },
            data: { status: 'QUEUED' },
          }),
        ]),
      );
    } catch (error) {
      await this.recordFailure(
        event,
        organizationId,
        agentRunId,
        attempt,
        error,
      );
    }
  }

  private async recordFailure(
    event: OutboxEvent,
    organizationId: string,
    agentRunId: string,
    attempt: number,
    error: unknown,
  ): Promise<void> {
    const run = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.agentRun.findFirst({
        where: { id: agentRunId, organizationId },
        select: { id: true },
      }),
    );
    if (!run) {
      await this.quarantineOrphanedEvent(event, organizationId, agentRunId);
      return;
    }
    const attempts = event.attempts + 1;
    const message = (error instanceof Error ? error.message : String(error))
      .replace(/(token|key|secret)=?[^\s,;]*/gi, '$1=[redacted]')
      .slice(0, 500);
    const terminal = attempts >= MAX_ATTEMPTS;
    const nextRetryAt = terminal
      ? null
      : new Date(
          Date.now() +
            BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)],
        );

    await this.tenantDatabase.run(organizationId, (tx) =>
      Promise.all([
        tx.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: terminal ? 'DEAD_LETTERED' : 'RETRYING',
            attempts,
            lastError: message,
            nextRetryAt,
            lockedAt: null,
            lockedBy: null,
          },
        }),
        tx.agentRun.updateMany({
          where: {
            id: agentRunId,
            organizationId,
            attempt,
            status: { in: ['PENDING', 'ENQUEUING', 'RETRYING'] },
          },
          data: terminal
            ? {
                status: 'FAILED',
                errorCode: 'AGENT_ENQUEUE_FAILED',
                errorMessage: message,
                finishedAt: new Date(),
              }
            : {
                status: 'PENDING',
                errorCode: 'AGENT_ENQUEUE_RETRYING',
                errorMessage: message,
              },
        }),
      ]),
    );
    this.logger.warn(
      `AgentRun outbox ${event.id} publish failed (${attempts}/${MAX_ATTEMPTS})`,
    );
  }

  private async quarantineOrphanedEvent(
    event: OutboxEvent,
    organizationId: string,
    agentRunId: string,
  ): Promise<void> {
    const lastError = `AgentRun ${agentRunId} no longer exists; orphaned event quarantined`;
    await this.tenantDatabase.run(organizationId, (tx) =>
      tx.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'DEAD_LETTERED',
          attempts: { increment: 1 },
          lastError,
          nextRetryAt: null,
          lockedAt: null,
          lockedBy: null,
        },
      }),
    );
    this.logger.warn(lastError);
  }

  private async quarantineStaleEvent(
    event: OutboxEvent,
    organizationId: string,
    agentRunId: string,
    eventAttempt: number,
    currentAttempt: number,
    currentStatus: string,
  ): Promise<void> {
    const lastError =
      `AgentRun ${agentRunId} outbox attempt ${eventAttempt} is stale; ` +
      `current attempt=${currentAttempt}, status=${currentStatus}`;
    await this.tenantDatabase.run(organizationId, (tx) =>
      tx.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'DEAD_LETTERED',
          attempts: { increment: 1 },
          lastError,
          nextRetryAt: null,
          lockedAt: null,
          lockedBy: null,
        },
      }),
    );
    this.logger.warn(lastError);
  }

  private async recoverExpiredLocks(organizationId: string): Promise<void> {
    await this.tenantDatabase.run(organizationId, (tx) =>
      tx.outboxEvent.updateMany({
        where: {
          organizationId,
          eventType: 'agent-run.enqueue',
          status: 'PROCESSING',
          lockedAt: { lt: new Date(Date.now() - LOCK_TIMEOUT_MS) },
        },
        data: {
          status: 'RETRYING',
          lockedAt: null,
          lockedBy: null,
          nextRetryAt: new Date(),
          lastError: 'Publisher lease expired and was recovered',
        },
      }),
    );
  }

  private async recoverOrphanedRuns(organizationId: string): Promise<void> {
    const runs = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.agentRun.findMany({
        where: {
          organizationId,
          status: 'PENDING',
          createdAt: { lt: new Date(Date.now() - 30_000) },
        },
        select: {
          id: true,
          organizationId: true,
          attempt: true,
          traceId: true,
        },
        take: 20,
      }),
    );
    for (const run of runs) {
      const dedupeKey = `agent-run:${run.id}:attempt:${run.attempt}`;
      try {
        await this.tenantDatabase.run(organizationId, (tx) =>
          tx.outboxEvent.create({
            data: {
              dedupeKey,
              organizationId: run.organizationId,
              aggregateType: 'AgentRun',
              aggregateId: run.id,
              eventType: 'agent-run.enqueue',
              payload: {
                agentRunId: run.id,
                attempt: run.attempt,
                traceId: ensureTraceId(run.traceId ?? run.id),
                traceparent: traceparentForTraceId(
                  ensureTraceId(run.traceId ?? run.id),
                ),
              },
            },
          }),
        );
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        ) {
          throw error;
        }
      }
    }
  }

  private async recoverQueuedRuns(organizationId: string): Promise<void> {
    const runs = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.agentRun.findMany({
        where: { organizationId, status: 'QUEUED' },
        select: {
          id: true,
          organizationId: true,
          attempt: true,
          traceId: true,
        },
        orderBy: { createdAt: 'asc' },
        take: 20,
      }),
    );

    for (const run of runs) {
      const jobId = `agent-run__${run.id}__attempt__${run.attempt}`;
      const traceId = ensureTraceId(run.traceId ?? run.id);
      try {
        const existingJob = await this.queue.getJob(jobId);
        if (existingJob) {
          const state = await existingJob.getState();
          if (state !== 'completed' && state !== 'failed') continue;
          await existingJob.remove();
        }

        await this.queue.add(
          'run',
          {
            agentRunId: run.id,
            organizationId: run.organizationId,
            attempt: run.attempt,
            traceId,
            traceparent: traceparentForTraceId(traceId),
          },
          { jobId },
        );
        await this.tenantDatabase.run(organizationId, (tx) =>
          tx.agentRun.updateMany({
            where: {
              id: run.id,
              organizationId,
              attempt: run.attempt,
              status: 'QUEUED',
            },
            data: {
              progress: {
                status: 'queued',
                stage: 'queue_job_recovered',
                recoveredAt: new Date().toISOString(),
              },
            },
          }),
        );
        this.logger.warn(
          `Recovered missing BullMQ job ${jobId} for queued AgentRun ${run.id}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to recover queued AgentRun ${run.id}`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  private async resolveRunTraceContext(
    organizationId: string,
    agentRunId: string,
    payload: Record<string, unknown>,
  ): Promise<{ traceId: string; traceparent: string }> {
    const parsed = parseTraceparent(payload.traceparent);
    const payloadTraceId = normalizeTraceId(payload.traceId);
    if (parsed && (!payloadTraceId || payloadTraceId === parsed.traceId)) {
      return { traceId: parsed.traceId, traceparent: parsed.traceparent };
    }
    if (payloadTraceId) {
      return {
        traceId: payloadTraceId,
        traceparent: traceparentForTraceId(payloadTraceId),
      };
    }

    const run = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.agentRun.findFirst({
        where: { id: agentRunId, organizationId },
        select: { traceId: true },
      }),
    );
    const traceId = ensureTraceId(run?.traceId ?? agentRunId);
    return { traceId, traceparent: traceparentForTraceId(traceId) };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private asPositiveInt(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}
