import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { assertWorkspaceInOrg, requireOrg } from '../../shared/tenancy/org-scope.js';
import { CreateImagePromptDto, UpdateImagePromptDto } from './image-prompt.dto.js';

@Injectable()
export class ImagePromptService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: JwtPayload, dto: CreateImagePromptDto) {
    const orgId = requireOrg(user);
    if (dto.workspaceId) {
      await assertWorkspaceInOrg(this.prisma, orgId, dto.workspaceId);
    }
    if (dto.productId) {
      const product = await this.prisma.product.findFirst({
        where: { id: dto.productId, workspace: { organizationId: orgId } },
        select: { id: true },
      });
      if (!product) throw new NotFoundException('Product not found');
    }

    return this.prisma.imagePromptProject.create({
      data: {
        organizationId: orgId,
        workspaceId: dto.workspaceId,
        productId: dto.productId,
        title: dto.title,
        prompt: dto.prompt,
        createdBy: user.sub,
      },
    });
  }

  async findAll(user: JwtPayload) {
    const orgId = requireOrg(user);
    return this.prisma.imagePromptProject.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const item = await this.prisma.imagePromptProject.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!item) throw new NotFoundException('Image prompt project not found');
    return item;
  }

  async update(user: JwtPayload, id: string, dto: UpdateImagePromptDto) {
    const item = await this.findOne(user, id);
    return this.prisma.imagePromptProject.update({
      where: { id: item.id },
      data: {
        title: dto.title,
        prompt: dto.prompt,
        settings: dto.settings as Prisma.InputJsonValue | undefined,
        status: dto.status,
      },
    });
  }

  async remove(user: JwtPayload, id: string) {
    const item = await this.findOne(user, id);
    await this.prisma.imagePromptProject.delete({ where: { id: item.id } });
    return { id: item.id };
  }
}
