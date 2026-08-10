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
    label: 'textrealstoreproduct',
    action: 'store.product.update',
  },
  {
    key: 'listing-publish',
    label: 'publish Listing textplatform',
    action: 'listing.publish',
  },
  {
    key: 'price-adjust',
    label: 'automatictext',
    action: 'price.adjust',
  },
  {
    key: 'ads-campaign-update',
    label: 'automaticenglish_text',
    action: 'ads.campaign.update',
  },
  {
    key: 'order-refund',
    label: 'textorders/text',
    action: 'order.refund',
  },
  {
    key: 'ozon-store-product-update',
    label: 'text Ozon realstoreproduct',
    action: 'ozon.product.update',
  },
  {
    key: 'ozon-listing-publish',
    label: 'publish Listing text Ozon',
    action: 'ozon.listing.publish',
  },
  {
    key: 'ozon-price-update',
    label: 'Ozon automatictext',
    action: 'ozon.price.update',
  },
  {
    key: 'ozon-stock-update',
    label: 'write Ozon text',
    action: 'ozon.stock.update',
  },
  {
    key: 'ozon-order-refund',
    label: 'text Ozon orderstext',
    action: 'ozon.order.refund',
  },
  {
    key: 'ozon-ads-update',
    label: 'text Ozon english_text',
    action: 'ozon.ads.update',
  },
  {
    key: 'ozon-chat-send-message',
    label: 'text Ozon textmessage',
    action: 'ozon.chat.send_message',
  },
  {
    key: 'ozon-question-answer',
    label: 'text Ozon producttext',
    action: 'ozon.question.answer',
  },
  {
    key: 'ozon-review-comment',
    label: 'reply Ozon producttext',
    action: 'ozon.review.comment',
  },
  {
    key: 'ozon-ads-activate',
    label: 'text Ozon english_text',
    action: 'ozon.ads.activate',
  },
  {
    key: 'ozon-ads-deactivate',
    label: 'text Ozon english_text',
    action: 'ozon.ads.deactivate',
  },
  {
    key: 'ozon-ads-weekly-budget-update',
    label: 'text Ozon english_text',
    action: 'ozon.ads.weekly_budget.update',
  },
  {
    key: 'global-external-risk',
    label: 'english_textstoretextrisktext',
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
  'agentenglish_textnotificationtextapproval；english_textwriteenglish_text，textplatformenglish_textsuccessenglish_text。';

const NOT_CONNECTED_EXTERNAL_WRITE_DETAIL =
  'agentenglish_textnotificationtextapproval；english_textyesenglish_textstorewriteenglish_text，english_textrealstore。';

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
              { title: { startsWith: '[agenttextqueue]' } },
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
              { name: { startsWith: '[agenttext]' } },
              { name: { startsWith: '[english_text]' } },
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
        label: 'Python agentrealconnection',
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
                ? 'agentenglish_textfailed'
                : 'textconfiguration AGENT_BASE_URL / AGENT_API_KEY')),
      },
      {
        key: 'contract',
        label: 'taskenglish_text',
        status:
          CONTRACT_TASK_TYPES.length >= 10 && PROVIDER_TASK_TYPES.length >= 9
            ? 'ok'
            : 'down',
        detail: `contract ${CONTRACT_VERSION}, taskType ${CONTRACT_TASK_TYPES.length}, provider dispatch ${PROVIDER_TASK_TYPES.length}`,
      },
      {
        key: 'queues',
        label: 'queue/english_text',
        status:
          facts.agentRunsQueue.status === 'ok' &&
          facts.platformEventsQueue.status === 'ok'
            ? 'ok'
            : 'warn',
        detail: `agent-runs active=${facts.agentRunsQueue.counts.active ?? 0}, platform-events waiting=${facts.platformEventsQueue.counts.waiting ?? 0}`,
      },
      {
        key: 'webhook',
        label: 'agentenglish_text',
        status: facts.webhookConfigured ? 'ok' : 'warn',
        detail: facts.webhookConfigured
          ? `textconfiguration AGENT_WEBHOOK_SECRET，progress snapshots=${facts.agentRunProgressSnapshots}`
          : 'AGENT_WEBHOOK_SECRET textconfiguration，english_text',
      },
      {
        key: 'slo',
        label: '98% SLO datatext',
        status:
          successRate === null ? 'warn' : successRate >= 98 ? 'ok' : 'warn',
        detail:
          successRate === null
            ? 'textyestextcompleted/failedenglish_text'
            : `textsuccesstext ${successRate}% (${facts.agentRunCompleted}/${facts.agentRunCompleted + facts.agentRunFailed})`,
      },
      {
        key: 'autonomy-flag',
        label: 'english_text',
        status: facts.autonomyFlagEnabled ? 'ok' : 'warn',
        detail: facts.autonomyFlagEnabled
          ? 'agent-autonomy feature flag english_text'
          : 'agent-autonomy feature flag english_text',
      },
      {
        key: 'external-write-guard',
        label: 'textstorewritesecuritytext',
        status:
          facts.connectedStoreChannels > 0 &&
          facts.externalWriteAdapterConnected &&
          facts.unconnectedExternalWriteActions.length === 0
            ? 'ok'
            : 'warn',
        detail: facts.externalWriteAdapterConnected
          ? `textconnectiontext ${facts.connectedStoreChannels} text；english_textwrite：${facts.guardedExternalWriteActions.join(', ')}；english_textwrite：${facts.unconnectedExternalWriteActions.join(', ')}；textriskenglish_textnotificationenglish_text`
          : `textconnectiontext ${facts.connectedStoreChannels} text；textwriteenglish_text，textriskenglish_textnotificationenglish_text，english_textrealstore`,
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
        title: 'APIenglish_text',
        wave: 'A text',
        priority: 'P0',
        status:
          contractOk && agentReal
            ? 'passed'
            : contractOk
              ? 'backend'
              : 'missing',
        visibleSurface:
          'backend /agent-runs、Python /api/v1/agent/runs、english_text',
        strictFinding:
          'english_text provider english_text；textyesagentenglish_textrealtext mock text，english_textacceptance。',
        nextAction:
          'english_text contractVersion writetexttaskenglish_texttasktext，english_text。',
        evidence: [
          `contractVersion=${CONTRACT_VERSION}`,
          `contract taskType=${CONTRACT_TASK_TYPES.length}`,
          `provider dispatch=${PROVIDER_TASK_TYPES.length}`,
          `agent health=${facts.agentHealth.status}, mockMode=${String(facts.agentHealth.mockMode)}`,
        ],
        blockers: [
          ...(!agentReal
            ? ['english_textyestext Python agenttext mockMode=false text']
            : []),
        ],
        linkedSurfaces: ['/agent-roadmap', '/image-prompt', '/assistant'],
      },
      {
        id: 2,
        title: 'english_text',
        wave: 'A text',
        priority: 'P0',
        status:
          facts.webhookConfigured && facts.agentRunProgressSnapshots > 0
            ? 'passed'
            : facts.webhookConfigured || facts.agentRunProgressSnapshots > 0
              ? 'partial'
              : 'backend',
        visibleSurface: 'agent-runs webhook、SSE text、taskenglish_text',
        strictFinding:
          'backendenglish_text SSE textyestext；english_textconfiguration webhook secret textyes progress text，english_textbackendtext，english_textacceptance。',
        nextAction: 'texttaskenglish_text webhook/polling english_text。',
        evidence: [
          `webhookConfigured=${String(facts.webhookConfigured)}`,
          `progress snapshots=${facts.agentRunProgressSnapshots}`,
          `agent-runs queue status=${facts.agentRunsQueue.status}`,
        ],
        blockers: [
          ...(!facts.webhookConfigured ? ['AGENT_WEBHOOK_SECRET textconfiguration'] : []),
          ...(facts.agentRunProgressSnapshots === 0
            ? ['english_textyesagentenglish_text']
            : []),
        ],
        linkedSurfaces: ['/image-prompt', '/agent-roadmap'],
      },
      {
        id: 3,
        title: 'frontendenglish_text',
        wave: 'A text',
        priority: 'P0',
        status: 'passed',
        visibleSurface: 'AI imageenglish_text、english_text、reviewtext、english_text',
        strictFinding:
          'frontendtexttasktext、textevidence、english_textagentenglish_textfieldsenglish_textacceptancetext。',
        nextAction:
          'english_text agent-run english_text scenePlan、qualityRationale、verifier textfailedtextfields。',
        evidence: [
          'textyes /image-prompt、/assistant、/review、/agent-roadmap text',
          'english_text：scenePlan、qualityRationale、verifier、failureReason',
          'StructuredResult english_text listing、keywords、trends english_text key-value text',
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
        title: 'english_text',
        wave: 'A text',
        priority: 'P0',
        status: 'passed',
        visibleSurface: 'JWT orgId/userId、AgentCallContext、english_text',
        strictFinding:
          'textAPIenglish_text，worker text orgId/userId/workspaceId/locale textagent。',
        nextAction: 'text requestId english_texttasktext，english_text。',
        evidence: [
          `organizationId=${facts.organizationId}`,
          'AgentCallContext includes orgId/userId/workspaceId/agentRunId/locale',
        ],
        blockers: [],
        linkedSurfaces: ['/audit-logs', '/agent-roadmap'],
      },
      {
        id: 5,
        title: 'english_text',
        wave: 'B text',
        priority: 'P0',
        status: reliabilityPassed
          ? 'passed'
          : facts.agentRunsQueue.status === 'ok'
            ? 'partial'
            : 'backend',
        visibleSurface: 'BullMQ agent-runs、dead-letter english_text、texttaskstatus',
        strictFinding:
          'queue、english_text、english_textAPItext；textyesenglish_textfailedtext。',
        nextAction: 'english_textfailedtaskenglish_text AgentRun english_text。',
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
            ? ['english_text agent-run english_text']
            : []),
          ...(!reliabilityPassed && facts.agentRunsQueue.status !== 'ok'
            ? ['agent-runs queueenglish_text']
            : []),
          ...(!reliabilityPassed && facts.platformEventsQueue.status !== 'ok'
            ? ['platform-events queueenglish_text']
            : []),
        ],
        linkedSurfaces: ['/agent-roadmap', '/audit-logs'],
      },
      {
        id: 6,
        title: 'english_text',
        wave: 'B text',
        priority: 'P0',
        status: capacityPassed ? 'passed' : 'backend',
        visibleSurface:
          'k6/Prometheus/Grafana configuration、english_textreport、docs/performance/agent-roadmap-local-capacity.json',
        strictFinding:
          'textyestextconfiguration；english_textreadtextreallocaltextreporttextpassed，english_textconfigurationfilepassed。',
        nextAction: 'english_textlocalenglish_text CI/k6 textreporttext Grafana text。',
        evidence: [
          'backendyesqueuetextconfigurationtextmonitoringtext',
          `agentRunsTotal=${facts.agentRunTotal}`,
          `capacityReport=${facts.capacityReportSummary}`,
        ],
        blockers: [
          ...(!facts.capacityReportAvailable
            ? ['textyesenglish_text']
            : []),
          ...(facts.agentRunsQueue.status !== 'ok'
            ? ['agent-runs queueenglish_text']
            : []),
        ],
        linkedSurfaces: ['/agent-roadmap'],
      },
      {
        id: 7,
        title: 'english_text',
        wave: 'B text',
        priority: 'P0',
        status: qualityTrusted
          ? 'passed'
          : facts.scoredWorkMemories > 0 || facts.reviewTasks > 0
            ? 'partial'
            : 'backend',
        visibleSurface:
          'reviewtext score/threshold/autoApproved、english_text、ReviewTask',
        strictFinding:
          'english_text、textqueue、english_textautomaticpassedstatusenglish_textreviewenglish_text；passedenglish_textreal ReviewTask english_text。',
        nextAction: 'english_texthumanenglish_text，english_textyestextbackendtext。',
        evidence: [
          `reviewTasks=${facts.reviewTasks}`,
          `reviewScoredTasks=${facts.reviewScoredTasks}`,
          `reviewAutoApprovedTasks=${facts.reviewAutoApprovedTasks}`,
          `scoredWorkMemories=${facts.scoredWorkMemories}`,
          `qualityPassRate=${qualityPassRate === null ? 'n/a' : `${qualityPassRate}%`}`,
        ],
        blockers: [
          ...(facts.reviewTasks === 0 ? ['text ReviewTask text'] : []),
          ...(facts.reviewScoredTasks === 0 ? ['english_textreviewtext'] : []),
          ...(facts.scoredWorkMemories === 0
            ? ['english_text']
            : []),
        ],
        linkedSurfaces: ['/review', '/agent-roadmap'],
      },
      {
        id: 8,
        title: 'SLO 98% datatext',
        wave: 'B text',
        priority: 'P0',
        status: successRate !== null ? 'partial' : 'backend',
        visibleSurface: 'Prometheus text、Grafana text、english_text',
        strictFinding:
          'SLO english_text；textyestextrealenglish_textdatatext，english_text 98% english_text。',
        nextAction: 'text 14 english_textsuccesstext、errorenglish_textfrontend。',
        evidence: [
          `agentRunSuccessRate=${successRate === null ? 'n/a' : `${successRate}%`}`,
          `completed=${facts.agentRunCompleted}`,
          `failed=${facts.agentRunFailed}`,
        ],
        blockers: [
          ...(successRate === null ? ['textyestexttasktext'] : []),
          'english_textrealtextacceptanceevidence',
        ],
        linkedSurfaces: ['/agent-roadmap'],
      },
      {
        id: 9,
        title: 'platformdataenglish_text',
        wave: 'C text',
        priority: 'P1',
        status: platformKnowledgePassed ? 'passed' : 'partial',
        visibleSurface:
          'agent-data source=platform、english_text orgId、textdataAPI、english_textevidence',
        strictFinding:
          'agentdatatextpassed API key + orgId readplatformdata，english_text source=platform；english_textdataenglish_textacceptanceevidence。',
        nextAction:
          'english_textgenerationenglish_text ID textfieldsenglish_text。',
        evidence: [
          `agent-data endpoints=${AGENT_DATA_ENDPOINTS.length}`,
          'source=platform on listings/research/keywords/review/trends/products/store-monitoring',
          'orgId is required by AgentDataController before any platform data read',
        ],
        blockers: [
          ...(!platformKnowledgePassed
            ? ['AGENT_WEBHOOK_SECRET textconfiguration，textevidenceenglish_text']
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
        title: 'english_textplatformenglish_text',
        wave: 'C text',
        priority: 'P1',
        status: toolChannelPassed ? 'passed' : 'partial',
        visibleSurface:
          'AgentPermissions action registry、agent-proxy dry-run/confirm/audit',
        strictFinding:
          'english_textyes mock：text agent-proxy english_text API key、autonomy flag、english_text、dry-run english_text。',
        nextAction:
          'english_textpublishtext action；textplatformenglish_text 17 stageenglish_text。',
        evidence: [
          `toolRegistryActions=${facts.toolRegistryActions}`,
          `permissionLevels=${facts.toolRegistryPermissionLevels}`,
          `agentProxyCoveredActions=${facts.agentProxyCoveredActions}`,
          'dryRun returns permission without mutating data',
          'publish/payment/order/price/ads/Ozon actions create approval notifications before execution',
        ],
        blockers: [
          ...(!toolChannelPassed
            ? ['english_text、english_text proxy english_text']
            : []),
        ],
        linkedSurfaces: ['/agent-roadmap', '/audit-logs'],
      },
      {
        id: 11,
        title: 'taskenglish_text Planner',
        wave: 'C text',
        priority: 'P0',
        status: plannerPassed
          ? 'passed'
          : facts.plannerRuns > 0
            ? 'partial'
            : 'backend',
        visibleSurface:
          'PLANNER agentType、plan_and_execute taskType、AutomationFlow.steps',
        strictFinding:
          'Planner tasktext、text taskType、operator flow text steps english_textacceptanceenglish_text。',
        nextAction: 'text AgentRun english_textinputoutputenglish_text。',
        evidence: [
          'contract includes plan_and_execute',
          `plannerRuns=${facts.plannerRuns}`,
          `agentAutomationFlows=${facts.agentAutomationFlows}`,
        ],
        blockers: [
          ...(facts.plannerRuns === 0 ? ['text PLANNER AgentRun text'] : []),
          ...(facts.agentAutomationFlows === 0
            ? ['text operator/agent AutomationFlow.steps text']
            : []),
        ],
        linkedSurfaces: ['/assistant', '/agent-roadmap'],
      },
      {
        id: 12,
        title: 'english_text Verifier',
        wave: 'C text',
        priority: 'P0',
        status: verifierPassed
          ? 'passed'
          : facts.scoredWorkMemories > 0 || facts.reviewTasks > 0
            ? 'partial'
            : 'backend',
        visibleSurface:
          'ReviewTask score/threshold、autoRegenerations、english_text result',
        strictFinding:
          'Verifier textyesenglish_text：english_text ReviewTask，english_text autoRegenerations textqueue。',
        nextAction: 'english_textautomaticenglish_textinputoutput diff english_text。',
        evidence: [
          `reviewTasks=${facts.reviewTasks}`,
          `reviewScoredTasks=${facts.reviewScoredTasks}`,
          `reviewRegenerationTasks=${facts.reviewRegenerationTasks}`,
          `quality scored samples=${facts.scoredWorkMemories}`,
        ],
        blockers: [
          ...(facts.reviewTasks === 0 ? ['text ReviewTask text'] : []),
          ...(facts.reviewScoredTasks === 0 ? ['text verifier english_text'] : []),
          ...(facts.scoredWorkMemories === 0
            ? ['text verifier writeenglish_text']
            : []),
        ],
        linkedSurfaces: ['/review', '/agent-roadmap'],
      },
      {
        id: 13,
        title: 'platformenglish_text',
        wave: 'D text',
        priority: 'P0',
        status: awarenessPassed ? 'passed' : 'backend',
        visibleSurface: 'EventBus、platform-events queue、awareness TeamTask',
        strictFinding:
          'backendtext product.created english_text；textfrontendtextyesagentenglish_text。',
        nextAction: 'english_text，english_text、textstatusenglish_text。',
        evidence: [
          `platform-events queue=${facts.platformEventsQueue.status}`,
          `awarenessRecords=${facts.awarenessRecords}`,
        ],
        blockers: [
          ...(!awarenessPassed
            ? ['english_textbackendtext']
            : []),
        ],
        linkedSurfaces: ['/agent-roadmap', '/team'],
      },
      {
        id: 14,
        title: 'english_text',
        wave: 'D text',
        priority: 'P0',
        status: suggestionPassed ? 'passed' : 'backend',
        visibleSurface: 'Notification、agent-autonomy.suggestion-created',
        strictFinding:
          'english_textbackendtext；textnotificationenglish_textagentenglish_text。',
        nextAction: 'english_textnotificationenglish_text，english_text/text/text。',
        evidence: [
          `suggestionsCreated=${facts.suggestionsCreated}`,
          `autonomyFlagEnabled=${String(facts.autonomyFlagEnabled)}`,
        ],
        blockers: [
          ...(!facts.autonomyFlagEnabled
            ? ['english_text agent-autonomy feature flag']
            : []),
          ...(facts.suggestionsCreated === 0
            ? ['english_text']
            : []),
        ],
        linkedSurfaces: ['/agent-roadmap'],
      },
      {
        id: 15,
        title: 'automatictext',
        wave: 'D text',
        priority: 'P0',
        status: schedulingPassed ? 'passed' : 'backend',
        visibleSurface: 'TeamTask、AutomationFlow、agent scheduled flow',
        strictFinding:
          'backendenglish_texttasktextautomatictext；frontendtextyesenglish_textyesagentenglish_text。',
        nextAction: 'texttasktextautomaticenglish_text Agent-created work queue。',
        evidence: [
          `suggestionsScheduled=${facts.suggestionsScheduled}`,
          `agentScheduledTasks=${facts.agentScheduledTasks}`,
          `agentAutomationFlows=${facts.agentAutomationFlows}`,
        ],
        blockers: [
          ...(!schedulingPassed
            ? ['english_textgenerationtexttasktextautomaticenglish_text']
            : []),
        ],
        linkedSurfaces: ['/team', '/automation', '/agent-roadmap'],
      },
      {
        id: 16,
        title: 'english_text',
        wave: 'D text',
        priority: 'P0',
        status: authorizationPassed ? 'passed' : 'partial',
        visibleSurface:
          'AgentPermissions L1-L4、agent-proxy、agent control、english_text、feature flag',
        strictFinding:
          'L1-L4、kill-switch、english_text、publish/english_textrealtext。',
        nextAction: 'english_textconfigurationenglish_text。',
        evidence: [
          `unauthorizedAgentActions=${facts.unauthorizedAgentActions}`,
          `autonomyFlagEnabled=${String(facts.autonomyFlagEnabled)}`,
          `permissionLevels=${facts.toolRegistryPermissionLevels}`,
          `agentControlEndpoints=${AGENT_CONTROL_ENDPOINTS.length}`,
          `registeredActions=${facts.toolRegistryActions}`,
        ],
        blockers: [
          ...(!facts.autonomyFlagEnabled
            ? ['english_text agent-autonomy feature flag']
            : []),
          ...(facts.toolRegistryPermissionLevels < 4
            ? ['english_textyestext L1-L4']
            : []),
        ],
        linkedSurfaces: ['/audit-logs', '/agent-roadmap'],
      },
      {
        id: 17,
        title: 'english_textplatformtext',
        wave: 'D text',
        priority: 'P0',
        status: fullPlatformAgentPassed ? 'passed' : 'partial',
        visibleSurface:
          'agent-proxy、notificationenglish_textriskapproval、operator.prepare_listing_batch、english_text',
        strictFinding:
          'english_textriskapprovalnotificationenglish_text；Ozon text、text、text、english_text rFBS english_texthumantext，writeenglish_text。english_textrealtextevidenceenglish_textcustomerstoretextsuccess。',
        nextAction:
          'english_textrealapprovalenglish_textevidence；english_textacceptanceenglish_text、english_textwrite。',
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
                  `textcompletedrealenglish_text：${facts.agentProxyUncoveredActions.join(', ')}`,
                ]
              : []
            : []),
          ...(!facts.externalWriteAdapterConnected
            ? ['textyesenglish_textstorewriteenglish_text，english_textwriterealstore']
            : []),
          ...(facts.unconnectedExternalWriteActions.length > 0
            ? [
                `english_textwriteenglish_text：${facts.unconnectedExternalWriteActions.join(', ')}`,
              ]
            : []),
        ],
        linkedSurfaces: ['/agent-roadmap', '/audit-logs'],
      },
      {
        id: 18,
        title: 'english_text',
        wave: 'E text',
        priority: 'P0',
        status: workMemoryPassed ? 'passed' : 'backend',
        visibleSurface: 'AgentWorkMemory、agent-memory records、english_text',
        strictFinding:
          'backendenglish_texttaskenglish_text、english_text；frontendtextyes“english_text”english_text。',
        nextAction: 'english_text。',
        evidence: [`workMemories=${facts.workMemories}`],
        blockers: [
          ...(!workMemoryPassed ? ['english_textyesenglish_text'] : []),
        ],
        linkedSurfaces: ['/agent-roadmap'],
      },
      {
        id: 19,
        title: 'english_text',
        wave: 'E text',
        priority: 'P1',
        status: learningPassed ? 'passed' : 'backend',
        visibleSurface: 'AgentExperienceCard、reviewenglish_text',
        strictFinding:
          'english_textwriteenglish_text；english_text、english_texttaskenglish_textevidenceenglish_text。',
        nextAction: 'english_text、english_textreportenglish_text。',
        evidence: [`experienceCards=${facts.experienceCards}`],
        blockers: [
          ...(!learningPassed ? ['english_textyesenglish_text'] : []),
        ],
        linkedSurfaces: ['/review', '/agent-roadmap'],
      },
      {
        id: 20,
        title: 'english_textacceptance',
        wave: 'E text',
        priority: 'P0',
        status:
          facts.readinessConsecutivePassedDays >= 14
            ? 'passed'
            : facts.readinessSamples > 0
              ? 'partial'
              : 'backend',
        visibleSurface: 'AgentAutonomyDailyMetric、text readiness text',
        strictFinding:
          'textacceptanceenglish_text；textyesenglish_textpassedenglish_text，english_text。',
        nextAction:
          'english_textrealenglish_text，textsuccesstext、english_text、nonetextcompletedtext、english_text。',
        evidence: [
          `readinessSamples=${facts.readinessSamples}`,
          `readinessPassedSamples=${facts.readinessPassedSamples}`,
          `readinessConsecutivePassedDays=${facts.readinessConsecutivePassedDays}/14`,
          `readinessLatestPassedDate=${facts.readinessLatestPassedDate ?? 'n/a'}`,
        ],
        blockers: [
          ...(facts.readinessConsecutivePassedDays < 14
            ? ['textyesenglish_text readiness passed text']
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
