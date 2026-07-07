import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import {
  assertWorkspaceInOrg,
  requireOrg,
} from '../../shared/tenancy/org-scope.js';
import { AGENT_PROVIDER } from '../../agents/agent.module.js';
import type { AgentProviderInterface } from '../../agents/agent-provider.interface.js';
import { AnalyzeTrendsDto, ListTrendsQueryDto } from './trends.dto.js';

@Injectable()
export class TrendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(AGENT_PROVIDER)
    private readonly agentProvider: AgentProviderInterface,
  ) {}

  /**
   * Runs a trend analysis through the agent provider and persists every
   * returned trend as a TrendInsight row.
   */
  async analyze(user: JwtPayload, dto: AnalyzeTrendsDto) {
    const orgId = requireOrg(user);
    if (dto.workspaceId) {
      await assertWorkspaceInOrg(this.prisma, orgId, dto.workspaceId);
    }

    const result = await this.agentProvider.runTrendAnalysis({
      category: dto.category,
      marketplace: dto.marketplace,
      timeframe: dto.timeframe,
    });

    const insights = await this.prisma.$transaction(
      result.trends.map((trend) =>
        this.prisma.trendInsight.create({
          data: {
            organizationId: orgId,
            workspaceId: dto.workspaceId,
            market: dto.marketplace,
            category: dto.category,
            keyword: trend.name,
            score: trend.growth,
            growthRate: trend.growth,
            source: 'agent',
            data: { seasonality: trend.seasonality },
          },
        }),
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
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.trendInsight.findMany({
        where,
        orderBy: { observedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.trendInsight.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async remove(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const insight = await this.prisma.trendInsight.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true, keyword: true },
    });
    if (!insight) {
      throw new NotFoundException('Trend insight not found');
    }
    await this.prisma.trendInsight.delete({ where: { id: insight.id } });
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
