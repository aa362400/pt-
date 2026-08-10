import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  DeadLetterClassification,
  type DeadLetterJob,
  type Prisma,
} from '@prisma/client';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import { requireOrg } from '../../shared/tenancy/org-scope.js';
import { AgentRunsService } from '../agent-runs/agent-runs.service.js';
import { AutomationService } from '../automation/automation.service.js';
import type {
  ClassifyDeadLetterDto,
  ListDeadLettersQueryDto,
  ReplayDeadLetterDto,
  ResolveDeadLetterDto,
} from './dead-letter.dto.js';
import { DeadLetterTriageService } from './dead-letter-triage.service.js';

type TargetInspection = {
  exists: boolean;
  status: string | null;
  flowId?: string;
};

const REPLAY_CLAIM_TIMEOUT_MS = 10 * 60 * 1000;

@Injectable()
export class DeadLetterService {
  constructor(
    private readonly tenantDatabase: TenantDatabaseContextService,
    private readonly agentRuns: AgentRunsService,
    private readonly automation: AutomationService,
    private readonly triage: DeadLetterTriageService,
    private readonly audit: AuditService,
  ) {}

  async list(user: JwtPayload, query: ListDeadLettersQueryDto) {
    const organizationId = requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.DeadLetterJobWhereInput = {
      organizationId,
      ...(query.classification ? { classification: query.classification } : {}),
      ...(query.resolutionStatus
        ? { resolutionStatus: query.resolutionStatus }
        : {}),
    };
    const [items, total] = await this.tenantDatabase.run(organizationId, (tx) =>
      Promise.all([
        tx.deadLetterJob.findMany({
          where,
          orderBy: { failedAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.deadLetterJob.count({ where }),
      ]),
    );
    return { items, total, page, limit };
  }

  async triageOpen(user: JwtPayload) {
    const organizationId = requireOrg(user);
    const staleClaimsReleased = await this.releaseStaleReplayClaims(
      user,
      organizationId,
    );
    const items = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.deadLetterJob.findMany({
        where: {
          organizationId,
          resolutionStatus: 'OPEN',
          classification: 'UNCLASSIFIED',
        },
        orderBy: { failedAt: 'asc' },
        take: 500,
      }),
    );
    const summary: Record<string, number> = {
      UNCLASSIFIED: 0,
      RETRYABLE: 0,
      PERMANENT: 0,
      DATA_MISSING: 0,
      PROVIDER_FAILURE: 0,
    };
    const classifiedAt = new Date();

    for (const item of items) {
      const target = await this.inspectTarget(
        organizationId,
        item.queueName,
        item.data,
      );
      const result = this.triage.classify({
        queueName: item.queueName,
        data: item.data,
        failedReason: item.failedReason,
        targetExists: target.exists,
        targetStatus: target.status,
      });
      await this.tenantDatabase.run(organizationId, (tx) =>
        tx.deadLetterJob.update({
          where: { id: item.id },
          data: {
            classification: result.classification,
            classificationReason: result.classificationReason,
            replayEligible: result.replayEligible,
            classifiedAt,
            classifiedBy: user.sub,
          },
        }),
      );
      summary[result.classification] += 1;
    }

    await this.audit.appendStrict({
      organizationId,
      actorId: user.sub,
      action: 'dead-letter.triage',
      resourceType: 'DeadLetterJob',
      resourceId: organizationId,
      after: { scanned: items.length, summary, staleClaimsReleased },
    });
    return { scanned: items.length, summary, staleClaimsReleased };
  }

  async classify(user: JwtPayload, id: string, dto: ClassifyDeadLetterDto) {
    const organizationId = requireOrg(user);
    if (
      dto.replayEligible &&
      dto.classification !== DeadLetterClassification.RETRYABLE
    ) {
      throw new BadRequestException(
        'Only RETRYABLE dead letters may be marked replay eligible',
      );
    }
    const current = await this.findOpen(organizationId, id);
    const updated = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.deadLetterJob.update({
        where: { id },
        data: {
          classification: dto.classification,
          classificationReason: dto.reason.trim(),
          replayEligible: dto.replayEligible,
          classifiedAt: new Date(),
          classifiedBy: user.sub,
        },
      }),
    );
    await this.audit.appendStrict({
      organizationId,
      actorId: user.sub,
      action: 'dead-letter.classify',
      resourceType: 'DeadLetterJob',
      resourceId: id,
      before: {
        classification: current.classification,
        replayEligible: current.replayEligible,
      },
      after: {
        classification: updated.classification,
        replayEligible: updated.replayEligible,
        reason: updated.classificationReason,
      },
    });
    return updated;
  }

  async replay(user: JwtPayload, id: string, dto: ReplayDeadLetterDto) {
    const organizationId = requireOrg(user);
    const item = await this.findOpen(organizationId, id);
    if (item.classification !== 'RETRYABLE' || !item.replayEligible) {
      throw new BadRequestException(
        'Dead letter is not explicitly classified as replayable',
      );
    }

    const claimedAt = new Date();
    const claim = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.deadLetterJob.updateMany({
        where: {
          id,
          organizationId,
          resolutionStatus: 'OPEN',
          classification: 'RETRYABLE',
          replayEligible: true,
        },
        data: {
          resolutionStatus: 'REPLAYING',
          replayEligible: false,
          replayClaimedAt: claimedAt,
          replayClaimedBy: user.sub,
          replayReason: dto.reason.trim(),
          replayIdempotencyKey: dto.idempotencyKey.trim(),
          inspectedAt: claimedAt,
        },
      }),
    );
    if (claim.count !== 1) {
      throw new ConflictException(
        'Dead letter replay has already been claimed or its state changed',
      );
    }

    try {
      return await this.replayClaimed(user, id, item, dto);
    } catch (error) {
      const failedAt = new Date();
      const failureMessage = this.errorMessage(error);
      await Promise.allSettled([
        this.tenantDatabase.run(organizationId, (tx) =>
          tx.deadLetterJob.updateMany({
            where: {
              id,
              organizationId,
              resolutionStatus: 'REPLAYING',
              replayClaimedBy: user.sub,
            },
            data: {
              resolutionStatus: 'OPEN',
              replayEligible: false,
              replayClaimedAt: null,
              replayClaimedBy: null,
              inspectedAt: failedAt,
              notes: this.appendNote(
                item.notes,
                `english_textfailed（${failedAt.toISOString()}）：${failureMessage}。english_text，texthumanenglish_text。`,
              ),
            },
          }),
        ),
        this.audit.appendStrict({
          organizationId,
          actorId: user.sub,
          action: 'dead-letter.replay-failed',
          resourceType: 'DeadLetterJob',
          resourceId: id,
          after: {
            queueName: item.queueName,
            failure: failureMessage,
            replayReason: dto.reason.trim(),
            replayIdempotencyKey: dto.idempotencyKey.trim(),
            replayEligible: false,
          },
        }),
      ]);
      throw error;
    }
  }

  private async replayClaimed(
    user: JwtPayload,
    id: string,
    item: DeadLetterJob,
    dto: ReplayDeadLetterDto,
  ) {
    const organizationId = requireOrg(user);

    await this.audit.appendStrict({
      organizationId,
      actorId: user.sub,
      action: 'dead-letter.replay-requested',
      resourceType: 'DeadLetterJob',
      resourceId: id,
      after: {
        queueName: item.queueName,
        jobId: item.jobId,
        replayReason: dto.reason.trim(),
        replayIdempotencyKey: dto.idempotencyKey.trim(),
      },
    });

    const data = this.asRecord(item.data);
    let replayRunId: string;
    if (item.queueName === 'agent-runs') {
      const agentRunId = this.requiredString(data.agentRunId, 'agentRunId');
      const replay = await this.agentRuns.retry(user, agentRunId, {
        requestId: this.replayRequestId(item.id, dto.idempotencyKey),
      });
      replayRunId = replay.id;
    } else if (item.queueName === 'automation-runs') {
      const automationRunId = this.requiredString(
        data.automationRunId,
        'automationRunId',
      );
      const source = await this.tenantDatabase.run(organizationId, (tx) =>
        tx.automationRun.findFirst({
          where: {
            id: automationRunId,
            flow: { organizationId },
          },
          select: { id: true, flowId: true, status: true },
        }),
      );
      if (!source) {
        throw new NotFoundException(
          'Automation run for dead letter no longer exists',
        );
      }
      if (source.status !== 'FAILED') {
        throw new BadRequestException(
          `Automation run status ${source.status} is not recoverable`,
        );
      }
      const replay = await this.automation.recoverFromFailure({
        organizationId,
        actorId: user.sub,
        flowId: source.flowId,
        failedRunId: source.id,
        reason: dto.reason,
        idempotencyKey: dto.idempotencyKey,
        source: 'dead_letter_triage',
      });
      if (!replay?.automationRunId) {
        throw new InternalServerErrorException(
          'Automation recovery did not return a run id',
        );
      }
      replayRunId = replay.automationRunId;
    } else {
      throw new BadRequestException(
        `Dead letter queue "${item.queueName}" is not replayable`,
      );
    }

    const resolvedAt = new Date();
    const finalized = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.deadLetterJob.updateMany({
        where: {
          id,
          organizationId,
          resolutionStatus: 'REPLAYING',
          replayClaimedBy: user.sub,
        },
        data: {
          resolutionStatus: 'REPLAYED',
          replayRunId,
          replayEligible: false,
          replayClaimedAt: null,
          replayClaimedBy: null,
          resolvedAt,
          resolvedBy: user.sub,
          inspectedAt: resolvedAt,
          notes: this.appendNote(
            item.notes,
            `english_texttask ${replayRunId} english_text（${resolvedAt.toISOString()}）。textfailedenglish_text。`,
          ),
        },
      }),
    );
    if (finalized.count !== 1) {
      throw new InternalServerErrorException(
        'Dead letter replay claim could not be finalized',
      );
    }
    await this.audit.appendStrict({
      organizationId,
      actorId: user.sub,
      action: 'dead-letter.replayed',
      resourceType: 'DeadLetterJob',
      resourceId: id,
      after: {
        replayRunId,
        queueName: item.queueName,
        replayReason: dto.reason.trim(),
        replayIdempotencyKey: dto.idempotencyKey.trim(),
      },
    });
    return { replayed: true, id, replayRunId, queueName: item.queueName };
  }

  async resolve(user: JwtPayload, id: string, dto: ResolveDeadLetterDto) {
    const organizationId = requireOrg(user);
    const item = await this.findOpen(organizationId, id);
    if (item.classification === 'UNCLASSIFIED') {
      throw new BadRequestException(
        'Classify the dead letter before resolving it',
      );
    }
    if (item.classification === 'RETRYABLE' && item.replayEligible) {
      throw new BadRequestException(
        'Replayable dead letters must be retried or reclassified before resolution',
      );
    }
    const resolvedAt = new Date();
    const updated = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.deadLetterJob.update({
        where: { id },
        data: {
          resolutionStatus: 'RESOLVED',
          replayEligible: false,
          resolvedAt,
          resolvedBy: user.sub,
          inspectedAt: resolvedAt,
          notes: this.appendNote(item.notes, dto.note.trim()),
        },
      }),
    );
    await this.audit.appendStrict({
      organizationId,
      actorId: user.sub,
      action: 'dead-letter.resolved',
      resourceType: 'DeadLetterJob',
      resourceId: id,
      after: {
        classification: item.classification,
        note: dto.note.trim(),
        sourceRunStatusUnchanged: true,
      },
    });
    return updated;
  }

  private async findOpen(organizationId: string, id: string) {
    const item = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.deadLetterJob.findFirst({
        where: { id, organizationId, resolutionStatus: 'OPEN' },
      }),
    );
    if (!item) throw new NotFoundException('Open dead letter job not found');
    return item;
  }

  private async releaseStaleReplayClaims(
    user: JwtPayload,
    organizationId: string,
  ): Promise<number> {
    const staleBefore = new Date(Date.now() - REPLAY_CLAIM_TIMEOUT_MS);
    const claims = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.deadLetterJob.findMany({
        where: {
          organizationId,
          resolutionStatus: 'REPLAYING',
          replayClaimedAt: { lt: staleBefore },
        },
        orderBy: { replayClaimedAt: 'asc' },
        take: 100,
      }),
    );
    let released = 0;

    for (const claim of claims) {
      if (!claim.replayClaimedAt) continue;
      const inspectedAt = new Date();
      const result = await this.tenantDatabase.run(organizationId, (tx) =>
        tx.deadLetterJob.updateMany({
          where: {
            id: claim.id,
            organizationId,
            resolutionStatus: 'REPLAYING',
            replayClaimedAt: claim.replayClaimedAt,
          },
          data: {
            resolutionStatus: 'OPEN',
            replayEligible: false,
            replayClaimedAt: null,
            replayClaimedBy: null,
            inspectedAt,
            notes: this.appendNote(
              claim.notes,
              `english_text（${inspectedAt.toISOString()}）。english_text，english_textyesnotextgenerationtexttask。`,
            ),
          },
        }),
      );
      if (result.count !== 1) continue;
      released += 1;
      await this.audit.appendStrict({
        organizationId,
        actorId: user.sub,
        action: 'dead-letter.replay-claim-expired',
        resourceType: 'DeadLetterJob',
        resourceId: claim.id,
        before: {
          resolutionStatus: 'REPLAYING',
          replayClaimedAt: claim.replayClaimedAt,
          replayClaimedBy: claim.replayClaimedBy,
        },
        after: {
          resolutionStatus: 'OPEN',
          replayEligible: false,
          requiresManualInspection: true,
        },
      });
    }

    return released;
  }

  private async inspectTarget(
    organizationId: string,
    queueName: string,
    payload: unknown,
  ): Promise<TargetInspection> {
    const data = this.asRecord(payload);
    if (queueName === 'agent-runs') {
      const id = this.optionalString(data.agentRunId);
      if (!id) return { exists: false, status: null };
      const run = await this.tenantDatabase.run(organizationId, (tx) =>
        tx.agentRun.findFirst({
          where: { id, organizationId },
          select: { lifecycleStatus: true, status: true },
        }),
      );
      return {
        exists: Boolean(run),
        status: run?.lifecycleStatus ?? run?.status ?? null,
      };
    }
    if (queueName === 'automation-runs') {
      const id = this.optionalString(data.automationRunId);
      if (!id) return { exists: false, status: null };
      const run = await this.tenantDatabase.run(organizationId, (tx) =>
        tx.automationRun.findFirst({
          where: { id, flow: { organizationId } },
          select: { status: true, flowId: true },
        }),
      );
      return {
        exists: Boolean(run),
        status: run?.status ?? null,
        flowId: run?.flowId,
      };
    }
    return { exists: false, status: null };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private requiredString(value: unknown, field: string): string {
    const normalized = this.optionalString(value);
    if (!normalized) {
      throw new BadRequestException(`Dead letter payload is missing ${field}`);
    }
    return normalized;
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  private replayRequestId(
    deadLetterId: string,
    idempotencyKey: string,
  ): string {
    const digest = createHash('sha256')
      .update(idempotencyKey.trim())
      .digest('hex')
      .slice(0, 32);
    return `dead-letter:${deadLetterId}:${digest}`;
  }

  private appendNote(current: string | null, next: string): string {
    return current ? `${current}\n${next}` : next;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
