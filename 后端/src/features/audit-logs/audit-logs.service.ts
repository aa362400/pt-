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
        '请且仅提供一个事故定位条件：Agent 任务、自动化运行、Ozon 提交、商品流程或 Trace ID。',
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
          detail: `${this.lifecycleLabel(transition.fromStatus)} → ${this.lifecycleLabel(transition.toStatus)}，第 ${transition.attempt} 次尝试`,
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
        title: '自动化流程已启动',
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
          title: `自动化步骤 ${step.stepIndex + 1}：${this.automationStatusLabel(step.status)}`,
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
        detail: `${this.resourceTypeLabel(audit.resourceType)}的审计证据已写入不可篡改链。`,
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
      throw new NotFoundException('当前组织中没有找到对应的事故时间线。');
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
        title: '已创建唯一外部提交凭证',
        detail: `${submission.provider} · ${submission.operation}，此凭证用于阻止重复提交。`,
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
      '提交任务已锁定',
      '同一不可变快照不会被其他 Worker 重复发送。',
      'CLAIMED',
      'info',
    );
    append(
      submission.requestSentAt,
      'sent',
      '请求已发送到 Ozon',
      '已产生外部写入，后续必须依据 Ozon 回执或只读回查确认结果。',
      'REQUEST_SENT',
      'warning',
    );
    append(
      submission.responseReceivedAt,
      'response',
      '已收到 Ozon 响应',
      submission.externalTaskId
        ? `Ozon 任务编号 ${submission.externalTaskId}`
        : '已收到平台响应，等待最终确认。',
      'RESPONSE_RECEIVED',
      'info',
    );
    append(
      submission.acknowledgedAt,
      'acknowledged',
      'Ozon 已确认处理结果',
      submission.externalProductId
        ? `Ozon 商品编号 ${submission.externalProductId}`
        : '平台已确认该提交。',
      'ACKNOWLEDGED',
      'success',
    );
    append(
      submission.resolvedAt,
      'resolved',
      '外部提交已完成对账',
      '本地状态与 Ozon 只读回查结果已经一致。',
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
        title: 'Ozon 提交需要人工关注',
        detail:
          submission.failureMessage ||
          '外部结果尚未确认，系统已阻断自动重试和重复写入。',
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
        RUN_CREATED: 'Agent 任务已创建',
        PLAN_STARTED: 'Agent 开始规划',
        TOOL_CALL_REQUESTED: 'Agent 已请求业务工具',
        TOOL_RESULT_RECEIVED: '业务工具已返回结果',
        ACTION_PROPOSED: '高风险动作已进入人工审批',
        APPROVAL_GRANTED: '人工已批准',
        APPROVAL_REJECTED: '人工已驳回',
        EXECUTION_FINISHED: 'Agent 执行步骤已完成',
        VERIFICATION_PASSED: '结果质量门禁通过',
        VERIFICATION_FAILED: '结果质量门禁未通过',
        RETRYABLE_ERROR: '发生可恢复错误',
        RETRY_DISPATCHED: '已创建受控重试',
        FATAL_ERROR: '任务已被安全阻断',
      }[eventType] ?? 'Agent 状态已更新'
    );
  }

  private auditActionTitle(action: string): string {
    const normalized = action.toLowerCase();
    if (normalized.includes('approved')) return '人工批准证据已记录';
    if (normalized.includes('rejected')) return '人工驳回证据已记录';
    if (normalized.includes('completed')) return '执行完成证据已记录';
    if (normalized.includes('failed')) return '执行失败证据已记录';
    if (normalized.includes('started')) return '执行开始证据已记录';
    return '业务变更证据已记录';
  }

  private resourceTypeLabel(resourceType: string): string {
    return (
      {
        AgentRun: 'Agent 任务',
        AutomationRun: '自动化运行',
        ExternalSubmission: 'Ozon 外部提交',
        ProductLaunch: '商品发布流程',
        ListingPublishSnapshot: '不可变发布快照',
      }[resourceType] ?? '业务对象'
    );
  }

  private lifecycleLabel(status: string | null): string {
    if (!status) return '初始状态';
    return (
      {
        CREATED: '已创建',
        PLANNING: '规划中',
        RUNNING: '执行中',
        WAITING_TOOL: '等待工具',
        WAITING_APPROVAL: '等待人工审批',
        VERIFYING: '质量核验中',
        READY_TO_COMMIT: '等待提交',
        COMMITTING: '提交中',
        RECOVERING: '恢复中',
        COMPLETED: '已完成',
        BLOCKED: '已阻断',
        FAILED: '已失败',
        CANCELLED: '已取消',
      }[status] ?? status
    );
  }

  private automationStatusLabel(status: string): string {
    return (
      {
        PENDING: '等待执行',
        RUNNING: '执行中',
        COMPLETED: '执行完成',
        SUCCEEDED: '执行成功',
        FAILED: '执行失败',
        SKIPPED: '已跳过',
      }[status] ?? '状态已更新'
    );
  }

  private automationActionLabel(action: string): string {
    return (
      {
        'product.research': '读取真实证据并生成选品报告',
        'listing.draft': '根据已通过的调研创建本地刊登草稿',
        'review.create': '创建人工审核任务',
      }[action] ?? action
    );
  }

  private triggerSourceLabel(source: string): string {
    return (
      {
        manual: '人工启动',
        schedule: '定时计划',
        automation_console: '自动化控制台',
        notification_center: '通知中心',
        dead_letter_triage: '失败任务恢复',
        legacy: '历史任务',
      }[source] ?? '系统触发'
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
