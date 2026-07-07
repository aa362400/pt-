import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import {
  assertWorkspaceInOrg,
  requireOrg,
} from '../../shared/tenancy/org-scope.js';
import type {
  CalculateProfitDto,
  ListProfitCalcsQueryDto,
} from './profit-calculator.dto.js';

@Injectable()
export class ProfitCalculatorService {
  constructor(private readonly prisma: PrismaService) {}

  async calculate(user: JwtPayload, dto: CalculateProfitDto) {
    const orgId = requireOrg(user);

    if (dto.workspaceId) {
      await assertWorkspaceInOrg(this.prisma, orgId, dto.workspaceId);
    }

    const productCost = dto.productCost;
    const packagingCost = dto.packagingCost ?? 0;
    const shippingCost = dto.shippingCost ?? 0;
    const platformFee = dto.platformFee ?? 0;
    const paymentFee = dto.paymentFee ?? 0;
    const adCost = dto.adCost ?? 0;
    const storageCost = dto.storageCost ?? 0;
    const otherCost = dto.otherCost ?? 0;

    const totalCost =
      productCost +
      packagingCost +
      shippingCost +
      platformFee +
      paymentFee +
      adCost +
      storageCost +
      otherCost;

    const estimatedProfit = dto.salePrice - totalCost;
    const profitMargin =
      dto.salePrice > 0
        ? Math.round((estimatedProfit / dto.salePrice) * 10000) / 100
        : 0;
    const roi =
      totalCost > 0
        ? Math.round((estimatedProfit / totalCost) * 10000) / 100
        : 0;

    const calculation = await this.prisma.profitCalculation.create({
      data: {
        organizationId: orgId,
        workspaceId: dto.workspaceId ?? null,
        productId: dto.productId ?? null,
        currency: dto.currency ?? 'USD',
        salePrice: dto.salePrice,
        productCost,
        packagingCost,
        shippingCost,
        platformFee,
        paymentFee,
        adCost,
        storageCost,
        otherCost,
        totalCost,
        estimatedProfit,
        profitMargin,
        roi,
        createdBy: user.sub,
      },
    });

    return calculation;
  }

  async findAll(user: JwtPayload, query: ListProfitCalcsQueryDto) {
    const orgId = requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Record<string, unknown> = {
      organizationId: orgId,
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.profitCalculation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.profitCalculation.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  private async findOwned(orgId: string, id: string) {
    const calc = await this.prisma.profitCalculation.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!calc) {
      throw new NotFoundException('Profit calculation not found');
    }
    return calc;
  }

  async findOne(user: JwtPayload, id: string) {
    return this.findOwned(requireOrg(user), id);
  }

  async remove(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const existing = await this.findOwned(orgId, id);
    await this.prisma.profitCalculation.delete({ where: { id: existing.id } });
    return { id: existing.id };
  }
}
