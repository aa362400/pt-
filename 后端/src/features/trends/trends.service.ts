import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import {
  assertWorkspaceInOrg,
  requireOrg,
} from '../../shared/tenancy/org-scope.js';
import { AGENT_PROVIDER } from '../../agents/agent.module.js';
import type {
  AgentProviderInterface,
  TrendAnalysisTrend,
  TrendDataPoint,
  TrendEvidence,
} from '../../agents/agent-provider.interface.js';
import { AnalyzeTrendsDto, ListTrendsQueryDto } from './trends.dto.js';

const DEFAULT_MARKETPLACE = 'ozon';

@Injectable()
export class TrendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(AGENT_PROVIDER)
    private readonly agentProvider: AgentProviderInterface,
    private readonly tenantDatabase: TenantDatabaseContextService,
  ) {}

  /**
   * Runs a trend analysis through the agent provider and persists every
   * returned trend as a TrendInsight row.
   */
  async analyze(user: JwtPayload, dto: AnalyzeTrendsDto) {
    const orgId = requireOrg(user);
    if (!this.isOzonMarketplace(dto.marketplace)) {
      throw new BadRequestException(
        'Verified trend analysis currently supports Ozon evidence only',
      );
    }
    if (dto.workspaceId) {
      await assertWorkspaceInOrg(this.prisma, orgId, dto.workspaceId);
    }

    const result = await this.agentProvider.runTrendAnalysis(
      {
        category: dto.category,
        marketplace: dto.marketplace,
        timeframe: dto.timeframe,
      },
      {
        orgId,
        userId: user.sub,
        workspaceId: dto.workspaceId,
      },
    );
    const sourceEvidence = this.requireVerifiableOzonTrendEvidence(result);

    const insights = await this.tenantDatabase.run(orgId, (tx) =>
      Promise.all(
        result.trends.map((trend) =>
          tx.trendInsight.create({
            data: {
              organizationId: orgId,
              workspaceId: dto.workspaceId,
              market: dto.marketplace,
              category: dto.category,
              keyword: trend.name,
              score: trend.growth ?? 0,
              growthRate: trend.growth ?? null,
              source: trend.source ?? result.source ?? 'agent',
              data: this.buildTrendData(
                trend,
                result.webSignals,
                sourceEvidence,
              ),
            },
          }),
        ),
      ),
    );
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'trend.analyze',
      resourceType: 'TrendInsight',
      resourceId: `${dto.marketplace}/${dto.category}`,
      after: { count: insights.length, category: dto.category },
    });
    return { count: insights.length, items: insights };
  }

  async findAll(user: JwtPayload, query: ListTrendsQueryDto) {
    const orgId = requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.TrendInsightWhereInput = {
      organizationId: orgId,
      ...(query.keyword
        ? { keyword: { contains: query.keyword, mode: 'insensitive' } }
        : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(query.marketplace ? { market: query.marketplace } : {}),
    };
    let { items, total } = await this.queryTrends(orgId, where, page, limit);
    if (total === 0 && page === 1 && query.category && !query.keyword) {
      await this.analyze(user, {
        category: query.category,
        marketplace: query.marketplace ?? DEFAULT_MARKETPLACE,
        timeframe: query.timeframe,
        workspaceId: query.workspaceId,
      });
      ({ items, total } = await this.queryTrends(orgId, where, page, limit));
    }
    return { items, total, page, limit };
  }

  private async queryTrends(
    organizationId: string,
    where: Prisma.TrendInsightWhereInput,
    page: number,
    limit: number,
  ) {
    const [items, total] = await this.tenantDatabase.run(organizationId, (tx) =>
      Promise.all([
        tx.trendInsight.findMany({
          where,
          orderBy: { observedAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.trendInsight.count({ where }),
      ]),
    );
    return { items, total };
  }

  private buildTrendData(
    trend: TrendAnalysisTrend,
    webSignals?: Record<string, unknown>,
    sourceEvidence?: Record<string, unknown>,
  ): Prisma.InputJsonObject {
    const dataPoints = this.cleanDataPoints(trend.dataPoints);
    const evidence = this.cleanEvidence(trend.evidence);
    return {
      seasonality: trend.seasonality,
      ...(trend.volume ? { volume: trend.volume } : {}),
      ...(trend.dataPointMethod
        ? { dataPointMethod: trend.dataPointMethod }
        : {}),
      ...(dataPoints.length > 0 ? { dataPoints } : {}),
      ...(evidence.length > 0 ? { evidence } : {}),
      ...(webSignals
        ? { webSignals: webSignals as Prisma.InputJsonObject }
        : {}),
      ...(sourceEvidence
        ? { sourceEvidence: sourceEvidence as Prisma.InputJsonObject }
        : {}),
    };
  }

  private cleanDataPoints(points?: TrendDataPoint[]): Prisma.InputJsonArray {
    if (!Array.isArray(points)) {
      return [];
    }
    return points
      .filter((point) => point.date && Number.isFinite(point.value))
      .map((point) => ({
        date: point.date,
        value: point.value,
        ...(point.category ? { category: point.category } : {}),
      }));
  }

  private cleanEvidence(items?: TrendEvidence[]): Prisma.InputJsonArray {
    if (!Array.isArray(items)) {
      return [];
    }
    return items
      .map((item) => ({
        ...(item.title ? { title: item.title } : {}),
        ...(item.url ? { url: item.url } : {}),
        ...(item.snippet ? { snippet: item.snippet } : {}),
        ...(item.fetchedAt ? { fetchedAt: item.fetchedAt } : {}),
      }))
      .filter((item) => Object.keys(item).length > 0);
  }

  private requireVerifiableOzonTrendEvidence(result: {
    source?: string;
    sourceEvidence?: {
      source?: string;
      fetchedAt?: string;
      items?: TrendEvidence[];
    };
    trends: TrendAnalysisTrend[];
  }): Record<string, unknown> {
    const sourceEvidence = result.sourceEvidence;
    const evidenceItems = sourceEvidence?.items ?? [];
    const validEvidence =
      result.source === 'ozon_public_search' &&
      sourceEvidence?.source === 'ozon_public_search' &&
      typeof sourceEvidence.fetchedAt === 'string' &&
      sourceEvidence.fetchedAt.length > 0 &&
      evidenceItems.length >= 2 &&
      evidenceItems.every(
        (item) =>
          typeof item.url === 'string' &&
          /^https:\/\/(?:[^/]+\.)?ozon\.ru\//i.test(item.url) &&
          typeof item.fetchedAt === 'string' &&
          item.fetchedAt.length > 0,
      );
    const validTrends =
      Array.isArray(result.trends) &&
      result.trends.length >= 2 &&
      result.trends.every((trend) => {
        const evidence = trend.evidence ?? [];
        return (
          typeof trend.name === 'string' &&
          trend.name.trim().length > 0 &&
          typeof trend.seasonality === 'string' &&
          trend.seasonality.trim().length > 0 &&
          trend.growth === null &&
          trend.source === 'ozon_public_search' &&
          evidence.length > 0 &&
          evidence.every(
            (item) =>
              typeof item.url === 'string' &&
              /^https:\/\/(?:[^/]+\.)?ozon\.ru\//i.test(item.url) &&
              typeof item.fetchedAt === 'string' &&
              item.fetchedAt.length > 0,
          )
        );
      });
    if (!validEvidence || !validTrends) {
      throw new BadRequestException(
        'Trend analysis requires verifiable Ozon evidence before it can be persisted',
      );
    }
    return sourceEvidence;
  }

  private isOzonMarketplace(marketplace: string): boolean {
    const value = marketplace.trim().toLowerCase();
    return value === 'ozon' || value === 'ozon.ru';
  }

  async remove(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const insight = await this.tenantDatabase.run(orgId, async (tx) => {
      const existing = await tx.trendInsight.findFirst({
        where: { id, organizationId: orgId },
        select: { id: true, keyword: true },
      });
      if (!existing) {
        throw new NotFoundException('Trend insight not found');
      }
      await tx.trendInsight.delete({ where: { id: existing.id } });
      return existing;
    });
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'trend.delete',
      resourceType: 'TrendInsight',
      resourceId: insight.id,
      before: { keyword: insight.keyword },
    });
    return { id: insight.id };
  }
}
