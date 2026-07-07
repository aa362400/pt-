import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { requireOrg } from '../../shared/tenancy/org-scope.js';
import {
  CreatePromptDto,
  ListPromptsQueryDto,
  UpdatePromptDto,
} from './prompts.dto.js';

@Injectable()
export class PromptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(user: JwtPayload, dto: CreatePromptDto) {
    const orgId = requireOrg(user);
    const prompt = await this.prisma.promptTemplate.create({
      data: {
        organizationId: orgId,
        title: dto.title,
        description: dto.description,
        category: dto.category,
        content: dto.content,
        variables: dto.variables ?? [],
        createdBy: user.sub,
      },
    });
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'prompt.create',
      resourceType: 'Prompt',
      resourceId: prompt.id,
      after: { title: prompt.title, category: prompt.category },
    });
    return prompt;
  }

  async findAll(user: JwtPayload, query: ListPromptsQueryDto) {
    const orgId = requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.PromptTemplateWhereInput = {
      organizationId: orgId,
      ...(query.category ? { category: query.category } : {}),
      ...(query.search
        ? { title: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.promptTemplate.findMany({
        where,
        orderBy: [{ usageCount: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { creator: { select: { id: true, name: true } } },
      }),
      this.prisma.promptTemplate.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  private async findOwned(orgId: string, id: string) {
    const prompt = await this.prisma.promptTemplate.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!prompt) {
      throw new NotFoundException('Prompt template not found');
    }
    return prompt;
  }

  async findOne(user: JwtPayload, id: string) {
    return this.findOwned(requireOrg(user), id);
  }

  /** Marks a template as used and returns its content for consumption. */
  async use(user: JwtPayload, id: string) {
    const prompt = await this.findOwned(requireOrg(user), id);
    const updated = await this.prisma.promptTemplate.update({
      where: { id: prompt.id },
      data: { usageCount: { increment: 1 } },
      select: { id: true, content: true, variables: true, usageCount: true },
    });
    return updated;
  }

  async update(user: JwtPayload, id: string, dto: UpdatePromptDto) {
    const orgId = requireOrg(user);
    const prompt = await this.findOwned(orgId, id);
    const before = { title: prompt.title, category: prompt.category };
    const updated = await this.prisma.promptTemplate.update({
      where: { id: prompt.id },
      data: {
        title: dto.title,
        description: dto.description,
        category: dto.category,
        content: dto.content,
        variables:
          dto.variables !== undefined
            ? (dto.variables as Prisma.InputJsonValue)
            : undefined,
      },
    });
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'prompt.update',
      resourceType: 'Prompt',
      resourceId: prompt.id,
      before,
      after: { title: updated.title, category: updated.category },
    });
    return updated;
  }

  async remove(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const prompt = await this.findOwned(orgId, id);
    await this.prisma.promptTemplate.delete({ where: { id: prompt.id } });
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'prompt.delete',
      resourceType: 'Prompt',
      resourceId: prompt.id,
      before: { title: prompt.title },
    });
    return { id: prompt.id };
  }
}
