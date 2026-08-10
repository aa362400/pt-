import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import { AgentRunLifecycleService } from './agent-run-lifecycle.service.js';
import {
  AgentLifecycleEvent,
  AgentLifecycleStatus,
  TERMINAL_AGENT_LIFECYCLE_STATUSES,
} from './agent-state-machine.js';

const DEFAULT_SCAN_INTERVAL_MS = 30_000;
const DEFAULT_ORPHAN_AFTER_MS = 5 * 60_000;

@Injectable()
export class AgentRunRecoveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentRunRecoveryService.name);
  private timer?: NodeJS.Timeout;
  private activeScan?: Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantDatabase: TenantDatabaseContextService,
    private readonly lifecycle: AgentRunLifecycleService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('NODE_ENV', 'development') === 'test') return;
    const intervalMs = this.positiveNumber(
      this.config.get('AGENT_RUN_RECOVERY_INTERVAL_MS'),
      DEFAULT_SCAN_INTERVAL_MS,
    );
    this.timer = setInterval(() => void this.startScan(), intervalMs);
    this.timer.unref?.();
    void this.startScan();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.activeScan;
  }

  startScan(now = new Date()): Promise<void> {
    if (this.activeScan) return this.activeScan;
    const scan = this.scan(now)
      .catch((error) => {
        this.logger.error(
          'AgentRun recovery scan failed',
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => {
        if (this.activeScan === scan) this.activeScan = undefined;
      });
    this.activeScan = scan;
    return scan;
  }

  async scan(now = new Date()): Promise<void> {
    const organizations = await this.prisma.organization.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    for (const organization of organizations) {
      await this.recoverOrganization(organization.id, now);
    }
  }

  async recoverOrganization(organizationId: string, now = new Date()) {
    const orphanAfterMs = this.positiveNumber(
      this.config.get('AGENT_RUN_ORPHAN_AFTER_MS'),
      DEFAULT_ORPHAN_AFTER_MS,
    );
    const staleBefore = new Date(now.getTime() - orphanAfterMs);
    const candidates = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.agentRun.findMany({
        where: {
          organizationId,
          status: 'RUNNING',
          OR: [
            { lease: { is: { leaseUntil: { lte: now } } } },
            { lease: { is: null }, startedAt: { lte: staleBefore } },
          ],
        },
        select: {
          id: true,
          attempt: true,
          lifecycleStatus: true,
          lease: { select: { ownerId: true, version: true } },
        },
        orderBy: { startedAt: 'asc' },
        take: 50,
      }),
    );

    let recovered = 0;
    for (const run of candidates) {
      const status = run.lifecycleStatus as AgentLifecycleStatus;
      if (TERMINAL_AGENT_LIFECYCLE_STATUSES.has(status)) {
        await this.deleteLease(organizationId, run.id);
        continue;
      }
      if (status === AgentLifecycleStatus.WAITING_APPROVAL) {
        await this.deleteLease(organizationId, run.id);
        continue;
      }
      if (status === AgentLifecycleStatus.VERIFYING) {
        await this.lifecycle.applyEvent({
          organizationId,
          runId: run.id,
          event: AgentLifecycleEvent.VERIFICATION_FAILED,
          eventKey: this.recoveryEventKey(run.id, run.attempt, 'VERIFYING'),
          attempt: run.attempt,
          payload: {
            errorCode: 'AGENT_LEASE_EXPIRED_DURING_VERIFICATION',
            errorMessage:
              'Worker stopped during verification; manual retry is required',
          },
        });
        await this.deleteLease(organizationId, run.id);
        continue;
      }

      await this.advanceToWaitingTool(
        organizationId,
        run.id,
        run.attempt,
        status,
      );
      const retryEventKey = this.recoveryEventKey(
        run.id,
        run.attempt,
        'RETRYABLE_ERROR',
      );
      await this.lifecycle.applyEvent({
        organizationId,
        runId: run.id,
        event: AgentLifecycleEvent.RETRYABLE_ERROR,
        eventKey: retryEventKey,
        attempt: run.attempt,
        payload: {
          errorCode: 'AGENT_LEASE_EXPIRED',
          errorMessage: 'Worker lease expired and the run was recovered',
          previousLeaseOwner: run.lease?.ownerId ?? null,
          previousLeaseVersion: run.lease?.version ?? null,
        },
      });

      const nextAttempt = run.attempt + 1;
      try {
        const advanced = await this.tenantDatabase.run(
          organizationId,
          async (tx) => {
            const updated = await tx.agentRun.updateMany({
              where: {
                id: run.id,
                organizationId,
                attempt: run.attempt,
                lifecycleStatus: 'RETRY_SCHEDULED',
              },
              data: {
                attempt: nextAttempt,
                status: 'RETRYING',
                errorCode: 'AGENT_RECOVERED',
                errorMessage: 'Recovered after worker lease expiration',
                progress: {
                  status: 'retrying',
                  stage: 'lease_recovered',
                  recoveredAt: now.toISOString(),
                  previousAttempt: run.attempt,
                },
              },
            });
            if (updated.count !== 1) return false;
            await tx.outboxEvent.create({
              data: {
                dedupeKey: `agent-run:${run.id}:attempt:${nextAttempt}`,
                organizationId,
                aggregateType: 'AgentRun',
                aggregateId: run.id,
                eventType: 'agent-run.enqueue',
                payload: { agentRunId: run.id, attempt: nextAttempt },
              },
            });
            await tx.agentRunLease.deleteMany({
              where: { runId: run.id, organizationId },
            });
            return true;
          },
        );
        if (advanced) recovered += 1;
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        ) {
          throw error;
        }
        await this.deleteLease(organizationId, run.id);
      }
    }

    if (recovered > 0) {
      this.logger.warn(
        `Recovered ${recovered} expired AgentRun lease(s) for ${organizationId}`,
      );
    }
    return { scanned: candidates.length, recovered };
  }

  private async advanceToWaitingTool(
    organizationId: string,
    runId: string,
    attempt: number,
    initialStatus: AgentLifecycleStatus,
  ) {
    let status = initialStatus;
    if (status === AgentLifecycleStatus.CREATED) {
      const result = await this.lifecycle.applyEvent({
        organizationId,
        runId,
        event: AgentLifecycleEvent.PLAN_STARTED,
        eventKey: this.recoveryEventKey(runId, attempt, 'PLAN_STARTED'),
        attempt,
        payload: { source: 'recovery' },
      });
      status = result.toStatus;
    }
    if (status === AgentLifecycleStatus.PLANNING) {
      const result = await this.lifecycle.applyEvent({
        organizationId,
        runId,
        event: AgentLifecycleEvent.TOOL_CALL_REQUESTED,
        eventKey: this.recoveryEventKey(runId, attempt, 'TOOL_CALL_REQUESTED'),
        attempt,
        payload: { source: 'recovery' },
      });
      status = result.toStatus;
    }
    if (
      status !== AgentLifecycleStatus.WAITING_TOOL &&
      status !== AgentLifecycleStatus.EXECUTING
    ) {
      throw new Error(
        `AgentRun ${runId} cannot be recovered from lifecycle status ${status}`,
      );
    }
  }

  private recoveryEventKey(runId: string, attempt: number, event: string) {
    return `agent-run:${runId}:attempt:${attempt}:recovery:${event}`;
  }

  private async deleteLease(organizationId: string, runId: string) {
    await this.tenantDatabase.run(organizationId, (tx) =>
      tx.agentRunLease.deleteMany({
        where: { runId, organizationId },
      }),
    );
  }

  private positiveNumber(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
