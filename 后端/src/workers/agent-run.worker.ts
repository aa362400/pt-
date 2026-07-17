import {
  Processor,
  WorkerHost,
  OnWorkerEvent,
  InjectQueue,
} from '@nestjs/bullmq';
import { Inject, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Job, Queue, UnrecoverableError } from 'bullmq';
import { Counter } from 'prom-client';
import type { AgentType } from '@prisma/client';
import { PrismaService } from '../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../shared/database/tenant-database-context.service.js';
import { AGENT_PROVIDER } from '../agents/agent.module.js';
import type { AgentProviderInterface } from '../agents/agent-provider.interface.js';
import { AgentRunLifecycleService } from '../features/agent-runs/agent-run-lifecycle.service.js';
import { AgentRunLeaseService } from '../features/agent-runs/agent-run-lease.service.js';
import {
  AgentLifecycleEvent,
  AgentLifecycleStatus,
  resolveAgentTransition,
} from '../features/agent-runs/agent-state-machine.js';
import { ReviewService } from '../features/review/review.service.js';
import { AgentMemoryService } from '../features/agent-memory/agent-memory.service.js';
import { asString, asOptionalString } from '../shared/utils/coerce.js';
import type { AgentCallContext } from '../agents/agent-provider.interface.js';
import { asyncLocalStorage } from '../shared/middleware/request-id.middleware.js';
import {
  ensureTraceId,
  normalizeTraceId,
  parseTraceparent,
  traceparentForTraceId,
} from '../shared/observability/trace-context.js';
import { normalizeAgentRunErrorCode } from '../shared/errors/agent-run-error-code.js';

export interface AgentRunJobData {
  agentRunId: string;
  organizationId: string;
  attempt?: number;
  locale?: string;
  regenerationAttempt?: number;
  traceId?: string;
  traceparent?: string;
}

@Processor('agent-runs', { concurrency: 3 })
export class AgentRunWorker extends WorkerHost {
  private readonly logger = new Logger(AgentRunWorker.name);
  private readonly workerId = `agent-run-worker:${randomUUID()}`;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AGENT_PROVIDER)
    private readonly agentProvider: AgentProviderInterface,
    private readonly reviewService: ReviewService,
    @InjectQueue('dead-letter') private readonly deadLetterQueue: Queue,
    private readonly configService: ConfigService,
    @InjectMetric('agent_runs_total')
    private readonly agentRunsCounter: Counter<string>,
    @InjectMetric('agent_run_quality_total')
    private readonly agentRunQualityCounter: Counter<string>,
    private readonly agentMemory: AgentMemoryService,
    private readonly tenantDatabase: TenantDatabaseContextService,
    private readonly lifecycle: AgentRunLifecycleService,
    @Optional()
    private readonly lease?: AgentRunLeaseService,
  ) {
    super();
  }

  private traceparentForRun(traceId: string, value?: unknown): string {
    const parsed = parseTraceparent(value);
    return parsed?.traceId === traceId
      ? parsed.traceparent
      : traceparentForTraceId(traceId);
  }

  private reviewThreshold(): number {
    return this.configService.get<number>('AGENT_REVIEW_THRESHOLD') ?? 60;
  }

  private failureCode(error: unknown): string {
    return normalizeAgentRunErrorCode(error);
  }

  private toQueueFailure(error: unknown): Error {
    if (error instanceof UnrecoverableError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    if (
      this.failureCode(error) === 'IMAGE_PROVIDER_QUOTA_EXHAUSTED' ||
      this.failureCode(error) === 'IMAGE_PROVIDER_FALLBACK_EXHAUSTED' ||
      this.failureCode(error) === 'MODEL_PROVIDER_QUOTA_EXHAUSTED' ||
      this.failureCode(error) === 'MODEL_PROVIDER_FALLBACK_EXHAUSTED' ||
      this.failureCode(error) === 'IMAGE_PROVIDER_INVALID_KEY' ||
      this.failureCode(error) === 'EVIDENCE_INSUFFICIENT' ||
      this.failureCode(error) === 'EVIDENCE_QUALITY_GATE_FAILED'
    ) {
      return new UnrecoverableError(message);
    }
    const status =
      error && typeof error === 'object' && 'status' in error
        ? Number((error as { status?: unknown }).status)
        : Number.NaN;

    // Invalid input and authorization failures cannot succeed on retry. Network,
    // timeout, rate-limit, and 5xx failures remain retryable by BullMQ.
    if (
      Number.isInteger(status) &&
      status >= 400 &&
      status < 500 &&
      status !== 429
    ) {
      return new UnrecoverableError(message);
    }
    return error instanceof Error ? error : new Error(message);
  }

  async process(job: Job<AgentRunJobData>): Promise<unknown> {
    const initialTraceId =
      normalizeTraceId(job.data.traceId) ?? ensureTraceId(job.data.agentRunId);
    const initialTraceparent = this.traceparentForRun(
      initialTraceId,
      job.data.traceparent,
    );
    const initialRequestId = `${job.data.agentRunId}:attempt:${this.asPositiveInt(
      job.data.attempt,
      1,
    )}`;
    const store = new Map<string, string>([
      ['requestId', initialRequestId],
      ['traceId', initialTraceId],
      ['traceparent', initialTraceparent],
      ['runId', job.data.agentRunId],
      ['tenantId', job.data.organizationId],
    ]);
    return asyncLocalStorage.run(store, () => this.processWithContext(job));
  }

  private async processWithContext(
    job: Job<AgentRunJobData>,
  ): Promise<unknown> {
    const { agentRunId, organizationId } = job.data;
    if (!organizationId) {
      throw new UnrecoverableError('AgentRun job organizationId is required');
    }
    this.logger.log(`Processing agent-run ${agentRunId} (job ${job.id})`);

    const run = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.agentRun.findFirst({ where: { id: agentRunId, organizationId } }),
    );
    if (!run) {
      this.logger.warn(
        `Skipping stale agent-run job ${job.id ?? 'unknown'}: AgentRun ${agentRunId} not found`,
      );
      this.agentRunsCounter.inc({
        agent_type: 'unknown',
        status: 'skipped',
      });
      return { status: 'skipped', agentRunId, reason: 'not_found' };
    }

    const traceId =
      normalizeTraceId(job.data.traceId) ??
      ensureTraceId(run.traceId ?? run.id);
    const traceparent = this.traceparentForRun(traceId, job.data.traceparent);
    const store = asyncLocalStorage.getStore();
    store?.set('traceId', traceId);
    store?.set('traceparent', traceparent);
    store?.set('runId', run.id);
    store?.set('tenantId', organizationId);

    const runAttempt = this.asPositiveInt(run.attempt, 1);
    const jobAttempt = this.asPositiveInt(job.data.attempt, runAttempt);
    if (
      ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT', 'DEAD_LETTERED'].includes(
        run.status,
      )
    ) {
      this.logger.warn(
        `Skipping terminal agent-run ${run.id} (status=${run.status}, job=${job.id ?? 'unknown'})`,
      );
      return { status: 'skipped', agentRunId, reason: 'terminal' };
    }
    if (jobAttempt !== runAttempt) {
      this.logger.warn(
        `Skipping stale agent-run attempt ${jobAttempt}; current attempt is ${runAttempt} (${run.id})`,
      );
      return { status: 'skipped', agentRunId, reason: 'stale_attempt' };
    }

    const startedAt = run.startedAt ?? new Date();
    const claimed = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.agentRun.updateMany({
        where: {
          id: run.id,
          organizationId,
          attempt: jobAttempt,
          OR: [
            { status: { in: ['PENDING', 'ENQUEUING', 'QUEUED', 'RETRYING'] } },
            { status: 'RUNNING', errorCode: 'AGENT_RETRYING' },
          ],
        },
        data: {
          status: 'RUNNING',
          startedAt,
          finishedAt: null,
          errorCode: null,
          errorMessage: null,
        },
      }),
    );
    if (claimed.count !== 1) {
      this.logger.warn(
        `Skipping already claimed agent-run attempt ${jobAttempt} (${run.id})`,
      );
      return { status: 'skipped', agentRunId, reason: 'already_claimed' };
    }

    let lifecycleStatus = this.asLifecycleStatus(run.lifecycleStatus);
    let leaseOwner: string | undefined;
    let heartbeatTimer: NodeJS.Timeout | undefined;
    try {
      lifecycleStatus = await this.beginLifecycleAttempt(
        run.id,
        organizationId,
        jobAttempt,
        lifecycleStatus,
      );
      if (this.lease) {
        const ttlMs = this.agentRunLeaseTtlMs();
        const ownerId = `${this.workerId}:${job.id ?? run.id}:attempt:${jobAttempt}`;
        const acquired = await this.lease.acquire({
          organizationId,
          runId: run.id,
          ownerId,
          ttlMs,
        });
        if (!acquired) {
          this.logger.warn(
            `Skipping agent-run ${run.id}; an active worker lease already exists`,
          );
          return { status: 'skipped', agentRunId, reason: 'lease_conflict' };
        }
        leaseOwner = ownerId;
        heartbeatTimer = this.startLeaseHeartbeat(
          organizationId,
          run.id,
          ownerId,
          ttlMs,
        );
      }
      const input = (run.input ?? {}) as Record<string, unknown>;
      await this.recordRouterSelection({
        organizationId,
        runId: run.id,
        agentType: run.agentType,
        provider: run.provider,
        attempt: jobAttempt,
        input,
      });

      // 读取用户语言偏好，用于后续 AgentCallContext 透传
      // 优先使用 job 中透传的 locale，其次从用户档案读取
      let locale = job.data.locale;
      if (!locale) {
        const user = await this.prisma.user.findUnique({
          where: { id: run.userId },
          select: { locale: true },
        });
        locale = user?.locale ?? 'zh-CN';
      }

      const output = await this.dispatch(run.agentType, input, {
        orgId: run.organizationId,
        workspaceId: run.workspaceId ?? '',
        userId: run.userId,
        agentRunId: run.id,
        requestId: `${run.id}:attempt:${jobAttempt}:generation:${Math.max(
          0,
          Number(job.data.regenerationAttempt ?? 0),
        )}`,
        locale,
        traceId,
        traceparent,
      });

      const outputObj = output as Record<string, unknown> | null;

      const latest = await this.tenantDatabase.run(organizationId, (tx) =>
        tx.agentRun.findFirst({
          where: { id: run.id, organizationId },
          select: { lifecycleStatus: true, attempt: true },
        }),
      );
      if (
        !latest ||
        this.asPositiveInt(latest.attempt, jobAttempt) !== jobAttempt ||
        String(latest.lifecycleStatus) === 'CANCELLED'
      ) {
        this.logger.warn(
          `Discarding provider output for cancelled or stale agent-run ${run.id} attempt ${jobAttempt}`,
        );
        return { status: 'skipped', agentRunId, reason: 'cancelled_or_stale' };
      }
      lifecycleStatus = latest.lifecycleStatus
        ? (latest.lifecycleStatus as AgentLifecycleStatus)
        : lifecycleStatus;
      if (lifecycleStatus === AgentLifecycleStatus.WAITING_TOOL) {
        lifecycleStatus = await this.applyLifecycleEvent(
          run.id,
          organizationId,
          jobAttempt,
          lifecycleStatus,
          AgentLifecycleEvent.TOOL_RESULT_RECEIVED,
          { provider: run.provider },
        );
      }
      const finishedAt = new Date();
      await this.completeRouterSelection({
        organizationId,
        runId: run.id,
        agentType: run.agentType,
        provider: run.provider,
        attempt: jobAttempt,
        input,
        output: outputObj,
        latencyMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
      });
      const completed = await this.tenantDatabase.run(organizationId, (tx) =>
        tx.agentRun.updateMany({
          where: {
            id: run.id,
            organizationId,
            attempt: jobAttempt,
            status: 'RUNNING',
            lifecycleStatus: 'EXECUTING',
          },
          data: {
            output: outputObj as object,
            errorCode: null,
            errorMessage: null,
          },
        }),
      );
      if (completed.count !== 1) {
        this.logger.warn(
          `Discarding stale completion for agent-run ${run.id} attempt ${jobAttempt}`,
        );
        return { status: 'skipped', agentRunId, reason: 'stale_completion' };
      }
      lifecycleStatus = await this.applyLifecycleEvent(
        run.id,
        organizationId,
        jobAttempt,
        lifecycleStatus,
        AgentLifecycleEvent.EXECUTION_FINISHED,
      );
      lifecycleStatus = await this.applyLifecycleEvent(
        run.id,
        organizationId,
        jobAttempt,
        lifecycleStatus,
        AgentLifecycleEvent.VERIFICATION_PASSED,
      );
      await job.updateProgress(100);

      // ── Consistency scoring integration ──────
      try {
        await this.handleConsistencyScoring(
          { ...run, attempt: jobAttempt },
          outputObj,
        );
      } catch (reviewError) {
        // The run itself completed. A review notification failure must not rerun
        // a successful provider call and create duplicate external effects.
        this.logger.error('Failed to create agent-run review task', {
          agentRunId: run.id,
          error:
            reviewError instanceof Error
              ? reviewError.message
              : String(reviewError),
        });
      }
      await this.recordWorkMemory(run, input, outputObj, {
        status: 'COMPLETED',
        startedAt,
        finishedAt,
      });
      // ──────────────────────────────────────────

      this.agentRunsCounter.inc({
        agent_type: run.agentType,
        status: 'completed',
      });

      return { status: 'completed', agentRunId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      let queueFailure = this.toQueueFailure(error);
      if (
        lifecycleStatus === AgentLifecycleStatus.VERIFYING &&
        !(queueFailure instanceof UnrecoverableError)
      ) {
        queueFailure = new UnrecoverableError(message);
      }
      const retryable = !(queueFailure instanceof UnrecoverableError);
      const errorCode = retryable ? 'AGENT_RETRYING' : this.failureCode(error);
      const lifecycleEvent = retryable
        ? AgentLifecycleEvent.RETRYABLE_ERROR
        : AgentLifecycleEvent.NON_RETRYABLE_ERROR;
      try {
        lifecycleStatus = await this.applyLifecycleEvent(
          run.id,
          organizationId,
          jobAttempt,
          lifecycleStatus,
          lifecycleEvent,
          { errorCode, errorMessage: message },
        );
      } catch (lifecycleError) {
        this.logger.error('Failed to persist agent lifecycle failure', {
          agentRunId: run.id,
          lifecycleStatus,
          lifecycleEvent,
          error:
            lifecycleError instanceof Error
              ? lifecycleError.message
              : String(lifecycleError),
        });
      }
      await this.tenantDatabase.run(organizationId, (tx) =>
        tx.agentRun.updateMany({
          where: {
            id: run.id,
            organizationId,
            attempt: jobAttempt,
            status: { in: ['RUNNING', 'RETRYING', 'FAILED'] },
          },
          data: {
            status: retryable ? 'RETRYING' : 'FAILED',
            errorCode,
            errorMessage: message,
          },
        }),
      );
      throw queueFailure;
    } finally {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (this.lease && leaseOwner) {
        try {
          await this.lease.release({
            organizationId,
            runId: run.id,
            ownerId: leaseOwner,
          });
        } catch (error) {
          this.logger.error('Failed to release AgentRun worker lease', {
            agentRunId: run.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  private agentRunLeaseTtlMs(): number {
    const value = Number(this.configService.get('AGENT_RUN_LEASE_TTL_MS'));
    return Number.isFinite(value) && value >= 15_000 ? value : 60_000;
  }

  private startLeaseHeartbeat(
    organizationId: string,
    runId: string,
    ownerId: string,
    ttlMs: number,
  ): NodeJS.Timeout {
    const intervalMs = Math.max(5_000, Math.floor(ttlMs / 3));
    const timer = setInterval(() => {
      void this.lease
        ?.heartbeat({ organizationId, runId, ownerId, ttlMs })
        .then((renewed) => {
          if (!renewed) {
            this.logger.error(
              `AgentRun ${runId} lost its worker lease; late output will be discarded`,
            );
          }
        })
        .catch((error) => {
          this.logger.error('AgentRun lease heartbeat failed', {
            agentRunId: runId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
    }, intervalMs);
    timer.unref?.();
    return timer;
  }

  private async beginLifecycleAttempt(
    runId: string,
    organizationId: string,
    attempt: number,
    status: AgentLifecycleStatus,
  ): Promise<AgentLifecycleStatus> {
    if (status === AgentLifecycleStatus.CREATED) {
      status = await this.applyLifecycleEvent(
        runId,
        organizationId,
        attempt,
        status,
        AgentLifecycleEvent.PLAN_STARTED,
      );
    }
    if (status === AgentLifecycleStatus.PLANNING) {
      return this.applyLifecycleEvent(
        runId,
        organizationId,
        attempt,
        status,
        AgentLifecycleEvent.TOOL_CALL_REQUESTED,
      );
    }
    if (status === AgentLifecycleStatus.RETRY_SCHEDULED) {
      return this.applyLifecycleEvent(
        runId,
        organizationId,
        attempt,
        status,
        AgentLifecycleEvent.RETRY_DISPATCHED,
      );
    }
    if (
      status === AgentLifecycleStatus.WAITING_TOOL ||
      status === AgentLifecycleStatus.EXECUTING
    ) {
      return status;
    }
    throw new UnrecoverableError(
      `Agent run cannot be dispatched from lifecycle status ${status}`,
    );
  }

  private async applyLifecycleEvent(
    runId: string,
    organizationId: string,
    attempt: number,
    fromStatus: AgentLifecycleStatus,
    event: AgentLifecycleEvent,
    payload: Record<string, unknown> = {},
  ): Promise<AgentLifecycleStatus> {
    const toStatus = resolveAgentTransition(fromStatus, event);
    await this.lifecycle.applyEvent({
      organizationId,
      runId,
      event,
      eventKey: `agent-run:${runId}:attempt:${attempt}:${event}`,
      attempt,
      payload,
      currentStep: event,
    });
    return toStatus;
  }

  private asLifecycleStatus(value: unknown): AgentLifecycleStatus {
    return Object.values(AgentLifecycleStatus).includes(
      value as AgentLifecycleStatus,
    )
      ? (value as AgentLifecycleStatus)
      : AgentLifecycleStatus.CREATED;
  }

  private async recordWorkMemory(
    run: {
      id: string;
      organizationId: string;
      workspaceId: string | null;
      userId: string;
      agentType: string;
      attempt: number;
    },
    input: Record<string, unknown>,
    output: Record<string, unknown> | null,
    result: {
      status: 'COMPLETED' | 'FAILED';
      startedAt: Date;
      finishedAt: Date;
      errorMessage?: string;
    },
  ): Promise<void> {
    try {
      await this.agentMemory.recordWorkMemory({
        organizationId: run.organizationId,
        workspaceId: run.workspaceId,
        agentRunId: run.id,
        productId: asOptionalString(input.productId),
        productName:
          asOptionalString(input.productName) ??
          asOptionalString(input.name) ??
          asOptionalString(input.query),
        taskType: run.agentType,
        status: result.status,
        score:
          output && typeof output.consistencyScore === 'number'
            ? output.consistencyScore
            : null,
        durationSeconds:
          (result.finishedAt.getTime() - result.startedAt.getTime()) / 1000,
        result:
          output ??
          (result.errorMessage ? { error: result.errorMessage } : null),
        metadata: {
          source: 'agent-run-worker',
          userId: run.userId,
        },
      });
    } catch (memoryError) {
      this.logger.error('Failed to record agent work memory', {
        agentRunId: run.id,
        error:
          memoryError instanceof Error
            ? memoryError.message
            : String(memoryError),
      });
    }
  }

  /**
   * Evaluate consistency score from agent output and create a review task.
   *
   * Only runs when the agent output carries a real `consistencyScore`
   * (currently produced by the image generation pipeline). Runs without a
   * score are NOT sent to review — fabricating scores would fill the queue
   * with noise and trigger pointless regenerations.
   *
   * - Scores >= threshold → auto-approved.
   * - Scores < threshold → creates a PENDING review task + notification.
   * - Scores < 30 → also enqueues an auto-regeneration job (max 3 total).
   */
  private async handleConsistencyScoring(
    run: {
      id: string;
      organizationId: string;
      workspaceId?: string | null;
      userId: string;
      agentType: string;
      attempt: number;
      provider?: string;
      input?: unknown;
      traceId?: string | null;
    },
    output: Record<string, unknown> | null,
  ): Promise<void> {
    if (!output || typeof output.consistencyScore !== 'number') {
      return;
    }
    const score: number = output.consistencyScore;
    const threshold = this.reviewThreshold();

    // Create the review task
    const reviewResult = await this.reviewService.createFromAgentRun(
      run.organizationId,
      {
        entityType: 'AGENT_RUN',
        entityId: run.id,
        score,
        threshold,
      },
    );

    this.agentRunQualityCounter.inc({
      agent_type: run.agentType,
      result: score >= threshold ? 'pass' : 'fail',
    });

    this.logger.log(
      `Review task ${reviewResult.id} created for agent-run ${run.id}: ` +
        `score=${score}, status=${reviewResult.status}, autoApproved=${reviewResult.autoApproved}`,
    );

    // If score is very low (< 30) and we haven't regenerated too many times,
    // enqueue an auto-regeneration job
    if (score < 30) {
      // Cumulative regenerations across ALL review tasks for this run.
      // (Each retry creates a fresh task, so checking only the latest task's
      // counter would allow an infinite regeneration loop.)
      const regenSum = await this.tenantDatabase.run(run.organizationId, (tx) =>
        tx.reviewTask.aggregate({
          where: {
            organizationId: run.organizationId,
            entityType: 'AGENT_RUN',
            entityId: run.id,
          },
          _sum: { autoRegenerations: true },
        }),
      );

      const currentRegens = regenSum._sum.autoRegenerations ?? 0;
      if (currentRegens < 3) {
        this.logger.warn(
          `Low consistency score (${score}) for agent-run ${run.id}. ` +
            `Enqueuing auto-regeneration (attempt ${currentRegens + 1}/3).`,
        );

        const regenerationAttempt = currentRegens + 1;
        const clientRequestId = `quality-regeneration:${run.id}:${regenerationAttempt}`;
        const scheduled = await this.tenantDatabase.run(
          run.organizationId,
          async (tx) => {
            const existing = await tx.agentRun.findUnique({
              where: {
                organizationId_clientRequestId: {
                  organizationId: run.organizationId,
                  clientRequestId,
                },
              },
              select: { id: true },
            });
            if (existing) return false;

            const parentInput =
              run.input &&
              typeof run.input === 'object' &&
              !Array.isArray(run.input)
                ? (run.input as Record<string, unknown>)
                : {};
            const regeneratedTraceId = ensureTraceId(run.traceId ?? run.id);
            const regeneratedTraceparent =
              traceparentForTraceId(regeneratedTraceId);
            const regenerated = await tx.agentRun.create({
              data: {
                organizationId: run.organizationId,
                workspaceId: run.workspaceId ?? null,
                userId: run.userId,
                agentType: run.agentType as AgentType,
                provider: run.provider ?? 'openai',
                clientRequestId,
                attempt: 1,
                status: 'PENDING',
                lifecycleStatus: 'CREATED',
                version: 0,
                traceId: regeneratedTraceId,
                input: {
                  ...parentInput,
                  regenerationOfRunId: run.id,
                  regenerationAttempt,
                },
                progress: {
                  status: 'pending',
                  stage: 'quality_regeneration_queued',
                  consistencyScore: score,
                  regenerationAttempt,
                  parentRunId: run.id,
                  traceId: regeneratedTraceId,
                  traceparent: regeneratedTraceparent,
                },
              },
            });

            await tx.agentTransition.create({
              data: {
                organizationId: run.organizationId,
                runId: regenerated.id,
                fromStatus: null,
                toStatus: 'CREATED',
                eventType: AgentLifecycleEvent.RUN_CREATED,
                eventKey: `agent-run:${regenerated.id}:created`,
                payload: {
                  parentRunId: run.id,
                  reason: 'quality_regeneration',
                  regenerationAttempt,
                },
                attempt: 1,
              },
            });

            await tx.reviewTask.update({
              where: { id: reviewResult.id },
              data: { autoRegenerations: { increment: 1 } },
            });
            await tx.outboxEvent.create({
              data: {
                dedupeKey: `agent-run:${regenerated.id}:attempt:1`,
                organizationId: run.organizationId,
                aggregateType: 'AgentRun',
                aggregateId: regenerated.id,
                eventType: 'agent-run.enqueue',
                payload: {
                  agentRunId: regenerated.id,
                  attempt: 1,
                  regenerationAttempt,
                  parentRunId: run.id,
                },
              },
            });
            return true;
          },
        );
        if (!scheduled) {
          this.logger.warn(
            `Auto-regeneration was already scheduled for agent-run ${run.id} attempt ${run.attempt}`,
          );
        }
      } else {
        this.logger.warn(
          `Max auto-regenerations (3) reached for agent-run ${run.id}. Flagging for urgent review.`,
        );
      }
    }
  }

  private async dispatch(
    agentType: AgentType,
    input: Record<string, unknown>,
    ctx: {
      orgId: string;
      workspaceId: string;
      userId: string;
      agentRunId: string;
      requestId?: string;
      locale?: string;
      traceId: string;
      traceparent: string;
    },
  ): Promise<unknown> {
    // 身份贯通（阶段4）：随任务透传，供智能体做租户隔离与事件回调
    const context: AgentCallContext = {
      orgId: ctx.orgId,
      userId: ctx.userId,
      workspaceId: ctx.workspaceId || undefined,
      agentRunId: ctx.agentRunId,
      ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
      locale: ctx.locale,
      traceId: ctx.traceId,
      traceparent: ctx.traceparent,
    };
    switch (agentType) {
      case 'IMAGE_CREATIVE':
        return this.agentProvider.runImageGeneration(
          {
            productName: asString(input.productName),
            imageBase64: asOptionalString(input.imageBase64),
            imageUrl: asOptionalString(input.imageUrl),
            sceneCount: Number(input.sceneCount ?? 5),
            platforms: Array.isArray(input.platforms)
              ? input.platforms.map((p) => asString(p))
              : undefined,
            message: asOptionalString(input.message),
          },
          context,
        );
      case 'PRODUCT_RESEARCHER':
        return this.agentProvider.runProductResearch(
          {
            productName: asString(input.productName),
            marketplace: asString(input.marketplace, 'amazon.com'),
            locale: asOptionalString(input.locale),
          },
          context,
        );
      case 'LISTING_OPTIMIZER':
      case 'CONTENT_WRITER':
        return this.agentProvider.runListingGeneration(
          {
            productName: asString(input.productName),
            description: asOptionalString(input.description),
            keywords: Array.isArray(input.keywords)
              ? input.keywords.map((k) => asString(k))
              : [],
            platform: asString(input.platform, 'amazon'),
            tone: asOptionalString(input.tone),
          },
          context,
        );
      case 'KEYWORD_EXPLORER':
        return this.agentProvider.runKeywordAnalysis(
          {
            seedKeywords: Array.isArray(input.seedKeywords)
              ? input.seedKeywords.map((k) => asString(k))
              : [],
            marketplace: asString(input.marketplace, 'amazon.com'),
            locale: asOptionalString(input.locale),
          },
          context,
        );
      case 'ADVERTISING_STRATEGIST':
      case 'PROFIT_ANALYST':
      case 'CUSTOMER_INSIGHT':
        return this.agentProvider.runTrendAnalysis(
          {
            category: asString(input.category, 'general'),
            marketplace: asString(input.marketplace, 'amazon.com'),
            timeframe: asOptionalString(input.timeframe),
          },
          context,
        );
      case 'PLANNER':
        return this.agentProvider.runPlanAndExecute(
          {
            goal: asString(input.goal),
            context:
              input.context &&
              typeof input.context === 'object' &&
              !Array.isArray(input.context)
                ? (input.context as Record<string, unknown>)
                : {},
          },
          context,
        );
      case 'GENERAL_ASSISTANT':
      default: {
        const reply = await this.agentProvider.runAssistant(
          {
            assistantId: asString(input.assistantId, 'general'),
            threadId: asOptionalString(input.threadId),
            prompt: asString(input.prompt),
            workspaceId: ctx.workspaceId,
            orgId: ctx.orgId,
            userId: ctx.userId,
          },
          context,
        );
        return { reply };
      }
    }
  }

  private asPositiveInt(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private async recordRouterSelection(input: {
    organizationId: string;
    runId: string;
    agentType: AgentType;
    provider: string;
    attempt: number;
    input: Record<string, unknown>;
  }): Promise<void> {
    const decisionKey = `agent-run:${input.runId}:attempt:${input.attempt}:route`;
    const promptVersion = asOptionalString(input.input.promptVersion);
    await this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.routerDecisionLog.upsert({
        where: {
          organizationId_decisionKey: {
            organizationId: input.organizationId,
            decisionKey,
          },
        },
        create: {
          organizationId: input.organizationId,
          runId: input.runId,
          decisionKey,
          agentType: input.agentType,
          selectedModel: `provider:${input.provider}`,
          selectedPromptVersion: promptVersion,
          reason: {
            policy: 'configured_agent_provider',
            identitySource: 'provider_adapter',
            actualModelReported: false,
            attempt: input.attempt,
          },
        },
        update: {
          selectedPromptVersion: promptVersion,
          reason: {
            policy: 'configured_agent_provider',
            identitySource: 'provider_adapter',
            actualModelReported: false,
            attempt: input.attempt,
          },
        },
      }),
    );
  }

  private async completeRouterSelection(input: {
    organizationId: string;
    runId: string;
    agentType: AgentType;
    provider: string;
    attempt: number;
    input: Record<string, unknown>;
    output: Record<string, unknown> | null;
    latencyMs: number;
  }): Promise<void> {
    const runtime = this.jsonRecord(
      input.output?.runtime ?? input.output?._runtime,
    );
    const reportedModel = asOptionalString(
      runtime.model ?? runtime.modelName ?? runtime.activeModel,
    );
    const qualityCandidate = Number(
      input.output?.consistencyScore ?? input.output?.qualityScore,
    );
    const qualityScore =
      Number.isFinite(qualityCandidate) &&
      qualityCandidate >= 0 &&
      qualityCandidate <= 100
        ? qualityCandidate
        : undefined;
    const decisionKey = `agent-run:${input.runId}:attempt:${input.attempt}:route`;
    await this.tenantDatabase.run(input.organizationId, (tx) =>
      tx.routerDecisionLog.updateMany({
        where: { organizationId: input.organizationId, decisionKey },
        data: {
          selectedModel: reportedModel ?? `provider:${input.provider}`,
          selectedPromptVersion: asOptionalString(input.input.promptVersion),
          reason: {
            policy: 'configured_agent_provider',
            identitySource: reportedModel
              ? 'agent_runtime'
              : 'provider_adapter',
            actualModelReported: Boolean(reportedModel),
            attempt: input.attempt,
          },
          latencyMs: input.latencyMs,
          ...(qualityScore !== undefined ? { qualityScore } : {}),
        },
      }),
    );
  }

  private jsonRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job): void {
    this.logger.log(`Agent-run job ${job.id ?? 'unknown'} completed`);
  }

  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<AgentRunJobData> | undefined,
    error: Error,
  ): Promise<void> {
    this.logger.error(`Agent-run job ${job?.id ?? 'unknown'} failed`, {
      error: error.message,
    });
    if (!job) {
      return;
    }

    const maxAttempts = job.opts.attempts ?? 1;
    if (
      !(error instanceof UnrecoverableError) &&
      job.attemptsMade < maxAttempts
    ) {
      return;
    }

    const organizationId = job.data.organizationId;
    if (!organizationId) return;
    const run = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.agentRun.findFirst({
        where: { id: job.data.agentRunId, organizationId },
        select: {
          id: true,
          agentType: true,
          organizationId: true,
          workspaceId: true,
          userId: true,
          input: true,
          attempt: true,
          status: true,
          lifecycleStatus: true,
        },
      }),
    );
    if (run) {
      const finishedAt = new Date();
      const runAttempt = this.asPositiveInt(run.attempt, 1);
      const jobAttempt = this.asPositiveInt(job.data.attempt, runAttempt);
      if (jobAttempt !== runAttempt) {
        this.logger.warn(
          `Ignored stale final failure for agent-run ${run.id} attempt ${jobAttempt}; current attempt is ${runAttempt}`,
        );
      } else {
        try {
          const lifecycleStatus = this.asLifecycleStatus(run.lifecycleStatus);
          if (
            lifecycleStatus !== AgentLifecycleStatus.FAILED &&
            lifecycleStatus !== AgentLifecycleStatus.CANCELLED &&
            lifecycleStatus !== AgentLifecycleStatus.COMPLETED
          ) {
            const terminalEvent =
              lifecycleStatus === AgentLifecycleStatus.CREATED
                ? AgentLifecycleEvent.FATAL_ERROR
                : AgentLifecycleEvent.NON_RETRYABLE_ERROR;
            await this.applyLifecycleEvent(
              run.id,
              organizationId,
              jobAttempt,
              lifecycleStatus,
              terminalEvent,
              {
                errorCode: this.failureCode(error),
                errorMessage: error.message,
              },
            );
          }
          const persisted = await this.tenantDatabase.run(
            organizationId,
            (tx) =>
              tx.agentRun.updateMany({
                where: {
                  id: run.id,
                  organizationId,
                  attempt: jobAttempt,
                  status: 'FAILED',
                },
                data: {
                  errorCode: this.failureCode(error),
                  errorMessage: error.message,
                  finishedAt,
                },
              }),
          );
          if (persisted.count === 1) {
            this.agentRunsCounter.inc({
              agent_type: run.agentType,
              status: 'failed',
            });
            await this.recordWorkMemory(
              run,
              (run.input ?? {}) as Record<string, unknown>,
              null,
              {
                status: 'FAILED',
                startedAt: finishedAt,
                finishedAt,
                errorMessage: error.message,
              },
            );
          } else {
            this.logger.warn(
              `Ignored stale final failure for agent-run ${run.id} attempt ${jobAttempt}; current attempt is ${runAttempt}`,
            );
          }
        } catch (persistenceError) {
          this.logger.error('Failed to persist final agent-run failure', {
            agentRunId: run.id,
            error:
              persistenceError instanceof Error
                ? persistenceError.message
                : String(persistenceError),
          });
        }
      }
    }

    try {
      const deadLetterData = {
        originalQueue: 'agent-runs',
        originalJobId: String(job.id ?? ''),
        originalData: job.data,
        failedReason: error.message,
        failedAttempts: job.attemptsMade,
        ...(run?.organizationId ? { organizationId: run.organizationId } : {}),
      };
      await this.deadLetterQueue.add('record', deadLetterData);
    } catch (deadLetterError) {
      this.logger.error('Failed to enqueue agent-run dead letter', {
        error:
          deadLetterError instanceof Error
            ? deadLetterError.message
            : String(deadLetterError),
      });
    }
  }
}
