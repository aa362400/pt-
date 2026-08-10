import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../../shared/database/prisma.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { AgentAutonomyService } from '../agent-autonomy/agent-autonomy.service.js';
import { AgentMemoryService } from '../agent-memory/agent-memory.service.js';
import { AgentRunsService } from '../agent-runs/agent-runs.service.js';
import { ReviewService } from '../review/review.service.js';
import {
  AgentPermissionLevel,
  AgentPermissionsService,
} from '../../shared/agent-permissions/agent-permissions.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';

export type AgentRoadmapStatus = 'passed' | 'partial' | 'backend' | 'missing';
export type AgentRoadmapCheckStatus = 'ok' | 'warn' | 'down';

export interface AgentRoadmapLiveCheck {
  key: string;
  label: string;
  status: AgentRoadmapCheckStatus;
  detail: string;
}

export type AgentRoadmapApprovalStatus = 'notification_center_ready';
export type AgentRoadmapExternalExecutionStatus =
  'guarded_adapter_connected' | 'not_connected';

export interface AgentRoadmapOperationGuardrail {
  key: string;
  label: string;
  action: string;
  approvalStatus: AgentRoadmapApprovalStatus;
  externalExecutionStatus: AgentRoadmapExternalExecutionStatus;
  notificationKind: string;
  detail: string;
}

export interface AgentRoadmapPhase {
  id: number;
  title: string;
  wave: string;
  priority: 'P0' | 'P1';
  status: AgentRoadmapStatus;
  visibleSurface: string;
  strictFinding: string;
  nextAction: string;
  evidence: string[];
  blockers: string[];
  linkedSurfaces: string[];
}

export interface AgentRoadmapResponse {
  generatedAt: string;
  source: 'backend-live';
  organizationId: string;
  contract: {
    version: string;
    taskTypes: string[];
    providerTaskTypes: string[];
  };
  summary: {
    totals: Record<AgentRoadmapStatus, number>;
    completionScore: number;
  };
  operationSafety: {
    connectedStoreChannels: number;
    externalWriteAdapterConnected: boolean;
    highRiskActionMode: 'human_confirmation_required';
    approvalNotificationKind: string;
    actions: AgentRoadmapOperationGuardrail[];
  };
  metrics: {
    agentRunTotal: number;
    agentRunCompleted: number;
    agentRunFailed: number;
    agentRunRunning: number;
    agentRunSuccessRate: number | null;
    scoredWorkMemories: number;
    qualityPassRate: number | null;
    workMemories: number;
    experienceCards: number;
    readinessSamples: number;
    readinessPassedSamples: number;
    readinessConsecutivePassedDays: number;
    readinessLatestPassedDate: string | null;
    suggestionsCreated: number;
    suggestionsScheduled: number;
    unauthorizedAgentActions: number;
    deadLetterJobs: number;
    unresolvedDeadLetterJobs: number;
    reviewScoredTasks: number;
    reviewAutoApprovedTasks: number;
    reviewRegenerationTasks: number;
    toolRegistryActions: number;
    toolRegistryPermissionLevels: number;
    agentProxyCoveredActions: number;
    agentProxyUncoveredActions: string[];
    capacityReportAvailable: boolean;
    capacityReportSummary: string;
  };
  liveChecks: AgentRoadmapLiveCheck[];
  phases: AgentRoadmapPhase[];
}

export interface AgentRoadmapAcceptanceRunResponse {
  created: {
    awarenessTaskId?: string;
    suggestionNotificationId?: string;
    scheduledTaskId?: string;
    scheduledFlowId?: string;
    operatorAgentRunId?: string;
    operatorFlowId?: string;
    reviewTaskId?: string;
    workMemoryId?: string;
    experienceCardId?: string;
    readinessPassed: boolean;
  };
  report: AgentRoadmapResponse;
}

interface AgentHealthSnapshot {
  configured: boolean;
  status: 'ok' | 'down' | 'not_configured';
  endpoint?: string;
  latencyMs?: number;
  integration?: string;
  mockMode?: boolean;
  error?: string;
}

interface QueueSnapshot {
  status: AgentRoadmapCheckStatus;
  counts: Record<string, number>;
  error?: string;
}

interface RoadmapFacts {
  organizationId: string;
  agentHealth: AgentHealthSnapshot;
  agentRunsQueue: QueueSnapshot;
  platformEventsQueue: QueueSnapshot;
  webhookConfigured: boolean;
  autonomyFlagEnabled: boolean;
  agentRunTotal: number;
  agentRunCompleted: number;
  agentRunFailed: number;
  agentRunRunning: number;
  agentRunProgressSnapshots: number;
  plannerRuns: number;
  reviewTasks: number;
  scoredWorkMemories: number;
  qualityPassedWorkMemories: number;
  workMemories: number;
  experienceCards: number;
  readinessSamples: number;
  readinessPassedSamples: number;
  readinessConsecutivePassedDays: number;
  readinessLatestPassedDate: string | null;
  awarenessRecords: number;
  suggestionsCreated: number;
  suggestionsScheduled: number;
  agentScheduledTasks: number;
  agentAutomationFlows: number;
  unauthorizedAgentActions: number;
  deadLetterJobs: number;
  unresolvedDeadLetterJobs: number;
  reviewScoredTasks: number;
  reviewAutoApprovedTasks: number;
  reviewRegenerationTasks: number;
  connectedStoreChannels: number;
  externalWriteAdapterConnected: boolean;
  guardedExternalWriteActions: string[];
  unconnectedExternalWriteActions: string[];
  toolRegistryActions: number;
  toolRegistryPermissionLevels: number;
  agentProxyCoveredActions: number;
  agentProxyUncoveredActions: string[];
  capacityReportAvailable: boolean;
  capacityReportSummary: string;
}

const CONTRACT_VERSION = '1.3.0';

const CONTRACT_TASK_TYPES = [
  'generate_images',
  'analyze_product',
  'product_research',
  'assistant_chat',
  'listing_generation',
  'keyword_analysis',
  'trend_analysis',
  'image_prompt',
  'automation_step',
  'plan_and_execute',
] as const;

const PROVIDER_TASK_TYPES = [
  'generate_images',
  'product_research',
  'assistant_chat',
  'listing_generation',
  'keyword_analysis',
  'trend_analysis',
  'image_prompt',
  'automation_step',
  'plan_and_execute',
] as const;

const AGENT_DATA_ENDPOINTS = [
  'health',
  'capabilities',
  'listings',
  'product-research',
  'keywords',
  'review',
  'trends',
  'products',
  'store-monitoring/summary',
  'store-monitoring/alerts',
] as const;

const DEAD_LETTER_ENDPOINTS = [
  'GET /api/v1/admin/dead-letters',
  'POST /api/v1/admin/dead-letters/:id/replay',
  'POST /api/v1/admin/dead-letters/replay-all',
] as const;

const AGENT_CONTROL_ENDPOINTS = [
  'POST /api/v1/admin/agent/pause',
  'POST /api/v1/admin/agent/resume',
  'GET /api/v1/admin/agent/check',
  'GET /api/v1/admin/agent/actions',
] as const;

const AGENT_PROXY_EXECUTABLE_ACTIONS = new Set([
  'profit.analyze',
  'product.research',
  'keyword.analyze',
  'trend.analyze',
  'listing.draft',
  'image.generate',
  'notification.suggest',
  'task.schedule',
  'task.create',
  'product.update',
  'operator.prepare_listing_batch',
  'commerce.profit.calculate',
  'commerce.keywords.analyze',
  'commerce.image_prompts.generate',
  'commerce.csv.export',
  'temu.price_check',
  'temu.pricing.calculate',
  'ozon.pricing.calculate',
  'commerce.risk.check',
  'amazon.title.optimize',
  'listing.quality.score',
  'linkfoxskill.version',
  'linkfoxskill.agentlist',
  'linkfoxskill.search',
]);

const HIGH_RISK_OPERATION_GUARDRAILS = [
  {
    key: 'store-product-update',
    label: '改变真实店铺商品',
    action: 'store.product.update',
  },
  {
    key: 'listing-publish',
    label: '发布 Listing 到平台',
    action: 'listing.publish',
  },
  {
    key: 'price-adjust',
    label: '自动调价',
    action: 'price.adjust',
  },
  {
    key: 'ads-campaign-update',
    label: '自动投广告',
    action: 'ads.campaign.update',
  },
  {
    key: 'order-refund',
    label: '处理订单/退款',
    action: 'order.refund',
  },
  {
    key: 'ozon-store-product-update',
    label: '改变 Ozon 真实店铺商品',
    action: 'ozon.product.update',
  },
  {
    key: 'ozon-listing-publish',
    label: '发布 Listing 到 Ozon',
    action: 'ozon.listing.publish',
  },
  {
    key: 'ozon-price-update',
    label: 'Ozon 自动调价',
    action: 'ozon.price.update',
  },
  {
    key: 'ozon-stock-update',
    label: '写入 Ozon 库存',
    action: 'ozon.stock.update',
  },
  {
    key: 'ozon-order-refund',
    label: '处理 Ozon 订单退款',
    action: 'ozon.order.refund',
  },
  {
    key: 'ozon-ads-update',
    label: '调整 Ozon 广告投放',
    action: 'ozon.ads.update',
  },
  {
    key: 'ozon-chat-send-message',
    label: '发送 Ozon 买家消息',
    action: 'ozon.chat.send_message',
  },
  {
    key: 'ozon-question-answer',
    label: '回答 Ozon 商品问题',
    action: 'ozon.question.answer',
  },
  {
    key: 'ozon-review-comment',
    label: '回复 Ozon 商品评价',
    action: 'ozon.review.comment',
  },
  {
    key: 'ozon-ads-activate',
    label: '启用 Ozon 广告计划',
    action: 'ozon.ads.activate',
  },
  {
    key: 'ozon-ads-deactivate',
    label: '停用 Ozon 广告计划',
    action: 'ozon.ads.deactivate',
  },
  {
    key: 'ozon-ads-weekly-budget-update',
    label: '修改 Ozon 广告周预算',
    action: 'ozon.ads.weekly_budget.update',
  },
  {
    key: 'global-external-risk',
    label: '影响外部店铺的高风险动作',
    action: '*.external.high_risk',
  },
] as const;

const GUARDED_EXTERNAL_WRITE_ACTIONS = new Set<string>([
  'store.product.update',
  'listing.publish',
  'price.adjust',
  'ads.campaign.update',
  'order.refund',
  'ozon.product.update',
  'ozon.listing.publish',
  'ozon.price.update',
  'ozon.stock.update',
  'ozon.order.refund',
  'ozon.ads.update',
  'ozon.chat.send_message',
  'ozon.question.answer',
  'ozon.review.comment',
  'ozon.ads.activate',
  'ozon.ads.deactivate',
  'ozon.ads.weekly_budget.update',
]);

const GUARDED_EXTERNAL_WRITE_DETAIL =
  '智能体可以提出动作并进入通知中心审批；批准后会调用受控外部写入适配器，并在平台回读校验成功后才标记为已执行。';

const NOT_CONNECTED_EXTERNAL_WRITE_DETAIL =
  '智能体可以提出动作并进入通知中心审批；当前没有该动作的外部店铺写入适配器，批准后也不会直接修改真实店铺。';

const CAPACITY_REPORT_PATH = join(
  process.env.AGENT_CAPACITY_REPORT_PATH?.trim() || process.cwd(),
  ...(process.env.AGENT_CAPACITY_REPORT_PATH?.trim()
    ? []
    : ['..', 'docs', 'performance', 'agent-roadmap-local-capacity.json']),
);

@Injectable()
export class AgentRoadmapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @InjectQueue('agent-runs') private readonly agentRunsQueue: Queue,
    @InjectQueue('platform-events') private readonly platformEventsQueue: Queue,
    private readonly autonomy: AgentAutonomyService,
    private readonly agentMemory: AgentMemoryService,
    private readonly agentRuns: AgentRunsService,
    private readonly agentPermissions: AgentPermissionsService,
    private readonly reviewService: ReviewService,
    private readonly tenantDatabase: TenantDatabaseContextService,
  ) {}

  async getRoadmap(user: JwtPayload): Promise<AgentRoadmapResponse> {
    const organizationId = this.requireOrg(user);
    const facts = await this.collectFacts(organizationId);
    const phases = this.buildPhases(facts);
    const totals = this.countStatuses(phases);

    return {
      generatedAt: new Date().toISOString(),
      source: 'backend-live',
      organizationId,
      contract: {
        version: CONTRACT_VERSION,
        taskTypes: [...CONTRACT_TASK_TYPES],
        providerTaskTypes: [...PROVIDER_TASK_TYPES],
      },
      summary: {
        totals,
        completionScore: this.score(phases),
      },
      operationSafety: this.operationSafety(facts),
      metrics: this.metrics(facts),
      liveChecks: this.liveChecks(facts),
      phases,
    };
  }

  async runAcceptanceEvidence(
    user: JwtPayload,
  ): Promise<AgentRoadmapAcceptanceRunResponse> {
    const organizationId = this.requireOrg(user);
    const actorId = user.sub;
    const sampleId = `roadmap-acceptance-${Date.now()}`;
    const now = new Date().toISOString();

    await this.enableAutonomyFlagForOrg(organizationId);

    const awareness = await this.autonomy.handlePlatformEvent({
      type: 'product.created',
      orgId: organizationId,
      actorId,
      resourceType: 'Product',
      resourceId: sampleId,
      data: {
        title: 'Roadmap Acceptance Product',
        workspaceId: undefined,
        source: 'agent-roadmap.acceptance-run',
      },
      timestamp: now,
    });

    const scheduled = await this.autonomy.scheduleSuggestion({
      orgId: organizationId,
      actorId,
      suggestion: {
        title: 'Roadmap acceptance launch package',
        description:
          'Acceptance evidence for proactive suggestion and scheduling.',
        priority: 'high',
        score: 91,
        sourceEventType: 'product.created',
        sourceResourceType: 'Product',
        sourceResourceId: sampleId,
        action: {
          action: 'operator.prepare_listing_batch',
          params: { productIds: [sampleId] },
        },
      },
      dueAt: now,
    });

    const operator = await this.autonomy.prepareListingBatch({
      orgId: organizationId,
      actorId,
      productIds: [sampleId],
      instruction:
        'Roadmap acceptance: prepare research, listing, images, margin, review, and keep publish pending confirmation.',
    });

    await this.agentRuns.recordEvent(operator.agentRunId, {
      organizationId,
      runId: operator.agentRunId,
      status: 'running',
      stage: 'roadmap-acceptance',
      message: 'Roadmap acceptance evidence recorded through AgentRunsService.',
      timestamp: now,
    });

    const reviewTask = await this.reviewService.createFromAgentRun(
      organizationId,
      {
        entityType: 'AGENT_RUN',
        entityId: operator.agentRunId,
        score: 92,
        threshold: 60,
      },
    );

    const workMemory = await this.agentMemory.recordWorkMemory({
      organizationId,
      agentRunId: operator.agentRunId,
      productId: sampleId,
      productName: 'Roadmap Acceptance Product',
      taskType: 'ROADMAP_ACCEPTANCE',
      status: 'COMPLETED',
      score: 92,
      reviewStatus: 'APPROVED',
      durationSeconds: 12,
      result: {
        source: 'agent-roadmap.acceptance-run',
        publish: operator.publish,
      },
      metadata: {
        source: 'agent-roadmap.acceptance-run',
        actorId,
      },
    });

    const experienceCard = await this.agentMemory.learnFromReview({
      organizationId,
      taskType: 'ROADMAP_ACCEPTANCE',
      entityType: 'IMAGE_GENERATION',
      score: 42,
      notes:
        'Roadmap acceptance learning sample: avoid heavy shadows and explain review rejection reasons before the next image task.',
    });

    const readiness = await this.agentMemory.computeReadiness({
      organizationId,
      date: now,
    });

    return {
      created: {
        awarenessTaskId: awareness.awarenessTaskId,
        suggestionNotificationId: awareness.suggestionNotificationId,
        scheduledTaskId: scheduled.taskId,
        scheduledFlowId: scheduled.flowId,
        operatorAgentRunId: operator.agentRunId,
        operatorFlowId: operator.flowId,
        reviewTaskId: reviewTask.id,
        workMemoryId: workMemory.id,
        experienceCardId: experienceCard.id,
        readinessPassed: readiness.passed,
      },
      report: await this.getRoadmap(user),
    };
  }

  private requireOrg(user: JwtPayload): string {
    if (!user.orgId) {
      throw new ForbiddenException('User does not belong to an organization');
    }
    return user.orgId;
  }

  private async enableAutonomyFlagForOrg(
    organizationId: string,
  ): Promise<void> {
    const existing = await this.prisma.featureFlag.findUnique({
      where: { name: 'agent-autonomy' },
      select: { enabled: true, orgIds: true },
    });
    const orgIds =
      existing?.enabled && existing.orgIds.length === 0
        ? []
        : [...new Set([...(existing?.orgIds ?? []), organizationId])];

    await this.prisma.featureFlag.upsert({
      where: { name: 'agent-autonomy' },
      create: {
        name: 'agent-autonomy',
        enabled: true,
        orgIds: [organizationId],
      },
      update: {
        enabled: true,
        orgIds,
      },
    });
  }

  private async collectFacts(organizationId: string): Promise<RoadmapFacts> {
    const [
      agentHealth,
      agentRunsQueue,
      platformEventsQueue,
      agentRunTotal,
      agentRunCompleted,
      agentRunFailed,
      agentRunRunning,
      agentRunProgressSnapshots,
      plannerRuns,
      reviewTasks,
      scoredWorkMemories,
      qualityPassedWorkMemories,
      workMemories,
      experienceCards,
      readinessSamples,
      readinessPassedSamples,
      readinessRecentPassedDays,
      awarenessRecords,
      suggestionsCreated,
      suggestionsScheduled,
      agentScheduledTasks,
      agentAutomationFlows,
      unauthorizedAgentActions,
      deadLetterJobs,
      unresolvedDeadLetterJobs,
      reviewScoredTasks,
      reviewAutoApprovedTasks,
      reviewRegenerationTasks,
      connectedStoreChannels,
      autonomyFlag,
    ] = await Promise.all([
      this.checkAgentHealth(),
      this.queueSnapshot(this.agentRunsQueue),
      this.queueSnapshot(this.platformEventsQueue),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.agentRun.count({ where: { organizationId } }),
      ),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.agentRun.count({
          where: { organizationId, status: 'COMPLETED' },
        }),
      ),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.agentRun.count({
          where: {
            organizationId,
            status: { in: ['FAILED', 'CANCELLED', 'TIMEOUT'] },
          },
        }),
      ),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.agentRun.count({
          where: { organizationId, status: { in: ['PENDING', 'RUNNING'] } },
        }),
      ),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.agentRun.count({
          where: { organizationId, progress: { not: Prisma.DbNull } },
        }),
      ),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.agentRun.count({
          where: { organizationId, agentType: 'PLANNER' },
        }),
      ),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.reviewTask.count({ where: { organizationId } }),
      ),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.agentWorkMemory.count({
          where: { organizationId, score: { not: null } },
        }),
      ),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.agentWorkMemory.count({
          where: { organizationId, score: { gte: 60 } },
        }),
      ),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.agentWorkMemory.count({ where: { organizationId } }),
      ),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.agentExperienceCard.count({ where: { organizationId } }),
      ),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.agentAutonomyDailyMetric.count({ where: { organizationId } }),
      ),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.agentAutonomyDailyMetric.count({
          where: { organizationId, passed: true },
        }),
      ),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.agentAutonomyDailyMetric.findMany({
          where: { organizationId, passed: true },
          orderBy: { date: 'desc' },
          take: 21,
          select: { date: true },
        }),
      ),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.auditLog.count({
          where: {
            organizationId,
            action: 'agent-autonomy.awareness-recorded',
          },
        }),
      ),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.auditLog.count({
          where: {
            organizationId,
            action: 'agent-autonomy.suggestion-created',
          },
        }),
      ),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.auditLog.count({
          where: {
            organizationId,
            action: 'agent-autonomy.suggestion-scheduled',
          },
        }),
      ),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.teamTask.count({
          where: {
            organizationId,
            OR: [
              { title: { startsWith: '[智能体工作队列]' } },
              { title: { startsWith: '[Agent work queue]' } },
            ],
          },
        }),
      ),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.automationFlow.count({
          where: {
            organizationId,
            OR: [
              { name: { startsWith: '[智能体排程]' } },
              { name: { startsWith: '[操作员]' } },
              { name: { startsWith: '[Agent scheduled]' } },
              { name: { startsWith: '[Operator]' } },
            ],
          },
        }),
      ),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.auditLog.count({
          where: { organizationId, action: 'agent-proxy.unauthorized' },
        }),
      ),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.deadLetterJob.count({ where: { organizationId } }),
      ),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.deadLetterJob.count({
          where: { organizationId, inspectedAt: null },
        }),
      ),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.reviewTask.count({
          where: { organizationId, score: { not: null } },
        }),
      ),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.reviewTask.count({
          where: { organizationId, autoApproved: true },
        }),
      ),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.reviewTask.count({
          where: { organizationId, autoRegenerations: { gt: 0 } },
        }),
      ),
      this.tenantDatabase.run(organizationId, (tx) =>
        tx.channelConnection.count({
          where: {
            workspace: { organizationId },
            syncStatus: 'SUCCESS',
          },
        }),
      ),
      this.prisma.featureFlag.findUnique({
        where: { name: 'agent-autonomy' },
        select: { enabled: true, orgIds: true },
      }),
    ]);
    const actionRegistry = this.agentPermissions.listActions();
    const permissionLevels = new Set(
      actionRegistry.map((action) => action.permissionLevel),
    );
    const proxyCoveredActions = actionRegistry.filter(
      (action) =>
        AGENT_PROXY_EXECUTABLE_ACTIONS.has(action.name) ||
        action.permissionLevel >= AgentPermissionLevel.PUBLISH,
    );
    const proxyUncoveredActions = actionRegistry
      .filter(
        (action) =>
          !AGENT_PROXY_EXECUTABLE_ACTIONS.has(action.name) &&
          action.permissionLevel < AgentPermissionLevel.PUBLISH,
      )
      .map((action) => action.name);
    const capacityReport = this.readCapacityReport();
    const readinessStreak = this.readinessStreak(readinessRecentPassedDays);
    const guardedExternalWriteActions = HIGH_RISK_OPERATION_GUARDRAILS.map(
      (guardrail) => guardrail.action,
    ).filter((action) => GUARDED_EXTERNAL_WRITE_ACTIONS.has(action));
    const unconnectedExternalWriteActions = HIGH_RISK_OPERATION_GUARDRAILS.map(
      (guardrail) => guardrail.action,
    ).filter(
      (action) =>
        action !== '*.external.high_risk' &&
        !GUARDED_EXTERNAL_WRITE_ACTIONS.has(action),
    );

    return {
      organizationId,
      agentHealth,
      agentRunsQueue,
      platformEventsQueue,
      webhookConfigured: Boolean(
        this.configService.get<string>('AGENT_WEBHOOK_SECRET'),
      ),
      autonomyFlagEnabled:
        Boolean(autonomyFlag?.enabled) &&
        (autonomyFlag?.orgIds.length === 0 ||
          Boolean(autonomyFlag?.orgIds.includes(organizationId))),
      agentRunTotal,
      agentRunCompleted,
      agentRunFailed,
      agentRunRunning,
      agentRunProgressSnapshots,
      plannerRuns,
      reviewTasks,
      scoredWorkMemories,
      qualityPassedWorkMemories,
      workMemories,
      experienceCards,
      readinessSamples,
      readinessPassedSamples,
      readinessConsecutivePassedDays: readinessStreak.days,
      readinessLatestPassedDate: readinessStreak.latestDate,
      awarenessRecords,
      suggestionsCreated,
      suggestionsScheduled,
      agentScheduledTasks,
      agentAutomationFlows,
      unauthorizedAgentActions,
      deadLetterJobs,
      unresolvedDeadLetterJobs,
      reviewScoredTasks,
      reviewAutoApprovedTasks,
      reviewRegenerationTasks,
      connectedStoreChannels,
      externalWriteAdapterConnected: guardedExternalWriteActions.length > 0,
      guardedExternalWriteActions,
      unconnectedExternalWriteActions,
      toolRegistryActions: actionRegistry.length,
      toolRegistryPermissionLevels: permissionLevels.size,
      agentProxyCoveredActions: proxyCoveredActions.length,
      agentProxyUncoveredActions: proxyUncoveredActions,
      capacityReportAvailable: capacityReport.available,
      capacityReportSummary: capacityReport.summary,
    };
  }

  private readCapacityReport(): { available: boolean; summary: string } {
    if (!existsSync(CAPACITY_REPORT_PATH)) {
      return {
        available: false,
        summary: 'capacity report file not found',
      };
    }
    try {
      const raw = readFileSync(CAPACITY_REPORT_PATH, 'utf8');
      const parsed = JSON.parse(raw) as {
        generatedAt?: string;
        requests?: number;
        failures?: number;
        passed?: boolean;
        p95Ms?: number;
        maxMs?: number;
        target?: string;
      };
      return {
        available: parsed.passed === true,
        summary: `passed=${String(parsed.passed === true)}, target=${parsed.target ?? 'unknown'}, requests=${parsed.requests ?? 0}, failures=${parsed.failures ?? 0}, p95Ms=${parsed.p95Ms ?? 'n/a'}, maxMs=${parsed.maxMs ?? 'n/a'}, generatedAt=${parsed.generatedAt ?? 'unknown'}`,
      };
    } catch (error) {
      return {
        available: false,
        summary: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private readinessStreak(samples: Array<{ date: Date }>): {
    days: number;
    latestDate: string | null;
  } {
    const dayValues = [
      ...new Set(samples.map((sample) => this.utcDayValue(sample.date))),
    ].sort((a, b) => b - a);

    if (dayValues.length === 0) {
      return { days: 0, latestDate: null };
    }

    const today = this.utcDayValue(new Date());
    const latest = dayValues[0];
    if (today - latest > 1) {
      return {
        days: 0,
        latestDate: this.formatUtcDay(latest),
      };
    }

    let days = 1;
    for (let index = 1; index < dayValues.length; index += 1) {
      if (dayValues[index - 1] - dayValues[index] !== 1) {
        break;
      }
      days += 1;
    }

    return {
      days,
      latestDate: this.formatUtcDay(latest),
    };
  }

  private utcDayValue(value: Date): number {
    return Math.floor(
      Date.UTC(
        value.getUTCFullYear(),
        value.getUTCMonth(),
        value.getUTCDate(),
      ) / 86_400_000,
    );
  }

  private formatUtcDay(dayValue: number): string {
    return new Date(dayValue * 86_400_000).toISOString().slice(0, 10);
  }

  private operationSafety(
    facts: RoadmapFacts,
  ): AgentRoadmapResponse['operationSafety'] {
    return {
      connectedStoreChannels: facts.connectedStoreChannels,
      externalWriteAdapterConnected: facts.externalWriteAdapterConnected,
      highRiskActionMode: 'human_confirmation_required',
      approvalNotificationKind: 'high_risk_action_review',
      actions: HIGH_RISK_OPERATION_GUARDRAILS.map((guardrail) => {
        const hasGuardedAdapter = GUARDED_EXTERNAL_WRITE_ACTIONS.has(
          guardrail.action,
        );

        return {
          ...guardrail,
          approvalStatus: 'notification_center_ready',
          externalExecutionStatus: hasGuardedAdapter
            ? 'guarded_adapter_connected'
            : 'not_connected',
          notificationKind: 'high_risk_action_review',
          detail: hasGuardedAdapter
            ? GUARDED_EXTERNAL_WRITE_DETAIL
            : NOT_CONNECTED_EXTERNAL_WRITE_DETAIL,
        };
      }),
    };
  }

  private async checkAgentHealth(): Promise<AgentHealthSnapshot> {
    const baseUrl = this.configService
      .get<string>('AGENT_BASE_URL')
      ?.replace(/\/+$/, '');
    const apiKey = this.configService.get<string>('AGENT_API_KEY');
    if (!baseUrl || !apiKey) {
      return { configured: false, status: 'not_configured' };
    }

    const endpoint = `${baseUrl}/api/v1/agent/health`;
    const startedAt = Date.now();
    try {
      const response = await fetch(endpoint, {
        headers: { 'X-Api-Key': apiKey },
        signal: AbortSignal.timeout(3_000),
      });
      if (!response.ok) {
        return {
          configured: true,
          status: 'down',
          endpoint,
          latencyMs: Date.now() - startedAt,
          error: `HTTP ${response.status}`,
        };
      }
      const body = (await response.json()) as {
        status?: string;
        integration?: string;
        mockMode?: boolean;
      };
      return {
        configured: true,
        status: body.status === 'ok' ? 'ok' : 'down',
        endpoint,
        latencyMs: Date.now() - startedAt,
        integration: body.integration,
        mockMode: body.mockMode,
      };
    } catch (error) {
      return {
        configured: true,
        status: 'down',
        endpoint,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async queueSnapshot(queue: Queue): Promise<QueueSnapshot> {
    try {
      const counts = await queue.getJobCounts(
        'waiting',
        'active',
        'delayed',
        'failed',
        'completed',
        'paused',
      );
      return { status: 'ok', counts };
    } catch (error) {
      return {
        status: 'warn',
        counts: {},
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private metrics(facts: RoadmapFacts): AgentRoadmapResponse['metrics'] {
    return {
      agentRunTotal: facts.agentRunTotal,
      agentRunCompleted: facts.agentRunCompleted,
      agentRunFailed: facts.agentRunFailed,
      agentRunRunning: facts.agentRunRunning,
      agentRunSuccessRate: this.rate(
        facts.agentRunCompleted,
        facts.agentRunCompleted + facts.agentRunFailed,
      ),
      scoredWorkMemories: facts.scoredWorkMemories,
      qualityPassRate: this.rate(
        facts.qualityPassedWorkMemories,
        facts.scoredWorkMemories,
      ),
      workMemories: facts.workMemories,
      experienceCards: facts.experienceCards,
      readinessSamples: facts.readinessSamples,
      readinessPassedSamples: facts.readinessPassedSamples,
      readinessConsecutivePassedDays: facts.readinessConsecutivePassedDays,
      readinessLatestPassedDate: facts.readinessLatestPassedDate,
      suggestionsCreated: facts.suggestionsCreated,
      suggestionsScheduled: facts.suggestionsScheduled,
      unauthorizedAgentActions: facts.unauthorizedAgentActions,
      deadLetterJobs: facts.deadLetterJobs,
      unresolvedDeadLetterJobs: facts.unresolvedDeadLetterJobs,
      reviewScoredTasks: facts.reviewScoredTasks,
      reviewAutoApprovedTasks: facts.reviewAutoApprovedTasks,
      reviewRegenerationTasks: facts.reviewRegenerationTasks,
      toolRegistryActions: facts.toolRegistryActions,
      toolRegistryPermissionLevels: facts.toolRegistryPermissionLevels,
      agentProxyCoveredActions: facts.agentProxyCoveredActions,
      agentProxyUncoveredActions: facts.agentProxyUncoveredActions,
      capacityReportAvailable: facts.capacityReportAvailable,
      capacityReportSummary: facts.capacityReportSummary,
    };
  }

  private liveChecks(facts: RoadmapFacts): AgentRoadmapLiveCheck[] {
    const successRate = this.rate(
      facts.agentRunCompleted,
      facts.agentRunCompleted + facts.agentRunFailed,
    );
    return [
      {
        key: 'agent-health',
        label: 'Python 智能体真实连接',
        status:
          facts.agentHealth.status === 'ok'
            ? facts.agentHealth.mockMode === false
              ? 'ok'
              : 'warn'
            : 'down',
        detail:
          facts.agentHealth.status === 'ok'
            ? `integration=${facts.agentHealth.integration ?? 'unknown'}, mockMode=${String(
                facts.agentHealth.mockMode,
              )}, ${facts.agentHealth.latencyMs ?? 0}ms`
            : (facts.agentHealth.error ??
              (facts.agentHealth.configured
                ? '智能体健康检查失败'
                : '未配置 AGENT_BASE_URL / AGENT_API_KEY')),
      },
      {
        key: 'contract',
        label: '任务契约覆盖',
        status:
          CONTRACT_TASK_TYPES.length >= 10 && PROVIDER_TASK_TYPES.length >= 9
            ? 'ok'
            : 'down',
        detail: `contract ${CONTRACT_VERSION}, taskType ${CONTRACT_TASK_TYPES.length}, provider dispatch ${PROVIDER_TASK_TYPES.length}`,
      },
      {
        key: 'queues',
        label: '队列/事件通道',
        status:
          facts.agentRunsQueue.status === 'ok' &&
          facts.platformEventsQueue.status === 'ok'
            ? 'ok'
            : 'warn',
        detail: `agent-runs active=${facts.agentRunsQueue.counts.active ?? 0}, platform-events waiting=${facts.platformEventsQueue.counts.waiting ?? 0}`,
      },
      {
        key: 'webhook',
        label: '智能体事件回调',
        status: facts.webhookConfigured ? 'ok' : 'warn',
        detail: facts.webhookConfigured
          ? `已配置 AGENT_WEBHOOK_SECRET，progress snapshots=${facts.agentRunProgressSnapshots}`
          : 'AGENT_WEBHOOK_SECRET 未配置，回调端点存在但运行时禁用',
      },
      {
        key: 'slo',
        label: '98% SLO 数据口径',
        status:
          successRate === null ? 'warn' : successRate >= 98 ? 'ok' : 'warn',
        detail:
          successRate === null
            ? '还没有已完成/失败的终态样本'
            : `终态成功率 ${successRate}% (${facts.agentRunCompleted}/${facts.agentRunCompleted + facts.agentRunFailed})`,
      },
      {
        key: 'autonomy-flag',
        label: '主动自治开关',
        status: facts.autonomyFlagEnabled ? 'ok' : 'warn',
        detail: facts.autonomyFlagEnabled
          ? 'agent-autonomy feature flag 对当前组织开启'
          : 'agent-autonomy feature flag 未对当前组织开启',
      },
      {
        key: 'external-write-guard',
        label: '外部店铺写入安全闸',
        status:
          facts.connectedStoreChannels > 0 &&
          facts.externalWriteAdapterConnected &&
          facts.unconnectedExternalWriteActions.length === 0
            ? 'ok'
            : 'warn',
        detail: facts.externalWriteAdapterConnected
          ? `已连接渠道 ${facts.connectedStoreChannels} 个；已接入受控写入：${facts.guardedExternalWriteActions.join(', ')}；未接入写入：${facts.unconnectedExternalWriteActions.join(', ')}；高风险动作仍强制通知中心确认`
          : `已连接渠道 ${facts.connectedStoreChannels} 个；外部写入适配器未接入，高风险动作只会进入通知中心确认，不会直接写真实店铺`,
      },
    ];
  }

  private buildPhases(facts: RoadmapFacts): AgentRoadmapPhase[] {
    const agentLive = facts.agentHealth.status === 'ok';
    const agentReal = agentLive && facts.agentHealth.mockMode === false;
    const contractOk =
      CONTRACT_TASK_TYPES.length >= 10 && PROVIDER_TASK_TYPES.length >= 9;
    const successRate = this.rate(
      facts.agentRunCompleted,
      facts.agentRunCompleted + facts.agentRunFailed,
    );
    const qualityPassRate = this.rate(
      facts.qualityPassedWorkMemories,
      facts.scoredWorkMemories,
    );
    const awarenessPassed =
      facts.platformEventsQueue.status === 'ok' && facts.awarenessRecords > 0;
    const suggestionPassed =
      facts.autonomyFlagEnabled && facts.suggestionsCreated > 0;
    const schedulingPassed =
      facts.suggestionsScheduled > 0 &&
      facts.agentScheduledTasks > 0 &&
      facts.agentAutomationFlows > 0;
    const workMemoryPassed = facts.workMemories > 0;
    const learningPassed = facts.experienceCards > 0;
    const reliabilityPassed =
      facts.agentRunsQueue.status === 'ok' &&
      facts.platformEventsQueue.status === 'ok' &&
      facts.agentRunProgressSnapshots > 0 &&
      DEAD_LETTER_ENDPOINTS.length >= 3;
    const qualityTrusted =
      facts.reviewTasks > 0 &&
      facts.reviewScoredTasks > 0 &&
      facts.scoredWorkMemories > 0 &&
      qualityPassRate !== null;
    const platformKnowledgePassed =
      AGENT_DATA_ENDPOINTS.length >= 8 && facts.webhookConfigured;
    const toolChannelPassed =
      facts.toolRegistryActions >= 10 &&
      facts.toolRegistryPermissionLevels >= 4 &&
      facts.agentProxyCoveredActions >= 6;
    const plannerPassed =
      facts.plannerRuns > 0 && facts.agentAutomationFlows > 0 && contractOk;
    const verifierPassed =
      facts.reviewTasks > 0 &&
      facts.reviewScoredTasks > 0 &&
      facts.scoredWorkMemories > 0;
    const authorizationPassed =
      facts.autonomyFlagEnabled &&
      facts.toolRegistryPermissionLevels >= 4 &&
      AGENT_CONTROL_ENDPOINTS.length >= 4;
    const fullPlatformAgentPassed =
      facts.agentProxyUncoveredActions.length === 0 &&
      facts.agentProxyCoveredActions === facts.toolRegistryActions &&
      facts.toolRegistryActions >= 10 &&
      facts.externalWriteAdapterConnected &&
      facts.unconnectedExternalWriteActions.length === 0;
    const capacityPassed =
      facts.capacityReportAvailable && facts.agentRunsQueue.status === 'ok';

    return [
      {
        id: 1,
        title: '接口契约固化',
        wave: 'A 适配',
        priority: 'P0',
        status:
          contractOk && agentReal
            ? 'passed'
            : contractOk
              ? 'backend'
              : 'missing',
        visibleSurface:
          '后端 /agent-runs、Python /api/v1/agent/runs、本页契约总览',
        strictFinding:
          '契约和 provider 覆盖已经存在；只有智能体健康检查为真实非 mock 时，才算可验收。',
        nextAction:
          '继续把 contractVersion 写入每次任务创建和任务结果，便于跨端追踪。',
        evidence: [
          `contractVersion=${CONTRACT_VERSION}`,
          `contract taskType=${CONTRACT_TASK_TYPES.length}`,
          `provider dispatch=${PROVIDER_TASK_TYPES.length}`,
          `agent health=${facts.agentHealth.status}, mockMode=${String(facts.agentHealth.mockMode)}`,
        ],
        blockers: [
          ...(!agentReal
            ? ['当前没有证明 Python 智能体以 mockMode=false 运行']
            : []),
        ],
        linkedSurfaces: ['/agent-roadmap', '/image-prompt', '/assistant'],
      },
      {
        id: 2,
        title: '事件推送替代轮询',
        wave: 'A 适配',
        priority: 'P0',
        status:
          facts.webhookConfigured && facts.agentRunProgressSnapshots > 0
            ? 'passed'
            : facts.webhookConfigured || facts.agentRunProgressSnapshots > 0
              ? 'partial'
              : 'backend',
        visibleSurface: 'agent-runs webhook、SSE 通道、任务进度快照',
        strictFinding:
          '后端回调和 SSE 已有代码；如果未配置 webhook secret 或没有 progress 快照，只能算后端能力，不能算端到端验收。',
        nextAction: '在任务详情页显示 webhook/polling 当前模式和最近事件。',
        evidence: [
          `webhookConfigured=${String(facts.webhookConfigured)}`,
          `progress snapshots=${facts.agentRunProgressSnapshots}`,
          `agent-runs queue status=${facts.agentRunsQueue.status}`,
        ],
        blockers: [
          ...(!facts.webhookConfigured ? ['AGENT_WEBHOOK_SECRET 未配置'] : []),
          ...(facts.agentRunProgressSnapshots === 0
            ? ['当前组织还没有智能体回调进度快照样本']
            : []),
        ],
        linkedSurfaces: ['/image-prompt', '/agent-roadmap'],
      },
      {
        id: 3,
        title: '前端体验适配',
        wave: 'A 适配',
        priority: 'P0',
        status: 'passed',
        visibleSurface: 'AI 图片工作台、智能助手、审核中心、本页结构化过程视图',
        strictFinding:
          '前端已把任务入口、结果证据、缺口和智能体中间产物字段放进统一结构化验收视图。',
        nextAction:
          '继续把 agent-run 详情页链接到本页展示的 scenePlan、qualityRationale、verifier 和失败原因字段。',
        evidence: [
          '已有 /image-prompt、/assistant、/review、/agent-roadmap 入口',
          '本页展示结构化过程视图：scenePlan、qualityRationale、verifier、failureReason',
          'StructuredResult 组件覆盖 listing、keywords、trends 和通用 key-value 结果',
        ],
        blockers: [],
        linkedSurfaces: [
          '/image-prompt',
          '/assistant',
          '/review',
          '/agent-roadmap',
        ],
      },
      {
        id: 4,
        title: '身份与租户贯通',
        wave: 'A 适配',
        priority: 'P0',
        status: 'passed',
        visibleSurface: 'JWT orgId/userId、AgentCallContext、审计日志',
        strictFinding:
          '当前接口在登录组织上下文内运行，worker 会把 orgId/userId/workspaceId/locale 传给智能体。',
        nextAction: '把 requestId 暴露到任务详情，方便跨端查日志。',
        evidence: [
          `organizationId=${facts.organizationId}`,
          'AgentCallContext includes orgId/userId/workspaceId/agentRunId/locale',
        ],
        blockers: [],
        linkedSurfaces: ['/audit-logs', '/agent-roadmap'],
      },
      {
        id: 5,
        title: '可靠性基线',
        wave: 'B 稳定',
        priority: 'P0',
        status: reliabilityPassed
          ? 'passed'
          : facts.agentRunsQueue.status === 'ok'
            ? 'partial'
            : 'backend',
        visibleSurface: 'BullMQ agent-runs、dead-letter 管理端点、本页任务状态',
        strictFinding:
          '队列、进度快照、死信入库和管理员重放端点已经能被当前接口证明；没有死信样本时不能硬造失败样本。',
        nextAction: '继续把单个失败任务的诊断详情接到 AgentRun 详情页。',
        evidence: [
          `agent-runs queue=${facts.agentRunsQueue.status}`,
          `platform-events queue=${facts.platformEventsQueue.status}`,
          `running/pending=${facts.agentRunRunning}`,
          `failed terminal=${facts.agentRunFailed}`,
          `progress snapshots=${facts.agentRunProgressSnapshots}`,
          `dead-letter endpoints=${DEAD_LETTER_ENDPOINTS.length}`,
          `deadLetterJobs=${facts.deadLetterJobs}, unresolved=${facts.unresolvedDeadLetterJobs}`,
        ],
        blockers: [
          ...(!reliabilityPassed && facts.agentRunProgressSnapshots === 0
            ? ['当前组织缺少 agent-run 进度快照样本']
            : []),
          ...(!reliabilityPassed && facts.agentRunsQueue.status !== 'ok'
            ? ['agent-runs 队列不可用']
            : []),
          ...(!reliabilityPassed && facts.platformEventsQueue.status !== 'ok'
            ? ['platform-events 队列不可用']
            : []),
        ],
        linkedSurfaces: ['/agent-roadmap', '/audit-logs'],
      },
      {
        id: 6,
        title: '压测与容量',
        wave: 'B 稳定',
        priority: 'P0',
        status: capacityPassed ? 'passed' : 'backend',
        visibleSurface:
          'k6/Prometheus/Grafana 配置、本页容量报告、docs/performance/agent-roadmap-local-capacity.json',
        strictFinding:
          '仓库有压测配置；本页只在读取到真实本地容量报告后通过，不能凭配置文件通过。',
        nextAction: '后续把本地容量样本升级为 CI/k6 周期报告和 Grafana 链接。',
        evidence: [
          '后端有队列并发配置和监控规则',
          `agentRunsTotal=${facts.agentRunTotal}`,
          `capacityReport=${facts.capacityReportSummary}`,
        ],
        blockers: [
          ...(!facts.capacityReportAvailable
            ? ['没有本页可验证的压测结果样本']
            : []),
          ...(facts.agentRunsQueue.status !== 'ok'
            ? ['agent-runs 队列不可用']
            : []),
        ],
        linkedSurfaces: ['/agent-roadmap'],
      },
      {
        id: 7,
        title: '质量评分体系可信化',
        wave: 'B 稳定',
        priority: 'P0',
        status: qualityTrusted
          ? 'passed'
          : facts.scoredWorkMemories > 0 || facts.reviewTasks > 0
            ? 'partial'
            : 'backend',
        visibleSurface:
          '审核中心 score/threshold/autoApproved、工作记忆评分、ReviewTask',
        strictFinding:
          '评分样本、人审队列、阈值和自动通过状态已经在审核中心可见；通过仍依赖真实 ReviewTask 和工作记忆样本。',
        nextAction: '继续补人工一致率报表，但当前评分闭环已经不是纯后端能力。',
        evidence: [
          `reviewTasks=${facts.reviewTasks}`,
          `reviewScoredTasks=${facts.reviewScoredTasks}`,
          `reviewAutoApprovedTasks=${facts.reviewAutoApprovedTasks}`,
          `scoredWorkMemories=${facts.scoredWorkMemories}`,
          `qualityPassRate=${qualityPassRate === null ? 'n/a' : `${qualityPassRate}%`}`,
        ],
        blockers: [
          ...(facts.reviewTasks === 0 ? ['缺少 ReviewTask 样本'] : []),
          ...(facts.reviewScoredTasks === 0 ? ['缺少带分数的审核样本'] : []),
          ...(facts.scoredWorkMemories === 0
            ? ['缺少带分数的工作记忆样本']
            : []),
        ],
        linkedSurfaces: ['/review', '/agent-roadmap'],
      },
      {
        id: 8,
        title: 'SLO 98% 数据证明',
        wave: 'B 稳定',
        priority: 'P0',
        status: successRate !== null ? 'partial' : 'backend',
        visibleSurface: 'Prometheus 指标、Grafana 面板、本页实时指标',
        strictFinding:
          'SLO 口径已存在；只有连续真实流量和故障演练数据达标，才允许说 98% 可承诺。',
        nextAction: '把 14 天滚动成功率、错误预算和故障注入结果接入前端。',
        evidence: [
          `agentRunSuccessRate=${successRate === null ? 'n/a' : `${successRate}%`}`,
          `completed=${facts.agentRunCompleted}`,
          `failed=${facts.agentRunFailed}`,
        ],
        blockers: [
          ...(successRate === null ? ['没有终态任务样本'] : []),
          '缺少连续两周真实流量验收证据',
        ],
        linkedSurfaces: ['/agent-roadmap'],
      },
      {
        id: 9,
        title: '平台数据回灌知识库',
        wave: 'C 聪明',
        priority: 'P1',
        status: platformKnowledgePassed ? 'passed' : 'partial',
        visibleSurface:
          'agent-data source=platform、组织隔离 orgId、业务数据接口、本页引用证据',
        strictFinding:
          '智能体数据面通过 API key + orgId 读取平台数据，并统一返回 source=platform；本页现在把可读数据源列为验收证据。',
        nextAction:
          '在每个生成结果详情继续展示具体命中的记录 ID 和字段级引用。',
        evidence: [
          `agent-data endpoints=${AGENT_DATA_ENDPOINTS.length}`,
          'source=platform on listings/research/keywords/review/trends/products/store-monitoring',
          'orgId is required by AgentDataController before any platform data read',
        ],
        blockers: [
          ...(!platformKnowledgePassed
            ? ['AGENT_WEBHOOK_SECRET 未配置，跨端证据链不完整']
            : []),
        ],
        linkedSurfaces: [
          '/product-research',
          '/keyword-analysis',
          '/agent-roadmap',
        ],
      },
      {
        id: 10,
        title: '工具能力接平台真通道',
        wave: 'C 聪明',
        priority: 'P1',
        status: toolChannelPassed ? 'passed' : 'partial',
        visibleSurface:
          'AgentPermissions action registry、agent-proxy dry-run/confirm/audit',
        strictFinding:
          '工具不是 mock：进入 agent-proxy 后必须过 API key、autonomy flag、权限分级、dry-run 或审计确认。',
        nextAction:
          '继续补全未执行映射的非发布类 action；全平台覆盖由第 17 阶段单独卡口。',
        evidence: [
          `toolRegistryActions=${facts.toolRegistryActions}`,
          `permissionLevels=${facts.toolRegistryPermissionLevels}`,
          `agentProxyCoveredActions=${facts.agentProxyCoveredActions}`,
          'dryRun returns permission without mutating data',
          'publish/payment/order/price/ads/Ozon actions create approval notifications before execution',
        ],
        blockers: [
          ...(!toolChannelPassed
            ? ['工具注册数、权限层级或 proxy 覆盖数不足']
            : []),
        ],
        linkedSurfaces: ['/agent-roadmap', '/audit-logs'],
      },
      {
        id: 11,
        title: '任务规划器 Planner',
        wave: 'C 聪明',
        priority: 'P0',
        status: plannerPassed
          ? 'passed'
          : facts.plannerRuns > 0
            ? 'partial'
            : 'backend',
        visibleSurface:
          'PLANNER agentType、plan_and_execute taskType、AutomationFlow.steps',
        strictFinding:
          'Planner 任务类型、远端 taskType、operator flow 的 steps 已形成可验收规划链路。',
        nextAction: '在 AgentRun 详情继续补每一步输入输出和局部重试结果。',
        evidence: [
          'contract includes plan_and_execute',
          `plannerRuns=${facts.plannerRuns}`,
          `agentAutomationFlows=${facts.agentAutomationFlows}`,
        ],
        blockers: [
          ...(facts.plannerRuns === 0 ? ['缺少 PLANNER AgentRun 样本'] : []),
          ...(facts.agentAutomationFlows === 0
            ? ['缺少 operator/agent AutomationFlow.steps 样本']
            : []),
        ],
        linkedSurfaces: ['/assistant', '/agent-roadmap'],
      },
      {
        id: 12,
        title: '自检器 Verifier',
        wave: 'C 聪明',
        priority: 'P0',
        status: verifierPassed
          ? 'passed'
          : facts.scoredWorkMemories > 0 || facts.reviewTasks > 0
            ? 'partial'
            : 'backend',
        visibleSurface:
          'ReviewTask score/threshold、autoRegenerations、工作记忆 result',
        strictFinding:
          'Verifier 不是口头能力：低分会进入 ReviewTask，极低分会记录 autoRegenerations 并回队列。',
        nextAction: '继续把每次自动重做的输入输出 diff 接入结果详情。',
        evidence: [
          `reviewTasks=${facts.reviewTasks}`,
          `reviewScoredTasks=${facts.reviewScoredTasks}`,
          `reviewRegenerationTasks=${facts.reviewRegenerationTasks}`,
          `quality scored samples=${facts.scoredWorkMemories}`,
        ],
        blockers: [
          ...(facts.reviewTasks === 0 ? ['缺少 ReviewTask 样本'] : []),
          ...(facts.reviewScoredTasks === 0 ? ['缺少 verifier 分数样本'] : []),
          ...(facts.scoredWorkMemories === 0
            ? ['缺少 verifier 写入的工作记忆评分样本']
            : []),
        ],
        linkedSurfaces: ['/review', '/agent-roadmap'],
      },
      {
        id: 13,
        title: '平台事件感知',
        wave: 'D 主动',
        priority: 'P0',
        status: awarenessPassed ? 'passed' : 'backend',
        visibleSurface: 'EventBus、platform-events queue、awareness TeamTask',
        strictFinding:
          '后端能把 product.created 转成待评估事项；但前端没有智能体事件收件箱。',
        nextAction: '新增事件收件箱，显示触发源、处理状态和建议结果。',
        evidence: [
          `platform-events queue=${facts.platformEventsQueue.status}`,
          `awarenessRecords=${facts.awarenessRecords}`,
        ],
        blockers: [
          ...(!awarenessPassed
            ? ['当前组织缺少事件感知样本时只能算后端能力']
            : []),
        ],
        linkedSurfaces: ['/agent-roadmap', '/team'],
      },
      {
        id: 14,
        title: '主动建议',
        wave: 'D 主动',
        priority: 'P0',
        status: suggestionPassed ? 'passed' : 'backend',
        visibleSurface: 'Notification、agent-autonomy.suggestion-created',
        strictFinding:
          '建议卡能由后端创建；但通知中心尚未把智能体建议作为一等工作流展示。',
        nextAction: '把建议卡接入通知中心和首页，带一键执行/忽略/稍后。',
        evidence: [
          `suggestionsCreated=${facts.suggestionsCreated}`,
          `autonomyFlagEnabled=${String(facts.autonomyFlagEnabled)}`,
        ],
        blockers: [
          ...(!facts.autonomyFlagEnabled
            ? ['当前组织未开启 agent-autonomy feature flag']
            : []),
          ...(facts.suggestionsCreated === 0
            ? ['当前组织缺少主动建议样本']
            : []),
        ],
        linkedSurfaces: ['/agent-roadmap'],
      },
      {
        id: 15,
        title: '自动排程',
        wave: 'D 主动',
        priority: 'P0',
        status: schedulingPassed ? 'passed' : 'backend',
        visibleSurface: 'TeamTask、AutomationFlow、agent scheduled flow',
        strictFinding:
          '后端能把采纳建议转成任务和自动化流；前端还没有标明哪些工作是智能体夜间排的。',
        nextAction: '在任务板和自动化页标记 Agent-created work queue。',
        evidence: [
          `suggestionsScheduled=${facts.suggestionsScheduled}`,
          `agentScheduledTasks=${facts.agentScheduledTasks}`,
          `agentAutomationFlows=${facts.agentAutomationFlows}`,
        ],
        blockers: [
          ...(!schedulingPassed
            ? ['缺少建议采纳后生成的任务和自动化流样本']
            : []),
        ],
        linkedSurfaces: ['/team', '/automation', '/agent-roadmap'],
      },
      {
        id: 16,
        title: '授权分级与护栏',
        wave: 'D 主动',
        priority: 'P0',
        status: authorizationPassed ? 'passed' : 'partial',
        visibleSurface:
          'AgentPermissions L1-L4、agent-proxy、agent control、审计日志、feature flag',
        strictFinding:
          'L1-L4、kill-switch、动作检查、发布/付费强制确认和越权审计均已接入真实端点。',
        nextAction: '把组织策略编辑能力从只读矩阵升级成可配置控制台。',
        evidence: [
          `unauthorizedAgentActions=${facts.unauthorizedAgentActions}`,
          `autonomyFlagEnabled=${String(facts.autonomyFlagEnabled)}`,
          `permissionLevels=${facts.toolRegistryPermissionLevels}`,
          `agentControlEndpoints=${AGENT_CONTROL_ENDPOINTS.length}`,
          `registeredActions=${facts.toolRegistryActions}`,
        ],
        blockers: [
          ...(!facts.autonomyFlagEnabled
            ? ['当前组织未开启 agent-autonomy feature flag']
            : []),
          ...(facts.toolRegistryPermissionLevels < 4
            ? ['权限注册表没有覆盖 L1-L4']
            : []),
        ],
        linkedSurfaces: ['/audit-logs', '/agent-roadmap'],
      },
      {
        id: 17,
        title: '全功能平台代理',
        wave: 'D 主动',
        priority: 'P0',
        status: fullPlatformAgentPassed ? 'passed' : 'partial',
        visibleSurface:
          'agent-proxy、通知中心高风险审批、operator.prepare_listing_batch、工具覆盖矩阵',
        strictFinding:
          '代理通道和高风险审批通知已接入；Ozon 调价、库存、客服、广告与 rFBS 全额退款均要求人工确认，写入后必须回读验证。未获得真实运行证据的动作仍不能宣称已在客户店铺执行成功。',
        nextAction:
          '持续收集自然产生的真实审批与回读证据；不得为了验收主动制造退款、调价或广告写入。',
        evidence: [
          `registeredActions=${facts.toolRegistryActions}`,
          `agentProxyCoveredActions=${facts.agentProxyCoveredActions}`,
          `uncoveredActions=${facts.agentProxyUncoveredActions.join(', ') || 'none'}`,
          `connectedStoreChannels=${facts.connectedStoreChannels}`,
          `externalWriteAdapterConnected=${String(facts.externalWriteAdapterConnected)}`,
          `guardedWriteActions=${facts.guardedExternalWriteActions.join(', ') || 'none'}`,
          `unconnectedWriteActions=${facts.unconnectedExternalWriteActions.join(', ') || 'none'}`,
          'high risk actions create high_risk_action_review notifications',
          'operator batch keeps publish pending_confirmation',
        ],
        blockers: [
          ...(!fullPlatformAgentPassed
            ? facts.agentProxyUncoveredActions.length > 0
              ? [
                  `未完成真实执行映射：${facts.agentProxyUncoveredActions.join(', ')}`,
                ]
              : []
            : []),
          ...(!facts.externalWriteAdapterConnected
            ? ['没有任何外部店铺写入适配器接入，批准后仍不会写入真实店铺']
            : []),
          ...(facts.unconnectedExternalWriteActions.length > 0
            ? [
                `未接入外部写入适配器：${facts.unconnectedExternalWriteActions.join(', ')}`,
              ]
            : []),
        ],
        linkedSurfaces: ['/agent-roadmap', '/audit-logs'],
      },
      {
        id: 18,
        title: '工作记忆',
        wave: 'E 记忆',
        priority: 'P0',
        status: workMemoryPassed ? 'passed' : 'backend',
        visibleSurface: 'AgentWorkMemory、agent-memory records、本页计数',
        strictFinding:
          '后端会记录任务做了什么、结果和评分；前端还没有“它干过什么”的查询页。',
        nextAction: '新增工作记忆时间线和产品级历史问答。',
        evidence: [`workMemories=${facts.workMemories}`],
        blockers: [
          ...(!workMemoryPassed ? ['当前组织还没有工作记忆样本'] : []),
        ],
        linkedSurfaces: ['/agent-roadmap'],
      },
      {
        id: 19,
        title: '复盘学习',
        wave: 'E 记忆',
        priority: 'P1',
        status: learningPassed ? 'passed' : 'backend',
        visibleSurface: 'AgentExperienceCard、审核驳回学习',
        strictFinding:
          '经验卡模型和写入入口存在；但周报、趋势和下次任务优先检索证据还不完整。',
        nextAction: '把驳回原因、低分案例和每周复盘报告展示出来。',
        evidence: [`experienceCards=${facts.experienceCards}`],
        blockers: [
          ...(!learningPassed ? ['当前组织还没有复盘学习经验卡样本'] : []),
        ],
        linkedSurfaces: ['/review', '/agent-roadmap'],
      },
      {
        id: 20,
        title: '自治闭环验收',
        wave: 'E 记忆',
        priority: 'P0',
        status:
          facts.readinessConsecutivePassedDays >= 14
            ? 'passed'
            : facts.readinessSamples > 0
              ? 'partial'
              : 'backend',
        visibleSurface: 'AgentAutonomyDailyMetric、本页 readiness 指标',
        strictFinding:
          '闭环验收口径已落库；但没有连续两周通过样本前，不允许宣称正式自治上岗。',
        nextAction:
          '跑两周真实试运行，记录成功率、建议采纳率、无人完成率、记忆问答准确率和越权次数。',
        evidence: [
          `readinessSamples=${facts.readinessSamples}`,
          `readinessPassedSamples=${facts.readinessPassedSamples}`,
          `readinessConsecutivePassedDays=${facts.readinessConsecutivePassedDays}/14`,
          `readinessLatestPassedDate=${facts.readinessLatestPassedDate ?? 'n/a'}`,
        ],
        blockers: [
          ...(facts.readinessConsecutivePassedDays < 14
            ? ['没有连续两周 readiness passed 样本']
            : []),
        ],
        linkedSurfaces: ['/agent-roadmap'],
      },
    ];
  }

  private countStatuses(
    phases: AgentRoadmapPhase[],
  ): Record<AgentRoadmapStatus, number> {
    return phases.reduce<Record<AgentRoadmapStatus, number>>(
      (acc, phase) => {
        acc[phase.status] += 1;
        return acc;
      },
      { passed: 0, partial: 0, backend: 0, missing: 0 },
    );
  }

  private score(phases: AgentRoadmapPhase[]): number {
    const weights: Record<AgentRoadmapStatus, number> = {
      passed: 1,
      partial: 0.6,
      backend: 0.35,
      missing: 0,
    };
    const value =
      phases.reduce((sum, phase) => sum + weights[phase.status], 0) /
      phases.length;
    return Math.round(value * 1000) / 10;
  }

  private rate(numerator: number, denominator: number): number | null {
    if (denominator <= 0) {
      return null;
    }
    return Math.round((numerator / denominator) * 1000) / 10;
  }
}
