import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { requireOrg } from '../../shared/tenancy/org-scope.js';
import {
  CreateImagePromptDto,
  UpdateImagePromptDto,
} from './image-prompt.dto.js';

@Injectable()
export class ImagePromptService {
  constructor(
    _prisma: PrismaService,
    private readonly tenantDatabase: TenantDatabaseContextService,
  ) {}

  async create(user: JwtPayload, dto: CreateImagePromptDto) {
    const orgId = requireOrg(user);
    return this.tenantDatabase.run(orgId, async (tx) => {
      if (dto.workspaceId) {
        const workspace = await tx.workspace.findFirst({
          where: { id: dto.workspaceId, organizationId: orgId },
          select: { id: true },
        });
        if (!workspace) throw new NotFoundException('Workspace not found');
      }
      if (dto.productId) {
        const product = await tx.product.findFirst({
          where: { id: dto.productId, workspace: { organizationId: orgId } },
          select: { id: true },
        });
        if (!product) throw new NotFoundException('Product not found');
      }
      return tx.imagePromptProject.create({
        data: {
          organizationId: orgId,
          workspaceId: dto.workspaceId,
          productId: dto.productId,
          title: dto.title,
          prompt: dto.prompt,
          createdBy: user.sub,
        },
      });
    });
  }

  async findAll(user: JwtPayload) {
    const orgId = requireOrg(user);
    return this.tenantDatabase.run(orgId, (tx) =>
      tx.imagePromptProject.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async findOne(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const item = await this.tenantDatabase.run(orgId, (tx) =>
      tx.imagePromptProject.findFirst({
        where: { id, organizationId: orgId },
      }),
    );
    if (!item) throw new NotFoundException('Image prompt project not found');
    return item;
  }

  async update(user: JwtPayload, id: string, dto: UpdateImagePromptDto) {
    const item = await this.findOne(user, id);
    return this.tenantDatabase.run(requireOrg(user), (tx) =>
      tx.imagePromptProject.update({
        where: { id: item.id },
        data: {
          title: dto.title,
          prompt: dto.prompt,
          settings: dto.settings as Prisma.InputJsonValue | undefined,
          status: dto.status,
        },
      }),
    );
  }

  async remove(user: JwtPayload, id: string) {
    const item = await this.findOne(user, id);
    await this.tenantDatabase.run(requireOrg(user), (tx) =>
      tx.imagePromptProject.delete({ where: { id: item.id } }),
    );
    return { id: item.id };
  }
}
