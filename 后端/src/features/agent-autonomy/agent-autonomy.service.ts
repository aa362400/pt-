import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import type { PlatformEvent } from '../../shared/events/event-bus.service.js';
import { NotificationEventsService } from '../notifications/notification-events.service.js';
import { ActionProposalsService } from '../notifications/action-proposals.service.js';
import { AgentRunsService } from '../agent-runs/agent-runs.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import type { UpdateAgentAutonomyPolicyDto } from './agent-autonomy.dto.js';

type AgentPriority = 'low' | 'medium' | 'high' | 'urgent';
type TaskPriorityValue = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

interface SuggestionAction {
  label: string;
  action: string;
  params: Record<string, unknown>;
}

interface NormalizedSuggestion {
  title: string;
  description: string;
  priority: AgentPriority;
  score: number;
  action: SuggestionAction;
  sourceEventType?: string;
  sourceResourceType?: string;
  sourceResourceId?: string;
  estimatedEffort?: string;
  estimatedBenefit?: string;
}

export interface ScheduleSuggestionInput {
  orgId: string;
  actorId?: string;
  workspaceId?: string;
  suggestion: Record<string, unknown>;
  dueAt?: string;
}

export interface PrepareListingBatchInput {
  orgId: string;
  actorId?: string;
  workspaceId?: string;
  productIds: string[];
  instruction?: string;
}

export interface ProductAutonomyResult {
  awarenessTaskId?: string;
  suggestionNotificationId?: string;
  autoDraft?: {
    status:
      | 'queued'
      | 'disabled'
      | 'blocked_by_kill_switch'
      | 'missing_workspace'
      | 'product_not_found'
      | 'deduplicated';
    flowId?: string;
    dedupeKey?: string;
  };
  ignored?: boolean;
}

@Injectable()
export class AgentAutonomyService {
  private readonly logger = new Logger(AgentAutonomyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenantDatabase: TenantDatabaseContextService,
    private readonly actionProposals: ActionProposalsService,
    @Optional()
    @InjectQueue('agent-runs')
    private readonly agentRunQueue?: Queue,
    @Optional()
    private readonly notificationEvents?: NotificationEventsService,
    private readonly agentRuns?: AgentRunsService,
  ) {}

  async handlePlatformEvent(
    event: PlatformEvent,
  ): Promise<ProductAutonomyResult> {
    if (event.type !== 'product.created') {
      return { ignored: true };
    }
    return this.recordProductChangeAwareness(event, 'created');
  }

  async handleProductUpdatedEvent(
    event: PlatformEvent,
  ): Promise<ProductAutonomyResult> {
    if (event.type !== 'product.updated') {
      return { ignored: true };
    }
    return this.recordProductChangeAwareness(event, 'updated');
  }

  private async recordProductChangeAwareness(
    event: PlatformEvent,
    changeType: 'created' | 'updated',
  ): Promise<ProductAutonomyResult> {
    const actorId = await this.resolveActorForOrg(event.orgId, event.actorId);
    const workspaceId = this.asOptionalString(event.data.workspaceId);
    const title =
      this.asOptionalString(event.data.title) ??
      (changeType === 'created' ? '新商品' : '已更新商品');
    const isUpdate = changeType === 'updated';

    const awarenessTask = await this.tenantDatabase.run(event.orgId, (tx) =>
      tx.teamTask.create({
        data: {
          organizationId: event.orgId,
          workspaceId,
          title: `${isUpdate ? '待复核事项' : '待评估事项'}：${title}`,
          description:
            `智能体从 ${event.type} 检测到 ${event.resourceType}/${event.resourceId}。` +
            (isUpdate
              ? '请复核 Listing、关键词、图片、价格和利润是否仍匹配。'
              : '发布前请评估 Listing、关键词、图片和利润。'),
          priority: 'HIGH',
          dueAt: this.nextWorkSlot(),
          createdBy: actorId,
        },
      }),
    );

    await this.audit.log({
      organizationId: event.orgId,
      actorId,
      action: 'agent-autonomy.awareness-recorded',
      resourceType: 'TeamTask',
      resourceId: awarenessTask.id,
      after: {
        eventType: event.type,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
      },
    });

    const autoDraft = await this.createAutoDraftFlow({
      event,
      actorId,
      workspaceId,
      title,
    });

    const suggestion = await this.pushSuggestion({
      orgId: event.orgId,
      actorId,
      workspaceId,
      suggestion: {
        title: isUpdate
          ? `复核 ${title} 的上架素材`
          : `为 ${title} 准备上架素材`,
        description: isUpdate
          ? `商品 ${title} 已在本地商品库变更。建议重新检查 Listing 文案、图片、价格和利润；外部店铺写入仍需人工确认。`
          : `新商品 ${title} 还没有完整上架包。建议生成选品研究、Listing 文案、图片、利润检查和审核任务。`,
        priority: 'high',
        score: isUpdate ? 78 : 85,
        sourceEventType: event.type,
        sourceResourceType: event.resourceType,
        sourceResourceId: event.resourceId,
        estimatedEffort: isUpdate ? '约 2 分钟' : '约 3 分钟',
        estimatedBenefit: isUpdate
          ? '降低商品变更后 Listing 和利润不一致风险'
          : '提升新品上架准备速度',
        action: {
          label: '执行',
          action: 'operator.prepare_listing_batch',
          params: {
            productIds: [event.resourceId],
            workspaceId,
          },
        },
      },
    });

    this.logger.log(
      `Recorded awareness task ${awarenessTask.id} and suggestion ${suggestion.notificationId}`,
    );

    return {
      awarenessTaskId: awarenessTask.id,
      suggestionNotificationId: suggestion.notificationId,
      autoDraft,
    };
  }

  async getMode(orgId: string) {
    const [suggestionsEnabled, autoResearchAndDraftEnabled] = await Promise.all(
      [
        this.isFlagEnabled('agent-autonomy', orgId),
        this.isFlagEnabled('agent-autonomy-auto-draft', orgId),
      ],
    );
    return {
      suggestionsEnabled,
      autoResearchAndDraftEnabled,
      externalWrites: 'human_confirmation_required' as const,
      allowedAutomaticActions: ['product.research', 'listing.draft'],
      blockedAutomaticActions: [
        'listing.publish',
        'price.adjust',
        'ozon.price.update',
        'ozon.stock.update',
        'ads.campaign.update',
        'order.refund',
        'payment.execute',
      ],
    };
  }

  async getEffectivePolicy(orgId: string, userId: string) {
    const policies = await this.tenantDatabase.run(orgId, (tx) =>
      tx.agentAutonomyPolicy.findMany({
        where: {
          organizationId: orgId,
          scopeKey: { in: [`user:${userId}`, 'organization'] },
        },
      }),
    );
    const policy =
      policies.find((item) => item.scopeKey === `user:${userId}`) ??
      policies.find((item) => item.scopeKey === 'organization');
    if (!policy) {
      return {
        id: null,
        organizationId: orgId,
        userId: null,
        scopeKey: 'default',
        level: 1,
        allowedTools: [],
        deniedTools: [],
        highRiskApproval: true,
        source: 'system_default' as const,
      };
    }
    return {
      ...policy,
      source:
        policy.scopeKey === `user:${userId}`
          ? ('user_override' as const)
          : ('organization' as const),
    };
  }

  async setPolicy(
    orgId: string,
    actorId: string,
    dto: UpdateAgentAutonomyPolicyDto,
  ) {
    const targetUserId = dto.scope === 'user' ? dto.targetUserId : undefined;
    if (dto.scope === 'user' && !targetUserId) {
      throw new BadRequestException('targetUserId is required for user scope');
    }
    if (targetUserId) {
      const membership = await this.tenantDatabase.run(orgId, (tx) =>
        tx.membership.findFirst({
          where: {
            organizationId: orgId,
            userId: targetUserId,
            status: 'ACTIVE',
          },
          select: { id: true },
        }),
      );
      if (!membership) {
        throw new BadRequestException(
          'Target user is not an active organization member',
        );
      }
    }

    const scopeKey = targetUserId ? `user:${targetUserId}` : 'organization';
    const normalizedAllowed = [
      ...new Set(dto.allowedTools.map((v) => v.trim())),
    ]
      .filter(Boolean)
      .sort();
    const normalizedDenied = [...new Set(dto.deniedTools.map((v) => v.trim()))]
      .filter(Boolean)
      .sort();
    const overlap = normalizedAllowed.find((tool) =>
      normalizedDenied.includes(tool),
    );
    if (overlap) {
      throw new BadRequestException(
        `Tool cannot be both allowed and denied: ${overlap}`,
      );
    }

    const policy = await this.tenantDatabase.run(orgId, (tx) =>
      tx.agentAutonomyPolicy.upsert({
        where: {
          organizationId_scopeKey: { organizationId: orgId, scopeKey },
        },
        create: {
          organizationId: orgId,
          userId: targetUserId,
          scopeKey,
          level: dto.level,
          allowedTools: normalizedAllowed,
          deniedTools: normalizedDenied,
          highRiskApproval: dto.highRiskApproval,
          createdBy: actorId,
        },
        update: {
          userId: targetUserId,
          level: dto.level,
          allowedTools: normalizedAllowed,
          deniedTools: normalizedDenied,
          highRiskApproval: dto.highRiskApproval,
        },
      }),
    );
    await this.audit.log({
      organizationId: orgId,
      actorId,
      action: 'agent-autonomy.policy-upserted',
      resourceType: 'AgentAutonomyPolicy',
      resourceId: policy.id,
      after: {
        scopeKey,
        level: policy.level,
        allowedTools: policy.allowedTools,
        deniedTools: policy.deniedTools,
        highRiskApproval: policy.highRiskApproval,
      },
    });
    return policy;
  }

  async setAutoDraftMode(orgId: string, actorId: string, enabled: boolean) {
    if (enabled && !(await this.isFlagEnabled('agent-autonomy', orgId))) {
      await this.setFlagForOrg('agent-autonomy', orgId, true);
    }
    await this.setFlagForOrg('agent-autonomy-auto-draft', orgId, enabled);
    await this.audit.log({
      organizationId: orgId,
      actorId,
      action: enabled
        ? 'agent-autonomy.mode-enabled'
        : 'agent-autonomy.mode-disabled',
      resourceType: 'FeatureFlag',
      resourceId: 'agent-autonomy-auto-draft',
      after: { enabled, externalWrites: 'human_confirmation_required' },
    });
    return this.getMode(orgId);
  }

  private async createAutoDraftFlow(input: {
    event: PlatformEvent;
    actorId: string;
    workspaceId?: string;
    title: string;
  }): Promise<NonNullable<ProductAutonomyResult['autoDraft']>> {
    const { event, actorId, workspaceId, title } = input;
    if (
      !(await this.isFlagEnabled('agent-autonomy', event.orgId)) ||
      !(await this.isFlagEnabled('agent-autonomy-auto-draft', event.orgId))
    ) {
      return { status: 'disabled' };
    }
    const killSwitch = await this.prisma.featureFlag.findUnique({
      where: { name: `agent-paused-${event.orgId}` },
      select: { enabled: true },
    });
    if (killSwitch?.enabled) {
      return { status: 'blocked_by_kill_switch' };
    }
    if (!workspaceId) {
      return { status: 'missing_workspace' };
    }

    const product = await this.tenantDatabase.run(event.orgId, (tx) =>
      tx.product.findFirst({
        where: {
          id: event.resourceId,
          workspaceId,
          workspace: { organizationId: event.orgId },
        },
        select: {
          id: true,
          title: true,
          workspaceId: true,
          workspace: { select: { marketplace: true, channelType: true } },
        },
      }),
    );
    if (!product) {
      return { status: 'product_not_found' };
    }

    const dedupeKey = `autonomy-draft:${event.type}:${event.resourceId}:${event.timestamp}`;
    const platform =
      product.workspace.marketplace ?? product.workspace.channelType;
    const steps = [
      {
        key: 'research',
        action: 'product.research',
        mode: 'automatic',
        productIds: [product.id],
        productId: product.id,
        workspaceId: product.workspaceId,
        query: product.title || title,
        platform,
      },
      {
        key: 'listing-draft',
        action: 'listing.draft',
        mode: 'automatic',
        dependsOn: ['research'],
        productId: product.id,
        productName: product.title || title,
        workspaceId: product.workspaceId,
        platform,
        tone: 'professional',
        requiresHumanApproval: true,
      },
    ];

    try {
      const flow = await this.tenantDatabase.run(event.orgId, (tx) =>
        tx.automationFlow.create({
          data: {
            organizationId: event.orgId,
            workspaceId: product.workspaceId,
            dedupeKey,
            name: `[L2草稿自主模式] ${product.title || title}`,
            description:
              '商品变化后自动执行真实商品调研并生成 Listing 草稿；不会发布或修改真实店铺。',
            status: 'ACTIVE',
            triggerType: 'SCHEDULE',
            triggerConfig: {
              source: 'agent_autonomy_auto_draft',
              once: true,
              repeat: false,
              eventType: event.type,
              eventTimestamp: event.timestamp,
              resourceType: event.resourceType,
              resourceId: event.resourceId,
              productId: product.id,
              productName: product.title || title,
              externalStoreMutation: 'not_executed',
            },
            steps: steps,
            nextRunAt: new Date(),
            createdBy: actorId,
          },
        }),
      );
      await this.audit.log({
        organizationId: event.orgId,
        actorId,
        action: 'agent-autonomy.auto-draft-flow-created',
        resourceType: 'AutomationFlow',
        resourceId: flow.id,
        after: {
          workspaceId: product.workspaceId,
          productId: product.id,
          dedupeKey,
          actions: ['product.research', 'listing.draft'],
          externalStoreMutation: 'not_executed',
        },
      });
      return { status: 'queued', flowId: flow.id, dedupeKey };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.tenantDatabase.run(event.orgId, (tx) =>
          tx.automationFlow.findUnique({
            where: {
              organizationId_dedupeKey: {
                organizationId: event.orgId,
                dedupeKey,
              },
            },
            select: { id: true },
          }),
        );
        if (existing) {
          return { status: 'deduplicated', flowId: existing.id, dedupeKey };
        }
      }
      throw error;
    }
  }

  private async isFlagEnabled(name: string, orgId: string): Promise<boolean> {
    const flag = await this.prisma.featureFlag.findUnique({ where: { name } });
    return Boolean(
      flag?.enabled &&
      (flag.orgIds.length === 0 || flag.orgIds.includes(orgId)),
    );
  }

  private async setFlagForOrg(
    name: string,
    orgId: string,
    enabled: boolean,
  ): Promise<void> {
    const current = await this.prisma.featureFlag.findUnique({
      where: { name },
    });
    const orgIds = new Set(current?.orgIds ?? []);
    if (enabled) orgIds.add(orgId);
    else orgIds.delete(orgId);
    const nextOrgIds = [...orgIds];
    await this.prisma.featureFlag.upsert({
      where: { name },
      create: { name, enabled: nextOrgIds.length > 0, orgIds: nextOrgIds },
      update: { enabled: nextOrgIds.length > 0, orgIds: nextOrgIds },
    });
  }

  async resolveActorForOrg(
    orgId: string,
    preferredActorId?: string,
  ): Promise<string> {
    if (preferredActorId) {
      const preferred = await this.tenantDatabase.run(orgId, (tx) =>
        tx.membership.findFirst({
          where: {
            organizationId: orgId,
            userId: preferredActorId,
            status: 'ACTIVE',
          },
          select: { userId: true },
        }),
      );
      if (preferred) {
        return preferred.userId;
      }
    }

    const membership = await this.tenantDatabase.run(orgId, (tx) =>
      tx.membership.findFirst({
        where: { organizationId: orgId, status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        select: { userId: true },
      }),
    );
    if (!membership) {
      throw new BadRequestException(
        'No active organization user available for agent-owned action',
      );
    }
    return membership.userId;
  }

  async pushSuggestion(input: {
    orgId: string;
    actorId?: string;
    workspaceId?: string;
    suggestion: Record<string, unknown>;
  }): Promise<{ notificationId: string; action: SuggestionAction }> {
    const actorId = await this.resolveActorForOrg(input.orgId, input.actorId);
    const suggestion = this.normalizeSuggestion(
      input.suggestion,
      input.workspaceId,
    );
    const proposalContext = this.compactJsonRecord({
      kind: 'agent_suggestion',
      priority: suggestion.priority,
      suggestion_score: suggestion.score,
      sourceEventType: suggestion.sourceEventType,
      sourceResourceType: suggestion.sourceResourceType,
      sourceResourceId: suggestion.sourceResourceId,
      estimated_effort: suggestion.estimatedEffort,
      estimated_benefit: suggestion.estimatedBenefit,
    });

    const { notification } = await this.actionProposals.create({
      organizationId: input.orgId,
      requestedBy: actorId,
      approverId: actorId,
      source: 'agent_autonomy',
      action: {
        label: suggestion.action.label,
        name: suggestion.action.action,
        params: suggestion.action.params,
      },
      type: 'SYSTEM',
      title: `智能体建议：${suggestion.title}`,
      body: suggestion.description,
      context: proposalContext,
    });

    await this.audit.log({
      organizationId: input.orgId,
      actorId,
      action: 'agent-autonomy.suggestion-created',
      resourceType: 'Notification',
      resourceId: notification.id,
      after: {
        title: suggestion.title,
        action: suggestion.action,
        score: suggestion.score,
      },
    });
    return { notificationId: notification.id, action: suggestion.action };
  }

  async scheduleSuggestion(input: ScheduleSuggestionInput): Promise<{
    taskId: string;
    flowId: string;
    dueAt: string;
  }> {
    const actorId = await this.resolveActorForOrg(input.orgId, input.actorId);
    const suggestion = this.normalizeSuggestion(
      input.suggestion,
      input.workspaceId,
    );
    const dueAt = input.dueAt ? new Date(input.dueAt) : this.nextWorkSlot();
    const productIds = this.normalizeProductIds(
      suggestion.action.params.productIds,
    );
    const steps = this.buildPreparationSteps(productIds);

    const task = await this.tenantDatabase.run(input.orgId, (tx) =>
      tx.teamTask.create({
        data: {
          organizationId: input.orgId,
          workspaceId: input.workspaceId,
          title: `[智能体工作队列] ${suggestion.title}`,
          description: suggestion.description,
          priority: this.toTaskPriority(suggestion.priority),
          dueAt,
          createdBy: actorId,
        },
      }),
    );

    const flow = await this.tenantDatabase.run(input.orgId, (tx) =>
      tx.automationFlow.create({
        data: {
          organizationId: input.orgId,
          workspaceId: input.workspaceId,
          name: `[智能体排程] ${suggestion.title}`,
          description: suggestion.description,
          status: 'ACTIVE',
          triggerType: 'SCHEDULE',
          triggerConfig: {
            source: 'agent_suggestion',
            dueAt: dueAt.toISOString(),
            score: suggestion.score,
          },
          steps: steps as Prisma.InputJsonValue,
          nextRunAt: dueAt,
          createdBy: actorId,
        },
      }),
    );

    await this.audit.log({
      organizationId: input.orgId,
      actorId,
      action: 'agent-autonomy.suggestion-scheduled',
      resourceType: 'AutomationFlow',
      resourceId: flow.id,
      after: {
        taskId: task.id,
        dueAt: dueAt.toISOString(),
        action: suggestion.action,
      },
    });

    return { taskId: task.id, flowId: flow.id, dueAt: dueAt.toISOString() };
  }

  async prepareListingBatch(input: PrepareListingBatchInput): Promise<{
    productCount: number;
    agentRunId: string;
    flowId: string;
    reviewNotificationId: string;
    publish: { status: 'pending_confirmation'; productIds: string[] };
  }> {
    const productIds = this.normalizeProductIds(input.productIds);
    if (productIds.length === 0) {
      throw new BadRequestException(
        'productIds must contain at least one product',
      );
    }

    const actorId = await this.resolveActorForOrg(input.orgId, input.actorId);
    const instruction = input.instruction ?? '准备所选商品的上架材料';
    const steps = this.buildPreparationSteps(productIds);

    if (!this.agentRuns) {
      throw new BadRequestException('Agent run service is unavailable');
    }
    const run = await this.agentRuns.create(
      { sub: actorId, email: '', orgId: input.orgId },
      {
        workspaceId: input.workspaceId,
        agentType: 'PLANNER',
        input: {
          goal: instruction,
          productIds,
          steps,
          publish: {
            status: 'pending_confirmation',
            reason: '外部平台发布必须由人工最终确认',
          },
        },
      },
    );

    const flow = await this.tenantDatabase.run(input.orgId, (tx) =>
      tx.automationFlow.create({
        data: {
          organizationId: input.orgId,
          workspaceId: input.workspaceId,
          name: `[操作员] 准备 ${productIds.length} 个商品上架`,
          description: instruction,
          status: 'ACTIVE',
          triggerType: 'MANUAL',
          triggerConfig: {
            source: 'operator',
            agentRunId: run.id,
            productIds,
          },
          steps: steps as Prisma.InputJsonValue,
          createdBy: actorId,
        },
      }),
    );

    const reviewNotification = await this.tenantDatabase.run(
      input.orgId,
      (tx) =>
        tx.notification.create({
          data: {
            organizationId: input.orgId,
            userId: actorId,
            type: 'APPROVAL_REQUIRED',
            title: `请审核已准备的上架批次（${productIds.length} 个商品）`,
            body:
              '智能体正在准备选品研究、文案、图片、利润检查和审核任务。' +
              '发布仍会等待人工确认。',
            metadata: {
              kind: 'operator_batch_review',
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

    await this.audit.log({
      organizationId: input.orgId,
      actorId,
      action: 'agent-autonomy.operator-batch-prepared',
      resourceType: 'AgentRun',
      resourceId: run.id,
      after: {
        productCount: productIds.length,
        flowId: flow.id,
        reviewNotificationId: reviewNotification.id,
        publishStatus: 'pending_confirmation',
      },
    });
    this.notificationEvents?.publishCreated(reviewNotification);

    return {
      productCount: productIds.length,
      agentRunId: run.id,
      flowId: flow.id,
      reviewNotificationId: reviewNotification.id,
      publish: { status: 'pending_confirmation', productIds },
    };
  }

  private normalizeSuggestion(
    rawSuggestion: Record<string, unknown>,
    workspaceId?: string,
  ): NormalizedSuggestion {
    const rawAction = this.asRecord(rawSuggestion.action);
    const params = this.asRecord(rawAction.params);
    if (workspaceId && params.workspaceId === undefined) {
      params.workspaceId = workspaceId;
    }

    const actionName =
      this.asOptionalString(rawAction.action) ??
      (this.asOptionalString(rawAction.route)?.includes('listing')
        ? 'operator.prepare_listing_batch'
        : 'task.schedule');

    return {
      title: this.asOptionalString(rawSuggestion.title) ?? '智能体建议',
      description:
        this.asOptionalString(rawSuggestion.description) ??
        this.asOptionalString(rawSuggestion.body) ??
        '智能体生成了一条主动建议。',
      priority: this.toAgentPriority(rawSuggestion.priority),
      score: this.asNumber(rawSuggestion.score, 60),
      sourceEventType: this.asOptionalString(rawSuggestion.sourceEventType),
      sourceResourceType: this.asOptionalString(
        rawSuggestion.sourceResourceType,
      ),
      sourceResourceId: this.asOptionalString(rawSuggestion.sourceResourceId),
      estimatedEffort: this.asOptionalString(rawSuggestion.estimatedEffort),
      estimatedBenefit: this.asOptionalString(rawSuggestion.estimatedBenefit),
      action: {
        label: this.asOptionalString(rawAction.label) ?? '执行',
        action: actionName,
        params,
      },
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

  private nextWorkSlot(now = new Date()): Date {
    const slot = new Date(now);
    if (slot.getHours() < 8) {
      slot.setHours(8, 30, 0, 0);
      return slot;
    }
    if (slot.getHours() >= 9 && slot.getHours() < 11) {
      slot.setHours(11, 5, 0, 0);
      return slot;
    }
    return new Date(slot.getTime() + 5 * 60 * 1000);
  }

  private normalizeProductIds(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => this.asOptionalString(item))
      .filter((item): item is string => !!item);
  }

  private toAgentPriority(value: unknown): AgentPriority {
    const raw = this.asOptionalString(value)?.toLowerCase();
    if (raw === 'urgent' || raw === 'high' || raw === 'low') {
      return raw;
    }
    return 'medium';
  }

  private toTaskPriority(priority: AgentPriority): TaskPriorityValue {
    switch (priority) {
      case 'urgent':
        return 'URGENT';
      case 'high':
        return 'HIGH';
      case 'low':
        return 'LOW';
      case 'medium':
      default:
        return 'MEDIUM';
    }
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

  private asNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : fallback;
  }

  private compactJsonRecord(
    value: Record<string, unknown>,
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(value).filter(([, item]) => item !== undefined),
    );
  }
}
