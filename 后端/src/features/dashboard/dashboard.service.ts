import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { requireOrg } from '../../shared/tenancy/org-scope.js';
import type { DashboardParamsDto } from './dashboard.dto.js';
import { normalizeKeywordAnalysisResult } from '../../agents/contracts/keyword-analysis.contract.js';
import {
  derivePipelineStage,
  type PipelineStage,
} from './pipeline-stage.js';

export type DashboardSampleState = 'real_samples' | 'empty';
export type DashboardKeywordSource =
  'trend_insight' | 'keyword_report' | 'mixed';

export interface DashboardOpportunityItem {
  id: string;
  title: string;
  detail: string;
  source: 'notification' | 'team_task' | 'product_research';
  sourceLabel: string;
  status: string;
  priority: string | null;
  score: number | null;
  actionRequired: boolean;
  createdAt: string;
}

export interface DashboardKeywordAccumulator {
  keyword: string;
  maxScore: number | null;
  occurrences: number;
  source: DashboardKeywordSource;
  searchVolume: number | null;
  difficulty: number | null;
}

export interface DashboardPipelineItem {
  id: string;
  entityType: 'RESEARCH_RUN' | 'REVIEW_TASK' | 'PRODUCT_LAUNCH';
  entityId: string;
  title: string;
  stage: PipelineStage;
  status: string;
  blockedOn: string | null;
  errorCode: string | null;
  actionRequired: boolean;
  updatedAt: string;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantDatabase: TenantDatabaseContextService,
  ) {}

  async getPipeline(user: JwtPayload, params?: DashboardParamsDto) {
    const organizationId = requireOrg(user);
    const workspaceId = params?.workspaceId;
    const workspaceFilter = workspaceId ? { workspaceId } : {};
    const [researchRuns, reviewTasks, productLaunches] =
      await this.tenantDatabase.run(organizationId, (tx) =>
        Promise.all([
          tx.productResearchRun.findMany({
            where: {
              organizationId,
              ...workspaceFilter,
              status: {
                in: ['PENDING', 'RUNNING', 'PAUSED', 'PARTIAL', 'FAILED', 'STOPPED'],
              },
            },
            orderBy: { updatedAt: 'desc' },
            take: 50,
            select: {
              id: true,
              workspaceId: true,
              status: true,
              currentStage: true,
              errorSummary: true,
              updatedAt: true,
              _count: { select: { candidates: true } },
            },
          }),
          tx.reviewTask.findMany({
            where: {
              organizationId,
              status: { in: ['PENDING', 'REWORK'] },
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
            select: {
              id: true,
              entityType: true,
              entityId: true,
              status: true,
              notes: true,
              createdAt: true,
            },
          }),
          tx.productLaunch.findMany({
            where: { organizationId },
            orderBy: { updatedAt: 'desc' },
            take: 100,
            select: {
              id: true,
              reviewTaskId: true,
              status: true,
              failureCode: true,
              failureMessage: true,
              selectedPublishSnapshotId: true,
              createdAt: true,
              updatedAt: true,
              researchCandidate: { select: { canonicalName: true } },
            },
          }),
        ]),
      );

    const launchReviewIds = new Set(
      productLaunches.map((launch) => launch.reviewTaskId),
    );
    const items: DashboardPipelineItem[] = [];
    for (const run of researchRuns) {
      const summary = this.asRecord(run.errorSummary);
      const derived = derivePipelineStage({
        kind: 'RESEARCH_RUN',
        status: run.status,
        errorCode: this.safeErrorCode(summary.code),
      });
      items.push({
        id: run.id,
        entityType: 'RESEARCH_RUN',
        entityId: run.id,
        title: `每日选品批次（${run._count.candidates} 个候选）`,
        stage: derived.stage,
        status: run.status,
        blockedOn: derived.blockedOn,
        errorCode: derived.errorCode,
        actionRequired: derived.blockedOn !== null,
        updatedAt: run.updatedAt.toISOString(),
      });
    }
    for (const task of reviewTasks) {
      if (launchReviewIds.has(task.id)) continue;
      const derived = derivePipelineStage({
        kind: 'REVIEW_TASK',
        status: task.status,
      });
      items.push({
        id: task.id,
        entityType: 'REVIEW_TASK',
        entityId: task.entityId,
        title: `${this.pipelineReviewEntityLabel(task.entityType)}待处理`,
        stage: derived.stage,
        status: task.status,
        blockedOn: derived.blockedOn,
        errorCode: derived.errorCode,
        actionRequired: true,
        updatedAt: task.createdAt.toISOString(),
      });
    }
    for (const launch of productLaunches) {
      const derived = derivePipelineStage({
        kind: 'PRODUCT_LAUNCH',
        status: launch.status,
        errorCode: launch.failureCode,
        hasSnapshot: Boolean(launch.selectedPublishSnapshotId),
      });
      items.push({
        id: launch.id,
        entityType: 'PRODUCT_LAUNCH',
        entityId: launch.id,
        title: launch.researchCandidate?.canonicalName || '商品发布任务',
        stage: derived.stage,
        status: launch.status,
        blockedOn: derived.blockedOn,
        errorCode: derived.errorCode,
        actionRequired: derived.blockedOn !== null,
        updatedAt: launch.updatedAt.toISOString(),
      });
    }
    items.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const byStage = items.reduce<Record<string, number>>((counts, item) => {
      counts[item.stage] = (counts[item.stage] ?? 0) + 1;
      return counts;
    }, {});
    const blocked = items.filter((item) => item.blockedOn !== null).length;
    return {
      items,
      summary: {
        total: items.length,
        needsAttention: items.filter((item) => item.actionRequired).length,
        blocked,
        inProgress: items.filter(
          (item) => !item.actionRequired && item.stage !== 'MONITORING',
        ).length,
        monitoring: items.filter((item) => item.stage === 'MONITORING').length,
        byStage,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  async getCounts(user: JwtPayload, params?: DashboardParamsDto) {
    const orgId = requireOrg(user);
    const { workspaceId } = params ?? {};

    const orgFilter = { organizationId: orgId };
    const wsFilter = workspaceId ? { workspaceId } : {};

    const productWhere = workspaceId
      ? { workspaceId }
      : { workspace: { organizationId: orgId } };
    const notArchived = { status: { not: 'ARCHIVED' as const } };

    const [
      productCount,
      listingCount,
      agentRunCount,
      activeTaskCount,
      notificationCount,
      alertCount,
    ] = await Promise.all([
      this.tenantDatabase.run(orgId, (tx) =>
        tx.product.count({ where: { ...productWhere, ...notArchived } }),
      ),
      this.tenantDatabase.run(orgId, (tx) =>
        tx.listingDraft.count({
          where: { organizationId: orgId, ...wsFilter },
        }),
      ),
      this.tenantDatabase.run(orgId, (tx) =>
        tx.agentRun.count({
          where: { ...orgFilter, ...wsFilter },
        }),
      ),
      this.tenantDatabase.run(orgId, (tx) =>
        tx.teamTask.count({
          where: {
            ...orgFilter,
            ...wsFilter,
            status: { in: ['TODO', 'IN_PROGRESS', 'REVIEW'] },
          },
        }),
      ),
      this.tenantDatabase.run(orgId, (tx) =>
        tx.notification.count({
          where: { ...orgFilter, userId: user.sub, readAt: null },
        }),
      ),
      this.tenantDatabase.run(orgId, (tx) =>
        tx.alert.count({
          where: { ...orgFilter, ...wsFilter, status: 'OPEN' },
        }),
      ),
    ]);

    return {
      products: productCount,
      listings: listingCount,
      agentRuns: agentRunCount,
      activeTasks: activeTaskCount,
      unreadNotifications: notificationCount,
      openAlerts: alertCount,
    };
  }

  private pipelineReviewEntityLabel(entityType: string): string {
    return {
      AGENT_RUN: '智能体任务',
      IMAGE_GENERATION: '商品图片',
      LISTING_DRAFT: '商品刊登',
      PRODUCT_RESEARCH: '选品结果',
      SUPPLY_PLAN: '补货计划',
    }[entityType] ?? '业务任务';
  }

  private safeErrorCode(value: unknown): string | null {
    return typeof value === 'string' && /^[A-Z][A-Z0-9_]{1,80}$/.test(value)
      ? value
      : null;
  }

  async getRecentActivity(user: JwtPayload, params?: DashboardParamsDto) {
    const orgId = requireOrg(user);
    const { workspaceId } = params ?? {};

    const wsFilter = workspaceId ? { workspaceId } : {};

    const [recentAgentRuns, recentNotifications, recentAuditLogs] =
      await Promise.all([
        this.tenantDatabase.run(orgId, (tx) =>
          tx.agentRun.findMany({
            where: { organizationId: orgId, ...wsFilter },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
              id: true,
              agentType: true,
              status: true,
              createdAt: true,
            },
          }),
        ),
        this.tenantDatabase.run(orgId, (tx) =>
          tx.notification.findMany({
            where: { organizationId: orgId, userId: user.sub },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
              id: true,
              type: true,
              title: true,
              readAt: true,
              createdAt: true,
            },
          }),
        ),
        this.tenantDatabase.run(orgId, (tx) =>
          tx.auditLog.findMany({
            where: { organizationId: orgId },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
              id: true,
              action: true,
              resourceType: true,
              resourceId: true,
              createdAt: true,
            },
          }),
        ),
      ]);

    return {
      recentAgentRuns,
      recentNotifications,
      recentAuditLogs,
    };
  }

  async getOpportunities(user: JwtPayload, params?: DashboardParamsDto) {
    const orgId = requireOrg(user);
    const { workspaceId } = params ?? {};
    const wsFilter = workspaceId ? { workspaceId } : {};

    const [notifications, tasks, reports, approvedProducts] = await Promise.all(
      [
        this.tenantDatabase.run(orgId, (tx) =>
          tx.notification.findMany({
            where: {
              organizationId: orgId,
              userId: user.sub,
              readAt: null,
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: {
              id: true,
              type: true,
              title: true,
              body: true,
              readAt: true,
              metadata: true,
              createdAt: true,
            },
          }),
        ),
        this.tenantDatabase.run(orgId, (tx) =>
          tx.teamTask.findMany({
            where: {
              organizationId: orgId,
              ...wsFilter,
              status: { in: ['TODO', 'IN_PROGRESS', 'REVIEW'] },
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
              id: true,
              title: true,
              description: true,
              priority: true,
              status: true,
              createdAt: true,
            },
          }),
        ),
        this.tenantDatabase.run(orgId, (tx) =>
          tx.productResearchReport.findMany({
            where: { organizationId: orgId, ...wsFilter },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
              id: true,
              workspaceId: true,
              query: true,
              platform: true,
              summary: true,
              opportunities: true,
              createdAt: true,
            },
          }),
        ),
        this.tenantDatabase.run(orgId, (tx) =>
          tx.product.findMany({
            where: this.productWhere(orgId, workspaceId),
            select: { metadata: true },
            take: 200,
          }),
        ),
      ],
    );

    const approvedCandidateKeys = new Set(
      approvedProducts
        .map((product) => this.approvedProductCandidateKey(product.metadata))
        .filter((key): key is string => Boolean(key)),
    );

    const notificationItems: DashboardOpportunityItem[] = notifications
      .filter((notification) => {
        const metadata = this.asRecord(notification.metadata);
        if (!this.matchesWorkspace(metadata, workspaceId)) {
          return false;
        }
        return (
          notification.type === 'APPROVAL_REQUIRED' ||
          metadata.kind === 'agent_suggestion' ||
          metadata.source === 'agent_suggestion'
        );
      })
      .map((notification) => {
        const metadata = this.asRecord(notification.metadata);
        return {
          id: notification.id,
          title: notification.title,
          detail: notification.body ?? '智能体通知中心的待处理建议。',
          source: 'notification',
          sourceLabel: 'Notification.metadata / 通知中心',
          status: notification.readAt ? 'read' : 'unread',
          priority: this.asOptionalString(metadata.priority) ?? null,
          score: this.asNumber(metadata.score),
          actionRequired: notification.type === 'APPROVAL_REQUIRED',
          createdAt: notification.createdAt.toISOString(),
        };
      });

    const taskItems: DashboardOpportunityItem[] = tasks.map((task) => ({
      id: task.id,
      title: task.title,
      detail: task.description ?? '团队任务中仍处于待处理或复核状态。',
      source: 'team_task',
      sourceLabel: 'TeamTask / 待复核任务',
      status: task.status,
      priority: task.priority,
      score: null,
      actionRequired: task.status === 'REVIEW',
      createdAt: task.createdAt.toISOString(),
    }));

    const researchItems: DashboardOpportunityItem[] = reports.flatMap(
      (report) => {
        const items: DashboardOpportunityItem[] = [];
        this.extractCompetitors(report.opportunities).forEach(
          (candidateName, index) => {
            const id = `${report.id}:${index}`;
            if (approvedCandidateKeys.has(id)) {
              return;
            }
            const priceRange = this.extractPriceRange(report.opportunities);
            const priceText =
              priceRange.min !== null || priceRange.max !== null
                ? `价格区间 ${priceRange.min ?? '-'} - ${priceRange.max ?? '-'}`
                : '选品报告未返回价格区间';
            items.push({
              id,
              title: candidateName,
              detail: `${report.platform} / ${report.query} / ${priceText}`,
              source: 'product_research' as const,
              sourceLabel: 'ProductResearchReport.opportunities',
              status: 'pending_approval',
              priority: null,
              score: this.extractRating(report.opportunities),
              actionRequired: true,
              createdAt: report.createdAt.toISOString(),
            });
          },
        );
        return items;
      },
    );

    const items = [...notificationItems, ...taskItems, ...researchItems]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 8);

    return {
      source: 'notifications_team_tasks_product_research_reports',
      sourceLabel: '通知中心 / 团队任务 / 选品报告',
      sampleState: this.sampleState(items),
      emptyReason: items.length
        ? null
        : '没有未读智能体建议、待复核任务或待批准选品候选。',
      items,
    };
  }

  async getHotProducts(user: JwtPayload, params?: DashboardParamsDto) {
    const orgId = requireOrg(user);
    const { workspaceId } = params ?? {};

    const products = await this.tenantDatabase.run(orgId, (tx) =>
      tx.product.findMany({
        where: {
          ...this.productWhere(orgId, workspaceId),
          status: { notIn: ['ARCHIVED', 'DELETED'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          title: true,
          sku: true,
          asinOrExternalId: true,
          price: true,
          currency: true,
          status: true,
          metadata: true,
          createdAt: true,
        },
      }),
    );

    const items = products
      .map((product) => {
        const metadata = this.asRecord(product.metadata);
        return {
          id: product.id,
          title: product.title,
          sku: product.sku,
          externalId: product.asinOrExternalId,
          price: this.toNumber(product.price),
          currency: product.currency,
          status: product.status,
          source: this.asOptionalString(metadata.source) ?? 'product_table',
          externalStoreMutation:
            this.asOptionalString(metadata.externalStoreMutation) ?? null,
          ozonStatus: this.asOptionalString(metadata.ozonStatus) ?? null,
          createdAt: product.createdAt.toISOString(),
        };
      })
      .sort((a, b) => {
        const sourceRank =
          (b.source === 'ozon' ? 1 : 0) - (a.source === 'ozon' ? 1 : 0);
        if (sourceRank !== 0) return sourceRank;
        return b.price - a.price;
      })
      .slice(0, 8);

    return {
      source: 'products',
      sourceLabel: 'Product 表 / Ozon 同步商品目录，不是销量榜',
      rankingBasis: 'catalog_sync',
      sampleState: this.sampleState(items),
      emptyReason: items.length
        ? null
        : 'Product 表没有可展示商品；未生成示例爆品或虚假销量。',
      items,
    };
  }

  async getProfitSummary(user: JwtPayload, params?: DashboardParamsDto) {
    const orgId = requireOrg(user);
    const { workspaceId } = params ?? {};
    const where = {
      organizationId: orgId,
      ...this.workspaceFilter(workspaceId),
    };

    const [latestCalculations, calculationCount] =
      await this.tenantDatabase.run(orgId, (tx) =>
        Promise.all([
          tx.profitCalculation.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 8,
            select: {
              id: true,
              productId: true,
              product: { select: { title: true } },
              currency: true,
              salePrice: true,
              totalCost: true,
              estimatedProfit: true,
              profitMargin: true,
              roi: true,
              createdAt: true,
            },
          }),
          tx.profitCalculation.count({ where }),
        ]),
      );

    const latest = latestCalculations.map((calculation) => ({
      id: calculation.id,
      productId: calculation.productId,
      productTitle: calculation.product?.title ?? null,
      currency: calculation.currency,
      salePrice: this.toNumber(calculation.salePrice),
      totalCost: this.toNumber(calculation.totalCost),
      estimatedProfit: this.toNumber(calculation.estimatedProfit),
      profitMargin: calculation.profitMargin,
      roi: calculation.roi,
      createdAt: calculation.createdAt.toISOString(),
    }));

    const averageMargin = this.average(latest.map((item) => item.profitMargin));
    const averageRoi = this.average(latest.map((item) => item.roi));
    const totalEstimatedProfit = latest.reduce(
      (sum, item) => sum + item.estimatedProfit,
      0,
    );

    return {
      source: 'profit_calculations',
      sourceLabel: 'ProfitCalculation / 利润计算器真实保存记录',
      sampleState: this.sampleState(latest),
      emptyReason: latest.length
        ? null
        : 'ProfitCalculation 暂无真实计算记录；首页不会生成本地假利润预测。',
      calculationCount,
      averageMargin,
      averageRoi,
      totalEstimatedProfit,
      latest,
    };
  }

  async getTrendSummaries(user: JwtPayload, params?: DashboardParamsDto) {
    const orgId = requireOrg(user);
    const { workspaceId } = params ?? {};

    const wsFilter = workspaceId ? { workspaceId } : {};

    const [recentTrends, topKeywords, keywordReports] = await Promise.all([
      this.tenantDatabase.run(orgId, (tx) =>
        tx.trendInsight.findMany({
          where: { organizationId: orgId, ...wsFilter },
          orderBy: { observedAt: 'desc' },
          take: 10,
        }),
      ),
      this.tenantDatabase.run(orgId, (tx) =>
        tx.trendInsight.groupBy({
          by: ['keyword'],
          where: { organizationId: orgId, ...wsFilter },
          _max: { score: true },
          _count: true,
          orderBy: { _max: { score: 'desc' } },
          take: 10,
        }),
      ),
      this.tenantDatabase.run(orgId, (tx) =>
        tx.keywordReport.findMany({
          where: { organizationId: orgId, ...wsFilter },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            keywords: true,
            createdAt: true,
          },
        }),
      ),
    ]);

    const mergedKeywords = new Map<string, DashboardKeywordAccumulator>();
    for (const keyword of topKeywords) {
      this.upsertKeyword(mergedKeywords, {
        keyword: keyword.keyword,
        source: 'trend_insight',
        maxScore: keyword._max.score,
        occurrences: keyword._count,
        searchVolume: null,
        difficulty: null,
      });
    }

    for (const report of keywordReports) {
      for (const keyword of this.extractKeywordReportItems(report.keywords)) {
        this.upsertKeyword(mergedKeywords, {
          keyword: keyword.keyword,
          source: 'keyword_report',
          maxScore: null,
          occurrences: 1,
          searchVolume: keyword.volume,
          difficulty: keyword.difficulty,
        });
      }
    }

    return {
      recentTrends,
      topKeywords: Array.from(mergedKeywords.values())
        .sort((a, b) => this.keywordRank(b) - this.keywordRank(a))
        .slice(0, 10),
    };
  }

  private productWhere(
    orgId: string,
    workspaceId?: string,
  ): Prisma.ProductWhereInput {
    return {
      ...(workspaceId ? { workspaceId } : {}),
      workspace: { organizationId: orgId },
    };
  }

  private workspaceFilter(workspaceId?: string) {
    return workspaceId ? { workspaceId } : {};
  }

  private sampleState(items: unknown[]): DashboardSampleState {
    return items.length > 0 ? 'real_samples' : 'empty';
  }

  private matchesWorkspace(
    metadata: Record<string, unknown>,
    workspaceId?: string,
  ): boolean {
    if (!workspaceId) return true;
    if (metadata.workspaceId === workspaceId) return true;
    const params = this.asRecord(metadata.params);
    return params.workspaceId === workspaceId;
  }

  private approvedProductCandidateKey(
    metadataValue: Prisma.JsonValue,
  ): string | null {
    const metadata = this.asRecord(metadataValue);
    const reportId = this.asOptionalString(metadata.researchReportId);
    const candidateIndex = this.asNumber(metadata.candidateIndex);
    if (!reportId || candidateIndex === null) {
      return null;
    }
    return `${reportId}:${candidateIndex}`;
  }

  private extractCompetitors(opportunities: Prisma.JsonValue | null): string[] {
    const payload = this.asRecord(opportunities);
    const competitors = payload.competitors;
    if (!Array.isArray(competitors)) {
      return [];
    }
    return competitors
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private extractPriceRange(opportunities: Prisma.JsonValue | null) {
    const payload = this.asRecord(opportunities);
    const priceRange = this.asRecord(payload.priceRange);
    return {
      min: this.asNumber(priceRange.min),
      max: this.asNumber(priceRange.max),
    };
  }

  private extractRating(opportunities: Prisma.JsonValue | null): number | null {
    return this.asNumber(this.asRecord(opportunities).rating);
  }

  private extractKeywordReportItems(keywordsValue: Prisma.JsonValue) {
    if (!Array.isArray(keywordsValue)) {
      return [];
    }
    const normalizedInput = keywordsValue.map((item) =>
      typeof item === 'string' ? { keyword: item } : item,
    );
    return normalizeKeywordAnalysisResult({
      keywords: normalizedInput,
    }).keywords.map(({ keyword, volume, difficulty }) => ({
      keyword,
      volume,
      difficulty,
    }));
  }

  private upsertKeyword(
    keywords: Map<string, DashboardKeywordAccumulator>,
    next: DashboardKeywordAccumulator,
  ) {
    const key = next.keyword.toLowerCase();
    const existing = keywords.get(key);
    if (!existing) {
      keywords.set(key, next);
      return;
    }
    const maxScore = this.maxNullable(existing.maxScore, next.maxScore);
    const searchVolume = this.maxNullable(
      existing.searchVolume,
      next.searchVolume,
    );
    keywords.set(key, {
      keyword: existing.keyword,
      maxScore,
      occurrences: existing.occurrences + next.occurrences,
      source: existing.source === next.source ? existing.source : 'mixed',
      searchVolume,
      difficulty: existing.difficulty ?? next.difficulty,
    });
  }

  private keywordRank(keyword: DashboardKeywordAccumulator): number {
    return Math.max(keyword.maxScore ?? 0, keyword.searchVolume ?? 0);
  }

  private maxNullable(a: number | null, b: number | null): number | null {
    if (a === null) return b;
    if (b === null) return a;
    return Math.max(a, b);
  }

  private average(values: number[]): number | null {
    const valid = values.filter((value) => Number.isFinite(value));
    if (!valid.length) return null;
    const total = valid.reduce((sum, value) => sum + value, 0);
    return Math.round((total / valid.length) * 100) / 100;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private asOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value
      : undefined;
  }

  private asNumber(value: unknown): number | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  private toNumber(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    if (value && typeof value === 'object') {
      const decimalLike = value as { toNumber?: () => number };
      if (typeof decimalLike.toNumber === 'function') {
        return decimalLike.toNumber();
      }
    }
    return 0;
  }
}
