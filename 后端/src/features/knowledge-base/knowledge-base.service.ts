import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import {
  assertWorkspaceInOrg,
  requireOrg,
} from '../../shared/tenancy/org-scope.js';
import {
  CreateKnowledgeDocDto,
  ListKnowledgeDocsQueryDto,
  UpdateKnowledgeDocDto,
} from './knowledge-base.dto.js';

@Injectable()
export class KnowledgeBaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantDatabase: TenantDatabaseContextService,
  ) {}

  async create(user: JwtPayload, dto: CreateKnowledgeDocDto) {
    const orgId = requireOrg(user);
    if (dto.workspaceId) {
      await assertWorkspaceInOrg(this.prisma, orgId, dto.workspaceId);
    }
    return this.tenantDatabase.run(orgId, (tx) =>
      tx.knowledgeDocument.create({
        data: {
          organizationId: orgId,
          workspaceId: dto.workspaceId,
          title: dto.title,
          content: dto.content,
          tags: dto.tags ?? [],
          visibility: dto.visibility ?? 'ORGANIZATION',
          fileAssetId: dto.fileAssetId,
          createdBy: user.sub,
        },
      }),
    );
  }

  async findAll(user: JwtPayload, query: ListKnowledgeDocsQueryDto) {
    const orgId = requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    // PRIVATE docs are only visible to their creator.
    const where: Prisma.KnowledgeDocumentWhereInput = {
      organizationId: orgId,
      OR: [{ visibility: { not: 'PRIVATE' } }, { createdBy: user.sub }],
      ...(query.search
        ? { title: { contains: query.search, mode: 'insensitive' } }
        : {}),
      ...(query.tag ? { tags: { has: query.tag } } : {}),
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
    };

    const [items, total] = await this.tenantDatabase.run(orgId, (tx) =>
      Promise.all([
        tx.knowledgeDocument.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          include: { creator: { select: { id: true, name: true } } },
        }),
        tx.knowledgeDocument.count({ where }),
      ]),
    );
    return { items, total, page, limit };
  }

  private async findOwned(
    tx: Prisma.TransactionClient,
    user: JwtPayload,
    id: string,
  ) {
    const orgId = requireOrg(user);
    const doc = await tx.knowledgeDocument.findFirst({
      where: {
        id,
        organizationId: orgId,
        OR: [{ visibility: { not: 'PRIVATE' } }, { createdBy: user.sub }],
      },
    });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }
    return doc;
  }

  async findOne(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    return this.tenantDatabase.run(orgId, (tx) => this.findOwned(tx, user, id));
  }

  async update(user: JwtPayload, id: string, dto: UpdateKnowledgeDocDto) {
    const orgId = requireOrg(user);
    return this.tenantDatabase.run(orgId, async (tx) => {
      const doc = await this.findOwned(tx, user, id);
      return tx.knowledgeDocument.update({
        where: { id: doc.id },
        data: {
          title: dto.title,
          content: dto.content,
          tags: dto.tags,
          visibility: dto.visibility,
        },
      });
    });
  }

  async remove(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    return this.tenantDatabase.run(orgId, async (tx) => {
      const doc = await this.findOwned(tx, user, id);
      await tx.knowledgeDocument.delete({ where: { id: doc.id } });
      return { id: doc.id };
    });
  }
}
