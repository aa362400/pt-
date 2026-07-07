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
  GenerateListingDto,
  ListListingsQueryDto,
  UpdateListingDto,
} from './listings.dto.js';

@Injectable()
export class ListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(AGENT_PROVIDER)
    private readonly agentProvider: AgentProviderInterface,
  ) {}

  /** Generates listing copy via the agent provider and stores it as a draft. */
  async generate(user: JwtPayload, dto: GenerateListingDto) {
    const orgId = requireOrg(user);
    await assertWorkspaceInOrg(this.prisma, orgId, dto.workspaceId);

    if (dto.productId) {
      const product = await this.prisma.product.findFirst({
        where: { id: dto.productId, workspace: { organizationId: orgId } },
        select: { id: true },
      });
      if (!product) {
        throw new NotFoundException('Product not found');
      }
    }

    const result = await this.agentProvider.runListingGeneration({
      productName: dto.productName,
      description: dto.description,
      keywords: dto.keywords ?? [],
      platform: dto.platform,
      tone: dto.tone,
    });

    const draft = await this.prisma.listingDraft.create({
      data: {
        organizationId: orgId,
        workspaceId: dto.workspaceId,
        productId: dto.productId,
        platform: dto.platform,
        title: result.title,
        bullets: result.bulletPoints,
        description: result.description,
        seoTags: result.keywords,
        attributes:
          result.price !== undefined ? { suggestedPrice: result.price } : {},
        createdBy: user.sub,
      },
    });
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'listing.create',
      resourceType: 'Listing',
      resourceId: draft.id,
      after: { title: draft.title, platform: draft.platform },
    });
    return draft;
  }

  async findAll(user: JwtPayload, query: ListListingsQueryDto) {
    const orgId = requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.ListingDraftWhereInput = {
      organizationId: orgId,
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.listingDraft.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          product: { select: { id: true, title: true } },
          creator: { select: { id: true, name: true } },
        },
      }),
      this.prisma.listingDraft.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  private async findOwned(orgId: string, id: string) {
    const draft = await this.prisma.listingDraft.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!draft) {
      throw new NotFoundException('Listing draft not found');
    }
    return draft;
  }

  async findOne(user: JwtPayload, id: string) {
    return this.findOwned(requireOrg(user), id);
  }

  async update(user: JwtPayload, id: string, dto: UpdateListingDto) {
    const orgId = requireOrg(user);
    const draft = await this.findOwned(orgId, id);
    const before = { title: draft.title, status: draft.status };
    const updated = await this.prisma.listingDraft.update({
      where: { id: draft.id },
      data: {
        title: dto.title,
        bullets: dto.bullets,
        description: dto.description,
        seoTags: dto.seoTags,
        status: dto.status,
      },
    });
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'listing.update',
      resourceType: 'Listing',
      resourceId: draft.id,
      before,
      after: { title: updated.title, status: updated.status },
    });
    return updated;
  }

  async remove(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const draft = await this.findOwned(orgId, id);
    await this.prisma.listingDraft.delete({ where: { id: draft.id } });
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'listing.delete',
      resourceType: 'Listing',
      resourceId: draft.id,
      before: { title: draft.title },
    });
    return { id: draft.id };
  }
}
