import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import {
  assertWorkspaceInOrg,
  requireOrg,
} from '../../shared/tenancy/org-scope.js';
import {
  CreateProductDto,
  ListProductsQueryDto,
  UpdateProductDto,
} from './products.dto.js';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(user: JwtPayload, dto: CreateProductDto) {
    const orgId = requireOrg(user);
    await assertWorkspaceInOrg(this.prisma, orgId, dto.workspaceId);

    const product = await this.prisma.product.create({
      data: {
        workspaceId: dto.workspaceId,
        title: dto.title,
        sku: dto.sku,
        asinOrExternalId: dto.asinOrExternalId,
        images: dto.images ?? [],
        cost: dto.cost ?? 0,
        price: dto.price ?? 0,
        currency: dto.currency ?? 'USD',
        status: dto.status ?? 'DRAFT',
        metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'product.create',
      resourceType: 'Product',
      resourceId: product.id,
      after: { title: product.title, workspaceId: product.workspaceId },
    });
    return product;
  }

  async findAll(user: JwtPayload, query: ListProductsQueryDto) {
    const orgId = requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.ProductWhereInput = {
      workspace: { organizationId: orgId },
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { sku: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  private async findOwned(orgId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, workspace: { organizationId: orgId } },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  async findOne(user: JwtPayload, id: string) {
    return this.findOwned(requireOrg(user), id);
  }

  async update(user: JwtPayload, id: string, dto: UpdateProductDto) {
    const orgId = requireOrg(user);
    const existing = await this.findOwned(orgId, id);
    const before = {
      title: existing.title,
      status: existing.status,
      price: existing.price,
    };
    const updated = await this.prisma.product.update({
      where: { id: existing.id },
      data: {
        title: dto.title,
        sku: dto.sku,
        asinOrExternalId: dto.asinOrExternalId,
        images: dto.images,
        cost: dto.cost,
        price: dto.price,
        currency: dto.currency,
        status: dto.status,
        metadata:
          dto.metadata !== undefined
            ? (dto.metadata as Prisma.InputJsonValue)
            : undefined,
      },
    });
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'product.update',
      resourceType: 'Product',
      resourceId: existing.id,
      before,
      after: {
        title: updated.title,
        status: updated.status,
        price: updated.price,
      },
    });
    return updated;
  }

  async remove(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const existing = await this.findOwned(orgId, id);
    await this.prisma.product.delete({ where: { id: existing.id } });
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'product.delete',
      resourceType: 'Product',
      resourceId: existing.id,
      before: { title: existing.title },
    });
    return { id: existing.id };
  }
}
