import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import {
  assertWorkspaceInOrg,
  requireOrg,
} from '../../shared/tenancy/org-scope.js';
import type {
  BatchCalculateOzonPricingDto,
  CalculateOzonPricingDto,
  CalculateProfitDto,
  ListProfitCalcsQueryDto,
} from './profit-calculator.dto.js';
import { CommerceMcpClientService } from '../../shared/commerce-mcp/commerce-mcp-client.service.js';
import { AuditService } from '../../shared/audit/audit.service.js';

export interface OzonPricingToolResult {
  mode: 'calculate' | 'evaluate';
  decision: 'PASS' | 'CAUTION' | 'REJECT' | 'BLOCKED';
  inputs?: {
    purchaseCostCny: number;
    otherCostCny: number;
    weightGram: number;
    targetMarginRate: number;
    advertisingRate: number;
    fixedCostRate: number;
    exchangeRateRubPerCny: number;
  };
  result: {
    salePriceCny: number;
    freightCny: number;
    commissionFeeCny: number;
    acquiringFeeCny: number;
    advertisingFeeCny: number;
    fixedCostFeeCny: number;
    profitCny: number;
    marginRate: number;
  };
  source: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OzonPricingBatchToolResult {
  mode: 'batch';
  items: Array<{
    itemId: string;
    ok: boolean;
    result?: OzonPricingToolResult;
    error?: { code: string; message: string };
    context?: OzonPricingRowContext;
  }>;
  summary: Record<string, number>;
  source: Record<string, unknown>;
}

export interface OzonPricingRowContext {
  productTitle?: string;
  sku?: string;
  competitorPriceCny?: number;
  competitorUrl?: string;
  sourceUrl?: string;
  note1?: string;
  note2?: string;
  declaredWeightGram?: number;
  actualWeightGram?: number;
  sourceFileName?: string;
  sourceFileSha256?: string;
  sourceExcelRow?: number;
}

@Injectable()
export class ProfitCalculatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantDatabase: TenantDatabaseContextService,
    private readonly commerceMcp: CommerceMcpClientService,
    private readonly audit: AuditService,
  ) {}

  getOzonCategories() {
    return this.commerceMcp.callTool('ozon_pricing_engine', {
      mode: 'categories',
    });
  }

  async calculateOzon(user: JwtPayload, dto: CalculateOzonPricingDto) {
    const orgId = requireOrg(user);
    if (dto.workspaceId) {
      await assertWorkspaceInOrg(this.prisma, orgId, dto.workspaceId);
    }
    const result = (await this.commerceMcp.callTool(
      'ozon_pricing_engine',
      this.toOzonToolArgs(dto),
    )) as OzonPricingToolResult;
    if (dto.persist === false) return result;
    const calculation = await this.persistOzonCalculation(user, dto, result);
    return {
      ...result,
      calculationId: calculation.id,
      persistedAt: calculation.createdAt,
    };
  }

  async calculateOzonBatch(
    user: JwtPayload,
    dto: BatchCalculateOzonPricingDto,
  ) {
    const orgId = requireOrg(user);
    const workspaceIds = [
      ...new Set(
        dto.items
          .map((item) => item.workspaceId)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    for (const workspaceId of workspaceIds) {
      await assertWorkspaceInOrg(this.prisma, orgId, workspaceId);
    }
    const batch = (await this.commerceMcp.callTool('ozon_pricing_engine', {
      mode: 'batch',
      items: dto.items.map((item, index) => ({
        item_id: item.itemId || String(index + 1),
        ...this.toOzonToolArgs(item),
      })),
    })) as OzonPricingBatchToolResult;
    const batchWithContext: OzonPricingBatchToolResult = {
      ...batch,
      items: batch.items.map((row, index) => ({
        ...row,
        context: this.toOzonRowContext(dto.items[index]),
      })),
    };
    if (dto.persist === false) return batchWithContext;

    const items = [];
    for (let index = 0; index < batchWithContext.items.length; index += 1) {
      const row = batchWithContext.items[index];
      const input = dto.items[index];
      if (!row.ok || !row.result) {
        items.push(row);
        continue;
      }
      const calculation = await this.persistOzonCalculation(
        user,
        input,
        row.result,
        row.itemId,
      );
      items.push({
        ...row,
        calculationId: calculation.id,
        persistedAt: calculation.createdAt,
      });
    }
    return { ...batchWithContext, items };
  }

  private toOzonRowContext(
    dto: CalculateOzonPricingDto | undefined,
  ): OzonPricingRowContext | undefined {
    if (!dto) return undefined;
    return {
      productTitle: dto.productTitle,
      sku: dto.sku,
      competitorPriceCny: dto.competitorPriceCny,
      competitorUrl: dto.competitorUrl,
      sourceUrl: dto.sourceUrl,
      note1: dto.note1,
      note2: dto.note2,
      declaredWeightGram: dto.declaredWeightGram,
      actualWeightGram: dto.actualWeightGram,
      sourceFileName: dto.sourceFileName,
      sourceFileSha256: dto.sourceFileSha256,
      sourceExcelRow: dto.sourceExcelRow,
    };
  }

  private toOzonToolArgs(dto: CalculateOzonPricingDto) {
    return {
      mode: dto.mode ?? (dto.observedSalePriceCny ? 'evaluate' : 'calculate'),
      category: dto.category,
      logistics: dto.logistics ?? 'standard',
      purchase_cost: dto.purchaseCost,
      other_cost: dto.otherCost ?? 0,
      weight_gram: dto.weightGram,
      target_margin_rate: dto.targetMarginRate ?? 0.2,
      advertising_rate: dto.advertisingRate ?? 0.2,
      fixed_cost_rate: dto.fixedCostRate ?? 0.085,
      ...(dto.observedSalePriceCny
        ? { observed_sale_price_cny: dto.observedSalePriceCny }
        : {}),
      ...(dto.exchangeRate ? { exchange_rate: dto.exchangeRate } : {}),
      ...(dto.listingMultiplier
        ? { listing_multiplier: dto.listingMultiplier }
        : {}),
      ...(dto.lengthCm ? { length_cm: dto.lengthCm } : {}),
      ...(dto.widthCm ? { width_cm: dto.widthCm } : {}),
      ...(dto.heightCm ? { height_cm: dto.heightCm } : {}),
      has_battery: dto.hasBattery ?? false,
      has_msds: dto.hasMsds ?? false,
    };
  }

  private async persistOzonCalculation(
    user: JwtPayload,
    dto: CalculateOzonPricingDto,
    response: OzonPricingToolResult,
    itemId?: string,
  ) {
    const orgId = requireOrg(user);
    const inputs = response.inputs ?? {
      purchaseCostCny: dto.purchaseCost,
      otherCostCny: dto.otherCost ?? 0,
      weightGram: dto.weightGram,
      targetMarginRate: dto.targetMarginRate ?? 0.2,
      advertisingRate: dto.advertisingRate ?? 0.2,
      fixedCostRate: dto.fixedCostRate ?? 0.085,
      exchangeRateRubPerCny: dto.exchangeRate ?? 0,
    };
    const result = response.result;
    const totalCost =
      inputs.purchaseCostCny +
      inputs.otherCostCny +
      result.freightCny +
      result.commissionFeeCny +
      result.acquiringFeeCny +
      result.advertisingFeeCny +
      result.fixedCostFeeCny;
    const calculation = await this.tenantDatabase.run(orgId, (tx) =>
      tx.profitCalculation.create({
        data: {
          organizationId: orgId,
          workspaceId: dto.workspaceId ?? null,
          productId: dto.productId ?? null,
          currency: 'CNY',
          salePrice: result.salePriceCny,
          productCost: inputs.purchaseCostCny,
          packagingCost: 0,
          shippingCost: result.freightCny,
          platformFee: result.commissionFeeCny,
          paymentFee: result.acquiringFeeCny,
          adCost: result.advertisingFeeCny,
          storageCost: 0,
          otherCost: inputs.otherCostCny + result.fixedCostFeeCny,
          totalCost,
          estimatedProfit: result.profitCny,
          profitMargin: result.marginRate * 100,
          roi: totalCost > 0 ? (result.profitCny / totalCost) * 100 : 0,
          scenarios: JSON.parse(
            JSON.stringify([
              {
                type: 'ozon-workbook-pricing',
                itemId: itemId ?? dto.itemId ?? null,
                input: dto,
                output: response,
                source: response.source,
              },
            ]),
          ) as Prisma.InputJsonValue,
          createdBy: user.sub,
        },
      }),
    );
    try {
      await this.audit.appendStrict({
        organizationId: orgId,
        actorId: user.sub,
        action: 'ozon.pricing.calculated',
        resourceType: 'ProfitCalculation',
        resourceId: calculation.id,
        after: {
          mode: response.mode,
          decision: response.decision,
          itemId: itemId ?? dto.itemId ?? null,
          salePriceCny: result.salePriceCny,
          profitCny: result.profitCny,
          marginRate: result.marginRate,
          source: response.source,
          sourceFileName: dto.sourceFileName ?? null,
          sourceFileSha256: dto.sourceFileSha256 ?? null,
          sourceExcelRow: dto.sourceExcelRow ?? null,
        },
      });
    } catch (error) {
      await this.tenantDatabase.run(orgId, (tx) =>
        tx.profitCalculation.delete({ where: { id: calculation.id } }),
      );
      throw error;
    }
    return calculation;
  }

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

    const calculation = await this.tenantDatabase.run(orgId, (tx) =>
      tx.profitCalculation.create({
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
      }),
    );

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

    const [items, total] = await this.tenantDatabase.run(orgId, (tx) =>
      Promise.all([
        tx.profitCalculation.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.profitCalculation.count({ where }),
      ]),
    );
    return { items, total, page, limit };
  }

  private async findOwned(
    tx: Prisma.TransactionClient,
    orgId: string,
    id: string,
  ) {
    const calc = await tx.profitCalculation.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!calc) {
      throw new NotFoundException('Profit calculation not found');
    }
    return calc;
  }

  async findOne(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    return this.tenantDatabase.run(orgId, (tx) =>
      this.findOwned(tx, orgId, id),
    );
  }

  async remove(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    return this.tenantDatabase.run(orgId, async (tx) => {
      const existing = await this.findOwned(tx, orgId, id);
      await tx.profitCalculation.delete({ where: { id: existing.id } });
      return { id: existing.id };
    });
  }
}
