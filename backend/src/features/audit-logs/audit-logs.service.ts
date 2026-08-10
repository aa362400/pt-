import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import { AuditArchiveService } from '../../shared/audit/audit-archive.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { requireOrg } from '../../shared/tenancy/org-scope.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import type {
  CreateAuditLogDto,
  IncidentTimelineQueryDto,
  ListAuditLogsQueryDto,
} from './audit-logs.dto.js';

export interface IncidentTimelineEvent {
  id: string;
  source: 'AGENT' | 'AUTOMATION' | 'OZON_SUBMISSION' | 'AUDIT';
  title: string;
  detail: string;
  status: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  occurredAt: string;
  correlation: Record<string, string>;
}

@Injectable()
export class AuditLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly archives: AuditArchiveService,
    private readonly tenantDatabase: TenantDatabaseContextService,
  ) {}

  async create(user: JwtPayload, dto: CreateAuditLogDto) {
    const orgId = requireOrg(user);
    return this.serialize(
      await this.audit.appendStrict({
        organizationId: orgId,
        actorId: user.sub,
        action: dto.action,
        resourceType: dto.resourceType,
        resourceId: dto.resourceId,
        before: dto.before,
        after: dto.after,
        ip: dto.ip,
        userAgent: dto.userAgent,
      }),
    );
  }

  async findAll(user: JwtPayload, query: ListAuditLogsQueryDto) {
    const orgId = requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.AuditLogWhereInput = {
      organizationId: orgId,
      ...(query.resourceType ? { resourceType: query.resourceType } : {}),
      ...(query.resourceId ? { resourceId: query.resourceId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.startDate || query.endDate
        ? {
            createdAt: {
              ...(query.startDate ? { gte: query.startDate } : {}),
              ...(query.endDate ? { lte: query.endDate } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await this.tenantDatabase.run(orgId, (tx) =>
      Promise.all([
        tx.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.auditLog.count({ where }),
      ]),
    );
    return {
      items: items.map((item) => this.serialize(item)),
      total,
      page,
      limit,
    };
  }

  private async findOwned(orgId: string, id: string) {
    const log = await this.tenantDatabase.run(orgId, (tx) =>
      tx.auditLog.findFirst({
        where: { id, organizationId: orgId },
      }),
    );
    if (!log) {
      throw new NotFoundException('Audit log not found');
    }
    return log;
  }

  async findOne(user: JwtPayload, id: string) {
    return this.serialize(await this.findOwned(requireOrg(user), id));
  }

  verifyIntegrity(user: JwtPayload) {
    return this.audit.verifyIntegrity(requireOrg(user));
  }

  archiveDay(user: JwtPayload, date: string) {
    return this.archives.archiveDay(user, date);
  }

  listArchives(user: JwtPayload) {
    return this.archives.list(user);
  }

  async incidentTimeline(
    user: JwtPayload,
    query: IncidentTimelineQueryDto,
  ) {
    const organizationId = requireOrg(user);
    const selectors = [
      query.agentRunId,
      query.automationRunId,
      query.externalSubmissionId,
      query.productLaunchId,
      query.traceId,
    ].filter(Boolean);
    if (selectors.length !== 1) {
      throw new BadRequestException(
        'english_text：Agent task、automaticenglish_text、Ozon text、productflowtext Trace ID。',
      );
    }

    const data = await this.tenantDatabase.run(
      organizationId,
      async (tx) => {
        const agentRuns = query.agentRunId
          ? await tx.agentRun.findMany({
              where: { id: query.agentRunId, organizationId },
              include: { transitions: { orderBy: { createdAt: 'asc' } } },
            })
          : query.traceId
            ? await tx.agentRun.findMany({
                where: { traceId: query.traceId, organizationId },
                include: { transitions: { orderBy: { createdAt: 'asc' } } },
                orderBy: { createdAt: 'asc' },
              })
            : [];

        const automationRuns = query.automationRunId
          ? await tx.automationRun.findMany({
              where: {
                id: query.automationRunId,
                flow: { organizationId },
              },
              include: {
                flow: { select: { id: true, name: true, organizationId: true } },
                stepExecutions: { orderBy: { stepIndex: 'asc' } },
              },
            })
          : query.traceId
            ? await tx.automationRun.findMany({
                where: { traceId: query.traceId, flow: { organizationId } },
                include: {
                  flow: { select: { id: true, name: true, organizationId: true } },
                  stepExecutions: { orderBy: { stepIndex: 'asc' } },
                },
                orderBy: { startedAt: 'asc' },
              })
            : [];

        const externalSubmissions = query.externalSubmissionId
          ? await tx.externalSubmission.findMany({
              where: { id: query.externalSubmissionId, organizationId },
            })
          : query.productLaunchId
            ? await tx.externalSubmission.findMany({
                where: { productLaunchId: query.productLaunchId, organizationId },
                orderBy: { createdAt: 'asc' },
              })
            : [];

        const resourceIds = [
          ...agentRuns.map((item) => item.id),
          ...automationRuns.map((item) => item.id),
          ...externalSubmissions.flatMap((item) => [
            item.id,
            item.productLaunchId,
            item.publishSnapshotId,
          ]),
          ...(query.productLaunchId ? [query.productLaunchId] : []),
        ];
        const auditLogs = resourceIds.length
          ? await tx.auditLog.findMany({
              where: {
                organizationId,
                resourceId: { in: [...new Set(resourceIds)] },
              },
              orderBy: { createdAt: 'asc' },
              take: 500,
            })
          : [];

        return { agentRuns, automationRuns, externalSubmissions, auditLogs };
      },
    );

    const events: IncidentTimelineEvent[] = [];
    for (const run of data.agentRuns) {
      for (const transition of run.transitions) {
        events.push({
          id: `agent:${transition.id}`,
          source: 'AGENT',
          title: this.agentEventTitle(transition.eventType),
          detail: `${this.lifecycleLabel(transition.fromStatus)} → ${this.lifecycleLabel(transition.toStatus)}，text ${transition.attempt} english_text`,
          status: transition.toStatus,
          severity: this.statusSeverity(transition.toStatus),
          occurredAt: transition.createdAt.toISOString(),
          correlation: {
            agentRunId: run.id,
            ...(run.traceId ? { traceId: run.traceId } : {}),
          },
        });
      }
    }

    for (const run of data.automationRuns) {
      events.push({
        id: `automation:${run.id}:started`,
        source: 'AUTOMATION',
        title: 'automatictextflowenglish_text',
        detail: `${run.flow.name} · ${this.triggerSourceLabel(run.triggerSource)}${run.triggerReason ? ` · ${run.triggerReason}` : ''}`,
        status: run.status,
        severity: this.statusSeverity(run.status),
        occurredAt: run.startedAt.toISOString(),
        correlation: {
          automationRunId: run.id,
          flowId: run.flow.id,
          ...(run.traceId ? { traceId: run.traceId } : {}),
        },
      });
      for (const step of run.stepExecutions) {
        const occurredAt =
          step.finishedAt ?? step.startedAt ?? step.createdAt;
        events.push({
          id: `automation-step:${step.id}`,
          source: 'AUTOMATION',
          title: `automaticenglish_text ${step.stepIndex + 1}：${this.automationStatusLabel(step.status)}`,
          detail: this.automationActionLabel(step.action),
          status: step.status,
          severity: this.statusSeverity(step.status),
          occurredAt: occurredAt.toISOString(),
          correlation: { automationRunId: run.id, stepKey: step.stepKey },
        });
      }
    }

    for (const submission of data.externalSubmissions) {
      events.push(...this.submissionEvents(submission));
    }

    for (const audit of data.auditLogs) {
      events.push({
        id: `audit:${audit.id}`,
        source: 'AUDIT',
        title: this.auditActionTitle(audit.action),
        detail: `${this.resourceTypeLabel(audit.resourceType)}english_textevidencetextwriteenglish_text。`,
        status: audit.action,
        severity: this.statusSeverity(audit.action),
        occurredAt: audit.createdAt.toISOString(),
        correlation: { resourceId: audit.resourceId, auditLogId: audit.id },
      });
    }

    events.sort((left, right) =>
      left.occurredAt.localeCompare(right.occurredAt),
    );
    if (events.length === 0) {
      throw new NotFoundException('english_textyesenglish_text。');
    }

    const needsAttention = events.some(
      (item) => item.severity === 'error' || item.status === 'UNKNOWN' || item.status === 'RECONCILING',
    );
    const hasExternalWrite = data.externalSubmissions.some(
      (item) => Boolean(item.requestSentAt),
    );
    return {
      selector: query,
      summary: {
        status: needsAttention ? 'NEEDS_ATTENTION' : 'STABLE',
        eventCount: events.length,
        sources: [...new Set(events.map((item) => item.source))],
        needsAttention,
        hasExternalWrite,
        generatedAt: new Date().toISOString(),
      },
      events,
    };
  }

  private submissionEvents(submission: {
    id: string;
    productLaunchId: string;
    publishSnapshotId: string;
    provider: string;
    operation: string;
    status: string;
    externalTaskId: string | null;
    externalProductId: string | null;
    failureCode: string | null;
    failureMessage: string | null;
    claimedAt: Date | null;
    requestSentAt: Date | null;
    responseReceivedAt: Date | null;
    acknowledgedAt: Date | null;
    resolvedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): IncidentTimelineEvent[] {
    const correlation = {
      externalSubmissionId: submission.id,
      productLaunchId: submission.productLaunchId,
      publishSnapshotId: submission.publishSnapshotId,
    };
    const events: IncidentTimelineEvent[] = [
      {
        id: `submission:${submission.id}:prepared`,
        source: 'OZON_SUBMISSION',
        title: 'english_text',
        detail: `${submission.provider} · ${submission.operation}，english_text。`,
        status: 'PREPARED',
        severity: 'info',
        occurredAt: submission.createdAt.toISOString(),
        correlation,
      },
    ];
    const append = (
      at: Date | null,
      suffix: string,
      title: string,
      detail: string,
      status: string,
      severity: IncidentTimelineEvent['severity'],
    ) => {
      if (!at) return;
      events.push({
        id: `submission:${submission.id}:${suffix}`,
        source: 'OZON_SUBMISSION',
        title,
        detail,
        status,
        severity,
        occurredAt: at.toISOString(),
        correlation,
      });
    };
    append(
      submission.claimedAt,
      'claimed',
      'texttaskenglish_text',
      'english_text Worker english_text。',
      'CLAIMED',
      'info',
    );
    append(
      submission.requestSentAt,
      'sent',
      'requestenglish_text Ozon',
      'english_textwrite，english_text Ozon english_text。',
      'REQUEST_SENT',
      'warning',
    );
    append(
      submission.responseReceivedAt,
      'response',
      'english_text Ozon response',
      submission.externalTaskId
        ? `Ozon tasktext ${submission.externalTaskId}`
        : 'english_textplatformresponse，english_text。',
      'RESPONSE_RECEIVED',
      'info',
    );
    append(
      submission.acknowledgedAt,
      'acknowledged',
      'Ozon english_text',
      submission.externalProductId
        ? `Ozon producttext ${submission.externalProductId}`
        : 'platformenglish_text。',
      'ACKNOWLEDGED',
      'success',
    );
    append(
      submission.resolvedAt,
      'resolved',
      'english_textcompletedtext',
      'localstatustext Ozon english_text。',
      'RESOLVED',
      'success',
    );
    if (
      ['UNKNOWN', 'RETRYABLE_FAILED', 'RECONCILING', 'REJECTED'].includes(
        submission.status,
      )
    ) {
      events.push({
        id: `submission:${submission.id}:attention`,
        source: 'OZON_SUBMISSION',
        title: 'Ozon english_texthumantext',
        detail:
          submission.failureMessage ||
          'english_text，english_textautomaticenglish_textwrite。',
        status: submission.status,
        severity: 'error',
        occurredAt: submission.updatedAt.toISOString(),
        correlation: {
          ...correlation,
          ...(submission.failureCode
            ? { failureCode: submission.failureCode }
            : {}),
        },
      });
    }
    return events;
  }

  private agentEventTitle(eventType: string): string {
    return (
      {
        RUN_CREATED: 'Agent taskenglish_text',
        PLAN_STARTED: 'Agent english_text',
        TOOL_CALL_REQUESTED: 'Agent textrequestenglish_text',
        TOOL_RESULT_RECEIVED: 'english_text',
        ACTION_PROPOSED: 'textriskenglish_texthumanapproval',
        APPROVAL_GRANTED: 'humanenglish_text',
        APPROVAL_REJECTED: 'humanenglish_text',
        EXECUTION_FINISHED: 'Agent english_textcompleted',
        VERIFICATION_PASSED: 'english_textpassed',
        VERIFICATION_FAILED: 'english_textpassed',
        RETRYABLE_ERROR: 'english_texterror',
        RETRY_DISPATCHED: 'english_text',
        FATAL_ERROR: 'tasktextsecuritytext',
      }[eventType] ?? 'Agent statusenglish_text'
    );
  }

  private auditActionTitle(action: string): string {
    const normalized = action.toLowerCase();
    if (normalized.includes('approved')) return 'humantextevidenceenglish_text';
    if (normalized.includes('rejected')) return 'humantextevidenceenglish_text';
    if (normalized.includes('completed')) return 'textcompletedevidenceenglish_text';
    if (normalized.includes('failed')) return 'textfailedevidenceenglish_text';
    if (normalized.includes('started')) return 'english_textevidenceenglish_text';
    return 'english_textevidenceenglish_text';
  }

  private resourceTypeLabel(resourceType: string): string {
    return (
      {
        AgentRun: 'Agent task',
        AutomationRun: 'automaticenglish_text',
        ExternalSubmission: 'Ozon english_text',
        ProductLaunch: 'productpublishflow',
        ListingPublishSnapshot: 'english_textpublishtext',
      }[resourceType] ?? 'english_text'
    );
  }

  private lifecycleLabel(status: string | null): string {
    if (!status) return 'textstatus';
    return (
      {
        CREATED: 'english_text',
        PLANNING: 'english_text',
        RUNNING: 'english_text',
        WAITING_TOOL: 'english_text',
        WAITING_APPROVAL: 'texthumanapproval',
        VERIFYING: 'english_text',
        READY_TO_COMMIT: 'english_text',
        COMMITTING: 'english_text',
        RECOVERING: 'english_text',
        COMPLETED: 'textcompleted',
        BLOCKED: 'english_text',
        FAILED: 'textfailed',
        CANCELLED: 'english_text',
      }[status] ?? status
    );
  }

  private automationStatusLabel(status: string): string {
    return (
      {
        PENDING: 'english_text',
        RUNNING: 'english_text',
        COMPLETED: 'textcompleted',
        SUCCEEDED: 'textsuccess',
        FAILED: 'textfailed',
        SKIPPED: 'english_text',
      }[status] ?? 'statusenglish_text'
    );
  }

  private automationActionLabel(action: string): string {
    return (
      {
        'product.research': 'readrealevidencetextgenerationproduct researchreport',
        'listing.draft': 'english_textpassedenglish_textlocalenglish_text',
        'review.create': 'texthumanreviewtask',
      }[action] ?? action
    );
  }

  private triggerSourceLabel(source: string): string {
    return (
      {
        manual: 'humantext',
        schedule: 'english_text',
        automation_console: 'automaticenglish_text',
        notification_center: 'notificationtext',
        dead_letter_triage: 'failedtasktext',
        legacy: 'texttask',
      }[source] ?? 'english_text'
    );
  }

  private statusSeverity(
    status: string,
  ): IncidentTimelineEvent['severity'] {
    const normalized = status.toUpperCase();
    if (
      normalized.includes('FAILED') ||
      normalized.includes('BLOCKED') ||
      normalized.includes('REJECTED') ||
      normalized.includes('FATAL') ||
      normalized === 'UNKNOWN'
    ) {
      return 'error';
    }
    if (
      normalized.includes('COMPLETED') ||
      normalized.includes('SUCCEEDED') ||
      normalized.includes('APPROVED') ||
      normalized.includes('ACKNOWLEDGED')
    ) {
      return 'success';
    }
    if (
      normalized.includes('WAITING') ||
      normalized.includes('RECOVERING') ||
      normalized.includes('RETRY') ||
      normalized.includes('REQUEST_SENT')
    ) {
      return 'warning';
    }
    return 'info';
  }

  private serialize<T extends { sequence?: bigint | null }>(item: T) {
    return {
      ...item,
      sequence: item.sequence?.toString() ?? null,
    };
  }
}
