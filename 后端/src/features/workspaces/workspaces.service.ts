import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { requireOrg } from '../../shared/tenancy/org-scope.js';
import {
  CreateWorkspaceDto,
  ListWorkspacesQueryDto,
  UpdateWorkspaceDto,
} from './workspaces.dto.js';

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(user: JwtPayload, dto: CreateWorkspaceDto) {
    const orgId = requireOrg(user);
    const workspace = await this.prisma.workspace.create({
      data: {
        organizationId: orgId,
        name: dto.name,
        channelType: dto.channelType,
        marketplace: dto.marketplace,
        currency: dto.currency ?? 'USD',
        timezone: dto.timezone ?? 'Asia/Shanghai',
      },
    });
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'workspace.create',
      resourceType: 'Workspace',
      resourceId: workspace.id,
      after: { name: workspace.name, channelType: workspace.channelType },
    });
    return workspace;
  }

  async findAll(user: JwtPayload, query: ListWorkspacesQueryDto) {
    const orgId = requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = { organizationId: orgId };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.workspace.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { products: true, agentRuns: true } } },
      }),
      this.prisma.workspace.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async findOne(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const workspace = await this.prisma.workspace.findFirst({
      where: { id, organizationId: orgId },
      include: {
        _count: {
          select: { products: true, agentRuns: true, listingDrafts: true },
        },
      },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    return workspace;
  }

  async update(user: JwtPayload, id: string, dto: UpdateWorkspaceDto) {
    const orgId = requireOrg(user);
    const existing = await this.prisma.workspace.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Workspace not found');
    }
    return this.prisma.workspace.update({
      where: { id: existing.id },
      data: {
        name: dto.name,
        marketplace: dto.marketplace,
        currency: dto.currency,
        timezone: dto.timezone,
        status: dto.status,
      },
    });
  }

  async remove(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const existing = await this.prisma.workspace.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true, name: true },
    });
    if (!existing) {
      throw new NotFoundException('Workspace not found');
    }
    await this.prisma.workspace.delete({ where: { id: existing.id } });
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'workspace.delete',
      resourceType: 'Workspace',
      resourceId: existing.id,
      before: { name: existing.name },
    });
    return { id: existing.id };
  }
}
