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
import {
  CreateKeywordReportDto,
  ListKeywordReportsQueryDto,
} from './keywords.dto.js';

@Injectable()
export class KeywordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(AGENT_PROVIDER)
    private readonly agentProvider: AgentProviderInterface,
  ) {}

  /** Runs keyword analysis via the agent provider and persists the report. */
  async create(user: JwtPayload, dto: CreateKeywordReportDto) {
    const orgId = requireOrg(user);
    if (dto.workspaceId) {
      await assertWorkspaceInOrg(this.prisma, orgId, dto.workspaceId);
    }

    const result = await this.agentProvider.runKeywordAnalysis({
      seedKeywords: dto.seedKeywords,
      marketplace: dto.marketplace,
      locale: dto.country,
    });

    const report = await this.prisma.keywordReport.create({
      data: {
        organizationId: orgId,
        workspaceId: dto.workspaceId,
        query: dto.seedKeywords.join(', '),
        platforms: [dto.marketplace],
        country: dto.country ?? 'US',
        totalKeywords: result.keywords.length,
        keywords: result.keywords as unknown as Prisma.InputJsonValue,
        createdBy: user.sub,
      },
    });
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'keyword.create',
      resourceType: 'KeywordReport',
      resourceId: report.id,
      after: { query: report.query, totalKeywords: report.totalKeywords },
    });
    return report;
  }

  async findAll(user: JwtPayload, query: ListKeywordReportsQueryDto) {
    const orgId = requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.KeywordReportWhereInput = {
      organizationId: orgId,
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(query.search
        ? { query: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.keywordReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { creator: { select: { id: true, name: true } } },
      }),
      this.prisma.keywordReport.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  private async findOwned(orgId: string, id: string) {
    const report = await this.prisma.keywordReport.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!report) {
      throw new NotFoundException('Keyword report not found');
    }
    return report;
  }

  async findOne(user: JwtPayload, id: string) {
    return this.findOwned(requireOrg(user), id);
  }

  async remove(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const report = await this.findOwned(orgId, id);
    await this.prisma.keywordReport.delete({ where: { id: report.id } });
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'keyword.delete',
      resourceType: 'KeywordReport',
      resourceId: report.id,
      before: { query: report.query },
    });
    return { id: report.id };
  }
}
