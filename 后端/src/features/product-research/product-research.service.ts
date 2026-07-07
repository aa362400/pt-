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
  CreateResearchReportDto,
  ListResearchReportsQueryDto,
} from './product-research.dto.js';

@Injectable()
export class ProductResearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(AGENT_PROVIDER)
    private readonly agentProvider: AgentProviderInterface,
  ) {}

  /** Runs research via the agent provider and persists the report. */
  async create(user: JwtPayload, dto: CreateResearchReportDto) {
    const orgId = requireOrg(user);
    if (dto.workspaceId) {
      await assertWorkspaceInOrg(this.prisma, orgId, dto.workspaceId);
    }

    const result = await this.agentProvider.runProductResearch({
      productName: dto.query,
      marketplace: dto.platform,
    });

    const report = await this.prisma.productResearchReport.create({
      data: {
        organizationId: orgId,
        workspaceId: dto.workspaceId,
        query: dto.query,
        platform: dto.platform,
        summary: result.summary,
        opportunities: {
          competitors: result.competitors,
          priceRange: result.priceRange,
          rating: result.rating,
        } as Prisma.InputJsonValue,
        status: 'COMPLETED',
        createdBy: user.sub,
      },
    });
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'product-research.create',
      resourceType: 'ProductResearch',
      resourceId: report.id,
      after: { query: report.query, platform: report.platform },
    });
    return report;
  }

  async findAll(user: JwtPayload, query: ListResearchReportsQueryDto) {
    const orgId = requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.ProductResearchReportWhereInput = {
      organizationId: orgId,
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(query.search
        ? { query: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.productResearchReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { creator: { select: { id: true, name: true } } },
      }),
      this.prisma.productResearchReport.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  private async findOwned(orgId: string, id: string) {
    const report = await this.prisma.productResearchReport.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!report) {
      throw new NotFoundException('Research report not found');
    }
    return report;
  }

  async findOne(user: JwtPayload, id: string) {
    return this.findOwned(requireOrg(user), id);
  }

  async remove(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const report = await this.findOwned(orgId, id);
    await this.prisma.productResearchReport.delete({
      where: { id: report.id },
    });
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'product-research.delete',
      resourceType: 'ProductResearch',
      resourceId: report.id,
      before: { query: report.query },
    });
    return { id: report.id };
  }
}
