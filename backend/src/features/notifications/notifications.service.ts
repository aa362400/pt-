import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Prisma } from '@prisma/client';
import type { NotificationType } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { requireOrg } from '../../shared/tenancy/org-scope.js';
import { NotificationEventsService } from './notification-events.service.js';
import { LinkfoxSkillCliService } from '../../shared/linkfox-skill/linkfox-skill-cli.service.js';
import { AutomationService } from '../automation/automation.service.js';
import { AgentRunsService } from '../agent-runs/agent-runs.service.js';
import {
  OzonApprovedActionRouterService,
  type ApprovedActionExecutionContext,
} from './ozon-approved-action-router.service.js';
import {
  ActionProposalsService,
  type ApprovalExecutionGrant,
  type VerifiedApprovalExecution,
} from './action-proposals.service.js';
import { ProductLaunchService } from '../product-launch/product-launch.service.js';
import type {
  CreateNotificationDto,
  ListNotificationsQueryDto,
  MarkReadDto,
  NotificationDecisionDto,
  UpdateNotificationDto,
} from './notifications.dto.js';

type NotificationDecisionStatus =
  | 'executed'
  | 'dismissed'
  | 'approved_pending_external_adapter'
  | 'external_execution_failed';

const PRODUCT_LAUNCH_PUBLISH_ACTIONS = new Set([
  'product-launch.confirm-publish',
  'store.product.update',
  'listing.publish',
  'ozon.product.update',
  'ozon.listing.publish',
]);

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notificationEvents: NotificationEventsService,
    private readonly tenantDatabase: TenantDatabaseContextService,
    @Optional()
    @InjectQueue('agent-runs')
    private readonly agentRunQueue?: Queue,
    @Optional()
    private readonly linkfoxSkillCli?: LinkfoxSkillCliService,
    @Optional()
    private readonly approvedActionRouter?: OzonApprovedActionRouterService,
    @Optional()
    private readonly automationService?: AutomationService,
    private readonly agentRuns?: AgentRunsService,
    private readonly actionProposals?: ActionProposalsService,
    @Optional()
    private readonly moduleRef?: ModuleRef,
  ) {}

  async create(user: JwtPayload, dto: CreateNotificationDto) {
    const orgId = requireOrg(user);
    if ('metadata' in dto) {
      throw new BadRequestException(
        'Client-created notifications cannot contain executable metadata',
      );
    }
    const notification = await this.tenantDatabase.run(orgId, (tx) =>
      tx.notification.create({
        data: {
          organizationId: orgId,
          userId: user.sub,
          type: dto.type as NotificationType,
          title: dto.title,
          body: dto.body ?? null,
          metadata: { source: 'user' },
        },
      }),
    );
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'notification.create',
      resourceType: 'Notification',
      resourceId: notification.id,
      after: { title: notification.title, type: notification.type },
    });
    this.notificationEvents.publishCreated(notification);
    return notification;
  }

  async findAll(user: JwtPayload, query: ListNotificationsQueryDto) {
    const orgId = requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.NotificationWhereInput = {
      organizationId: orgId,
      userId: user.sub,
      ...(query.type ? { type: query.type as NotificationType } : {}),
      ...(query.read === 'true'
        ? { readAt: { not: null } }
        : query.read === 'false'
          ? { readAt: null }
          : {}),
    };

    const [items, total] = await this.tenantDatabase.run(orgId, (tx) =>
      Promise.all([
        tx.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.notification.count({ where }),
      ]),
    );
    return { items, total, page, limit };
  }

  async findOne(user: JwtPayload, id: string) {
    return this.findOwnedByUser(requireOrg(user), user.sub, id);
  }

  private async findOwnedByUser(orgId: string, userId: string, id: string) {
    const notification = await this.tenantDatabase.run(orgId, (tx) =>
      tx.notification.findFirst({
        where: { id, organizationId: orgId, userId },
      }),
    );
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    return notification;
  }

  async update(user: JwtPayload, id: string, dto: UpdateNotificationDto) {
    const orgId = requireOrg(user);
    if ('metadata' in dto) {
      throw new BadRequestException(
        'Notification metadata is managed by the server and cannot be updated',
      );
    }
    const existing = await this.findOwnedByUser(orgId, user.sub, id);
    const before = { title: existing.title, type: existing.type };
    const updated = await this.tenantDatabase.run(orgId, (tx) =>
      tx.notification.update({
        where: { id: existing.id },
        data: {
          type: dto.type as NotificationType | undefined,
          title: dto.title,
          body: dto.body,
        },
      }),
    );
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'notification.update',
      resourceType: 'Notification',
      resourceId: existing.id,
      before,
      after: { title: updated.title, type: updated.type },
    });
    this.notificationEvents.publishUpdated(updated);
    return updated;
  }

  async remove(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const existing = await this.findOwnedByUser(orgId, user.sub, id);
    await this.tenantDatabase.run(orgId, (tx) =>
      tx.notification.delete({ where: { id: existing.id } }),
    );
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'notification.delete',
      resourceType: 'Notification',
      resourceId: existing.id,
      before: { title: existing.title },
    });
    this.notificationEvents.publishDeleted(existing);
    return { id: existing.id };
  }

  async markAsRead(user: JwtPayload, dto: MarkReadDto) {
    const orgId = requireOrg(user);
    const readAt = new Date();
    const where: Prisma.NotificationWhereInput = {
      organizationId: orgId,
      userId: user.sub,
      readAt: null,
    };
    if (dto.ids && dto.ids.length > 0) {
      where.id = { in: dto.ids };
    }
    const [result, unreadCount] = await this.tenantDatabase.run(
      orgId,
      async (tx) => {
        const result = await tx.notification.updateMany({
          where,
          data: { readAt },
        });
        const unreadCount = await tx.notification.count({
          where: {
            organizationId: orgId,
            userId: user.sub,
            readAt: null,
          },
        });
        return [result, unreadCount] as const;
      },
    );
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'notification.mark-read',
      resourceType: 'Notification',
      resourceId: `batch-${dto.ids?.length ?? 'all'}`,
      before: { count: result.count },
      after: { readAt: readAt.toISOString() },
    });
    this.notificationEvents.publishRead({
      organizationId: orgId,
      userId: user.sub,
      ids: dto.ids,
      count: result.count,
      unreadCount,
      readAt,
    });
    return { count: result.count, unreadCount };
  }

  async decide(user: JwtPayload, id: string, dto: NotificationDecisionDto) {
    const orgId = requireOrg(user);
    const notification = await this.findOwnedByUser(orgId, user.sub, id);
    const metadata = this.asRecord(notification.metadata);
    const existingDecision = this.asRecord(metadata.decision);
    if (typeof existingDecision.status === 'string') {
      throw new BadRequestException('Notification decision already recorded');
    }

    const decidedAt = new Date();
    const proposal = await this.actionProposals?.findForNotification({
      organizationId: orgId,
      approverId: user.sub,
      notificationId: notification.id,
    });
    let result: unknown = { status: 'dismissed' };
    let decisionStatus: NotificationDecisionStatus = 'dismissed';
    let claimedProposal = proposal;
    let approvalDecisionId: string | null = null;

    if (dto.decision === 'execute') {
      if (!this.actionProposals) {
        throw new InternalServerErrorException(
          'Action proposal service is not configured',
        );
      }
      if (proposal && PRODUCT_LAUNCH_PUBLISH_ACTIONS.has(proposal.action)) {
        this.preflightProductLaunchPublish(user, orgId, decidedAt);
      }
      const claimedExecution = await this.actionProposals.claimExecution({
        organizationId: orgId,
        approverId: user.sub,
        notificationId: notification.id,
        actorRole: user.role ?? 'VIEWER',
        now: decidedAt,
      });
      claimedProposal = claimedExecution;
      approvalDecisionId = claimedExecution.approvalDecision.id;
      const action = {
        action: claimedExecution.action,
        params: this.asRecord(claimedExecution.params),
      };
      try {
        const execution = await this.consumeApprovalExecutionGrant(
          claimedExecution,
          decidedAt,
        );
        result = await this.executeNotificationAction(
          notification,
          action,
          this.asRecord(claimedExecution.context),
          execution,
          user,
        );
        decisionStatus = this.decisionStatusFromResult(result) ?? 'executed';
        await this.actionProposals.completeExecution({
          organizationId: orgId,
          proposalId: claimedExecution.id,
          status:
            decisionStatus === 'approved_pending_external_adapter'
              ? 'APPROVED'
              : decisionStatus === 'external_execution_failed'
                ? 'FAILED'
                : 'EXECUTED',
          result,
          now: decidedAt,
        });
      } catch (error) {
        await this.actionProposals.failExecution({
          organizationId: orgId,
          proposalId: claimedExecution.id,
          error,
          now: decidedAt,
        });
        throw error;
      }
    } else if (proposal && this.actionProposals) {
      claimedProposal = await this.actionProposals.dismiss({
        organizationId: orgId,
        approverId: user.sub,
        notificationId: notification.id,
        now: decidedAt,
      });
    }

    const nextMetadata = {
      ...metadata,
      decision: {
        status: decisionStatus,
        decidedAt: decidedAt.toISOString(),
        actorId: user.sub,
        actionProposalId: claimedProposal?.id ?? null,
        approvalDecisionId,
        result,
      },
    };
    const [updated, unreadCount] = await this.tenantDatabase.run(
      orgId,
      async (tx) => {
        const updated = await tx.notification.update({
          where: { id: notification.id },
          data: {
            readAt: notification.readAt ?? decidedAt,
            metadata: nextMetadata as Prisma.InputJsonValue,
          },
        });
        const unreadCount = await tx.notification.count({
          where: { organizationId: orgId, userId: user.sub, readAt: null },
        });
        return [updated, unreadCount] as const;
      },
    );

    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action:
        dto.decision === 'execute'
          ? 'notification.decision.execute'
          : 'notification.decision.dismiss',
      resourceType: 'Notification',
      resourceId: notification.id,
      before: {
        title: notification.title,
        actionProposalId: claimedProposal?.id ?? null,
        payloadHash: claimedProposal?.payloadHash ?? null,
      },
      after: {
        decision: nextMetadata.decision,
      },
    });

    this.notificationEvents.publishUpdated(updated);
    this.notificationEvents.publishRead({
      organizationId: orgId,
      userId: user.sub,
      ids: [notification.id],
      count: notification.readAt ? 0 : 1,
      unreadCount,
      readAt: notification.readAt ?? decidedAt,
    });

    return {
      status: nextMetadata.decision.status,
      notification: updated,
      unreadCount,
      result,
      actionProposal: claimedProposal
        ? {
            id: claimedProposal.id,
            payloadHash: claimedProposal.payloadHash,
            status:
              dto.decision === 'dismiss'
                ? 'DISMISSED'
                : decisionStatus === 'approved_pending_external_adapter'
                  ? 'APPROVED'
                  : decisionStatus === 'external_execution_failed'
                    ? 'FAILED'
                    : 'EXECUTED',
          }
        : null,
    };
  }

  async decideProposal(
    user: JwtPayload,
    proposalId: string,
    input: { reason?: string; sandboxReportId?: string } = {},
  ) {
    const orgId = requireOrg(user);
    if (!this.actionProposals) {
      throw new InternalServerErrorException(
        'Action proposal service is not configured',
      );
    }
    const decidedAt = new Date();
    const pending = await this.actionProposals.findById({
      organizationId: orgId,
      proposalId,
      actorId: user.sub,
      actorRole: user.role ?? 'VIEWER',
    });
    if (PRODUCT_LAUNCH_PUBLISH_ACTIONS.has(pending.action)) {
      this.preflightProductLaunchPublish(user, orgId, decidedAt);
    }
    const claimed = await this.actionProposals.claimExecutionById({
      organizationId: orgId,
      proposalId,
      actorId: user.sub,
      actorRole: user.role ?? 'VIEWER',
      reason: input.reason,
      sandboxReportId: input.sandboxReportId,
      now: decidedAt,
    });
    const notification = claimed.notification;
    const metadata = this.asRecord(notification.metadata);
    let result: unknown;
    let decisionStatus: NotificationDecisionStatus;
    try {
      const execution = await this.consumeApprovalExecutionGrant(
        claimed,
        decidedAt,
      );
      result = await this.executeNotificationAction(
        {
          organizationId: orgId,
          userId: user.sub,
          title: notification.title,
        },
        {
          action: claimed.action,
          params: this.asRecord(claimed.params),
        },
        this.asRecord(claimed.context),
        execution,
        user,
      );
      decisionStatus = this.decisionStatusFromResult(result) ?? 'executed';
      await this.actionProposals.completeExecution({
        organizationId: orgId,
        proposalId: claimed.id,
        status:
          decisionStatus === 'approved_pending_external_adapter'
            ? 'APPROVED'
            : decisionStatus === 'external_execution_failed'
              ? 'FAILED'
              : 'EXECUTED',
        result,
        now: decidedAt,
      });
    } catch (error) {
      await this.actionProposals.failExecution({
        organizationId: orgId,
        proposalId: claimed.id,
        error,
        now: decidedAt,
      });
      throw error;
    }

    const nextMetadata = {
      ...metadata,
      decision: {
        status: decisionStatus,
        decidedAt: decidedAt.toISOString(),
        actorId: user.sub,
        actionProposalId: claimed.id,
        approvalDecisionId: claimed.approvalDecision.id,
        result,
      },
    };
    const [updated, unreadCount] = await this.tenantDatabase.run(
      orgId,
      async (tx) => {
        const updated = await tx.notification.update({
          where: { id: notification.id },
          data: {
            readAt: notification.readAt ?? decidedAt,
            metadata: nextMetadata as Prisma.InputJsonValue,
          },
        });
        const unreadCount = await tx.notification.count({
          where: {
            organizationId: orgId,
            userId: notification.userId,
            readAt: null,
          },
        });
        return [updated, unreadCount] as const;
      },
    );
    await this.audit.appendStrict({
      organizationId: orgId,
      actorId: user.sub,
      action: 'approval-item.execute',
      resourceType: 'ActionProposal',
      resourceId: claimed.id,
      before: {
        payloadHash: claimed.payloadHash,
        status: 'PENDING',
      },
      after: {
        status: decisionStatus,
        approvalDecisionId: claimed.approvalDecision.id,
        result,
      },
    });
    this.notificationEvents.publishUpdated(updated);
    this.notificationEvents.publishRead({
      organizationId: orgId,
      userId: notification.userId,
      ids: [notification.id],
      count: notification.readAt ? 0 : 1,
      unreadCount,
      readAt: notification.readAt ?? decidedAt,
    });
    return {
      status: decisionStatus,
      notification: updated,
      unreadCount,
      result,
      actionProposal: {
        id: claimed.id,
        payloadHash: claimed.payloadHash,
        approvalDecisionId: claimed.approvalDecision.id,
        status:
          decisionStatus === 'approved_pending_external_adapter'
            ? 'APPROVED'
            : decisionStatus === 'external_execution_failed'
              ? 'FAILED'
              : 'EXECUTED',
      },
    };
  }

  async unreadCount(user: JwtPayload) {
    const orgId = requireOrg(user);
    const count = await this.tenantDatabase.run(orgId, (tx) =>
      tx.notification.count({
        where: {
          organizationId: orgId,
          userId: user.sub,
          readAt: null,
        },
      }),
    );
    return { count };
  }

  private async executeNotificationAction(
    notification: {
      organizationId: string;
      userId: string;
      title: string;
    },
    action: { label?: string; action: string; params: Record<string, unknown> },
    metadata: Record<string, unknown>,
    execution: VerifiedApprovalExecution,
    actor: JwtPayload,
  ): Promise<unknown> {
    if (PRODUCT_LAUNCH_PUBLISH_ACTIONS.has(action.action)) {
      return this.confirmProductLaunchPublish(
        actor,
        notification,
        action,
        execution.consumedAt,
      );
    }
    if (this.approvedActionRouter?.supports(action.action)) {
      return this.approvedActionRouter.execute(
        notification,
        action,
        metadata,
        execution satisfies ApprovedActionExecutionContext,
      );
    }
    if (this.isLinkfoxSkillWriteAction(action.action)) {
      return this.executeApprovedLinkfoxSkillAction(action);
    }
    if (metadata.kind === 'high_risk_action_review') {
      return this.approveHighRiskAction(notification, action);
    }

    switch (action.action) {
      case 'operator.prepare_listing_batch':
        return this.prepareListingBatchFromNotification(notification, action);
      case 'automation.recover':
        return this.recoverAutomationFromNotification(notification, action);
      default:
        throw new BadRequestException(
          `Notification action "${action.action}" is not executable from the notification center`,
        );
    }
  }

  private consumeApprovalExecutionGrant(
    proposal: {
      id: string;
      organizationId: string;
      action: string;
      payloadHash: string;
      approvalDecision: { id: string };
      executionGrant: ApprovalExecutionGrant;
    },
    now: Date,
  ) {
    if (!this.actionProposals) {
      throw new InternalServerErrorException(
        'Action proposal service is not configured',
      );
    }
    const grant = proposal.executionGrant;
    if (
      !grant ||
      grant.proposalId !== proposal.id ||
      grant.approvalDecisionId !== proposal.approvalDecision.id ||
      grant.action !== proposal.action ||
      grant.payloadHash !== proposal.payloadHash
    ) {
      throw new BadRequestException({
        code: 'APPROVAL_EXECUTION_GRANT_INVALID',
        message: 'Approval execution grant is missing or not bound to approval',
      });
    }
    return this.actionProposals.consumeExecutionGrant({
      organizationId: proposal.organizationId,
      proposalId: proposal.id,
      approvalDecisionId: proposal.approvalDecision.id,
      action: proposal.action,
      payloadHash: proposal.payloadHash,
      token: grant.token,
      capabilityScope: grant.capabilityScope,
      now,
    });
  }

  private confirmProductLaunchPublish(
    actor: JwtPayload,
    notification: {
      organizationId: string;
      userId: string;
    },
    action: { action: string; params: Record<string, unknown> },
    approvedAt: Date,
  ) {
    const productLaunchService = this.requireProductLaunchService();
    const productLaunchId = this.asOptionalString(
      action.params.productLaunchId,
    );
    if (!productLaunchId) {
      throw new BadRequestException({
        code: 'PRODUCT_LAUNCH_SNAPSHOT_REQUIRED',
        message:
          'Publishing requires productLaunchId so the approved immutable snapshot, sandbox report, and submission ledger can be verified',
        requestedAction: action.action,
      });
    }
    return productLaunchService.confirmPublish(
      {
        ...actor,
        orgId: notification.organizationId,
      },
      productLaunchId,
      { confirmPublish: true },
      { approvedAt },
    );
  }

  private preflightProductLaunchPublish(
    actor: JwtPayload,
    organizationId: string,
    approvedAt: Date,
  ) {
    return this.requireProductLaunchService().preflightPublishConfirmation(
      { ...actor, orgId: organizationId },
      approvedAt,
    );
  }

  private requireProductLaunchService(): ProductLaunchService {
    const productLaunchService = this.moduleRef?.get(ProductLaunchService, {
      strict: false,
    });
    if (!productLaunchService) {
      throw new InternalServerErrorException(
        'Product launch service is not configured',
      );
    }
    return productLaunchService;
  }

  private isLinkfoxSkillWriteAction(actionName: string): boolean {
    return (
      actionName === 'linkfoxskill.install' ||
      actionName === 'linkfoxskill.update'
    );
  }

  private async recoverAutomationFromNotification(
    notification: {
      organizationId: string;
      userId: string;
      title: string;
    },
    action: { params: Record<string, unknown> },
  ) {
    if (!this.automationService) {
      throw new InternalServerErrorException(
        'Automation recovery service is not configured',
      );
    }
    const flowId = this.asOptionalString(action.params.flowId);
    if (!flowId) {
      throw new BadRequestException('Automation recovery requires flowId');
    }
    const failedRunId = this.asOptionalString(action.params.failedRunId);
    if (!failedRunId) {
      throw new BadRequestException('Automation recovery requires failedRunId');
    }

    return this.automationService.recoverFromFailure({
      organizationId: notification.organizationId,
      actorId: notification.userId,
      flowId,
      failedRunId,
      reason: `notificationenglish_text：${notification.title}`,
      idempotencyKey: `notification-recovery:${failedRunId}`,
      source: 'notification_center',
    });
  }

  private async executeApprovedLinkfoxSkillAction(action: {
    action: string;
    params: Record<string, unknown>;
  }) {
    if (!this.linkfoxSkillCli) {
      throw new InternalServerErrorException(
        'LinkfoxSkill CLI adapter is not configured',
      );
    }

    const cli =
      action.action === 'linkfoxskill.install'
        ? await this.linkfoxSkillCli.install(action.params)
        : await this.linkfoxSkillCli.update(action.params);

    return {
      status: 'executed',
      action: action.action,
      cli,
      guardrail:
        'LinkfoxSkill install/update requires notification-center approval before local Agent skills are changed.',
    };
  }

  private approveHighRiskAction(
    notification: {
      organizationId: string;
      userId: string;
      title: string;
    },
    action: { action: string; params: Record<string, unknown> },
  ) {
    return {
      status: 'approved_pending_external_adapter',
      action: action.action,
      params: action.params,
      notificationTitle: notification.title,
      externalExecution: {
        status: 'not_connected',
        reason:
          'textstorewriteenglish_text，english_texthumantext，textwriterealstore。',
      },
      guardrail:
        'textriskenglish_texthumantext；english_textrealtextplatformwriteenglish_text。',
    };
  }

  private decisionStatusFromResult(
    result: unknown,
  ): NotificationDecisionStatus | null {
    const status = this.asRecord(result).status;
    return status === 'approved_pending_external_adapter' ||
      status === 'external_execution_failed'
      ? status
      : null;
  }

  private async prepareListingBatchFromNotification(
    notification: {
      organizationId: string;
      userId: string;
      title: string;
    },
    action: { params: Record<string, unknown> },
  ) {
    const productIds = this.asStringArray(action.params.productIds);
    if (productIds.length === 0) {
      throw new BadRequestException(
        'productIds must contain at least one product',
      );
    }
    const workspaceId = this.asOptionalString(action.params.workspaceId);
    const instruction =
      this.asOptionalString(action.params.instruction) ??
      'textagentenglish_textproduct researchtext、Listing text、image、profitenglish_texthumanreviewtask';
    const steps = this.buildPreparationSteps(productIds);

    if (!this.agentRuns) {
      throw new BadRequestException('Agent run service is unavailable');
    }
    const run = await this.agentRuns.create(
      {
        sub: notification.userId,
        email: '',
        orgId: notification.organizationId,
      },
      {
        workspaceId,
        agentType: 'PLANNER',
        input: {
          goal: instruction,
          source: 'notification_center',
          productIds,
          steps,
          publish: {
            status: 'pending_confirmation',
            reason: 'textplatformpublishenglish_texthumanenglish_text',
          },
        },
      },
    );

    const flow = await this.tenantDatabase.run(
      notification.organizationId,
      (tx) =>
        tx.automationFlow.create({
          data: {
            organizationId: notification.organizationId,
            workspaceId,
            name: `[notificationenglish_text] text ${productIds.length} textproductlisting`,
            description: instruction,
            status: 'ACTIVE',
            triggerType: 'MANUAL',
            triggerConfig: {
              source: 'notification_center',
              agentRunId: run.id,
              productIds,
            },
            steps: steps as Prisma.InputJsonValue,
            createdBy: notification.userId,
          },
        }),
    );

    const reviewNotification = await this.tenantDatabase.run(
      notification.organizationId,
      (tx) =>
        tx.notification.create({
          data: {
            organizationId: notification.organizationId,
            userId: notification.userId,
            type: 'APPROVAL_REQUIRED',
            title: `textreviewenglish_textlistingtext（${productIds.length} textproduct）`,
            body: 'agentenglish_textproduct researchtext、Listing text、image、profitenglish_textreviewtask；publishenglish_texthumantext。',
            metadata: {
              kind: 'operator_batch_review',
              source: 'notification_center',
              agentRunId: run.id,
              flowId: flow.id,
              productIds,
              publish: {
                status: 'pending_confirmation',
                requiresConfirmation: true,
              },
            },
          },
        }),
    );
    this.notificationEvents.publishCreated(reviewNotification);

    return {
      productCount: productIds.length,
      agentRunId: run.id,
      flowId: flow.id,
      reviewNotificationId: reviewNotification.id,
      publish: { status: 'pending_confirmation', productIds },
    };
  }

  private buildPreparationSteps(
    productIds: string[],
  ): Array<Record<string, unknown>> {
    return [
      {
        key: 'research',
        action: 'product.research',
        mode: 'automatic',
        productIds,
      },
      {
        key: 'listing',
        action: 'listing.draft',
        mode: 'automatic',
        productIds,
      },
      {
        key: 'images',
        action: 'image.generate',
        mode: 'automatic',
        productIds,
      },
      {
        key: 'profit',
        action: 'profit.analyze',
        mode: 'automatic',
        productIds,
      },
      {
        key: 'review-task',
        action: 'task.create',
        mode: 'automatic',
        productIds,
      },
      {
        key: 'publish',
        action: 'listing.publish',
        mode: 'manual_confirmation',
        requiresConfirmation: true,
        status: 'pending_confirmation',
        productIds,
      },
    ];
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return { ...(value as Record<string, unknown>) };
    }
    return {};
  }

  private asOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value
      : undefined;
  }

  private asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => this.asOptionalString(item))
      .filter((item): item is string => !!item);
  }
}
