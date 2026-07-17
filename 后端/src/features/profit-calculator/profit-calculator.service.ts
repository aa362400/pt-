import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
  status?: 'BLOCKED';
  decision: 'PASS' | 'CAUTION' | 'REJECT' | 'BLOCKED' | 'DATA_INSUFFICIENT';
  missingFields?: string[];
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
  } | null;
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

type PersistableOzonPricingToolResult = OzonPricingToolResult & {
  decision: 'PASS' | 'CAUTION' | 'REJECT';
  inputs: NonNullable<OzonPricingToolResult['inputs']>;
  result: NonNullable<OzonPricingToolResult['result']>;
};

const REQUIRED_PROFIT_COST_FIELDS = [
  'packagingCost',
  'shippingCost',
  'domesticTransportCost',
  'internationalLogisticsCost',
  'platformFee',
  'paymentFee',
  'adCost',
  'storageCost',
  'taxCost',
  'refundLossReserve',
  'exchangeRateRiskReserve',
  'otherCost',
] as const satisfies ReadonlyArray<keyof CalculateProfitDto>;

type CompleteProfitCostBreakdown = {
  salePrice: number;
  productCost: number;
  packagingCost: number;
  shippingCost: number;
  domesticTransportCost: number;
  internationalLogisticsCost: number;
  platformFee: number;
  paymentFee: number;
  adCost: number;
  storageCost: number;
  taxCost: number;
  refundLossReserve: number;
  exchangeRateRiskReserve: number;
  otherCost: number;
  currency: string;
};

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
    this.assertCompleteOzonPhysicalInput(dto);
    if (dto.workspaceId) {
      await assertWorkspaceInOrg(this.prisma, orgId, dto.workspaceId);
    }
    const result = (await this.commerceMcp.callTool(
      'ozon_pricing_engine',
      this.toOzonToolArgs(dto),
    )) as OzonPricingToolResult;
    if (dto.persist === false || this.isBlockedOzonResult(result)) {
      return result;
    }
    this.assertPersistableOzonResult(result);
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
    dto.items.forEach((item) => this.assertCompleteOzonPhysicalInput(item));
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
      if (!row.ok || !row.result || this.isBlockedOzonResult(row.result)) {
        items.push(row);
        continue;
      }
      this.assertPersistableOzonResult(row.result);
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

  private assertCompleteOzonPhysicalInput(dto: CalculateOzonPricingDto) {
    const missingFields: string[] = [];
    if (!dto.logistics) missingFields.push('logistics');
    for (const field of [
      'purchaseCost',
      'weightGram',
      'lengthCm',
      'widthCm',
      'heightCm',
    ] as const) {
      const value = dto[field];
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        missingFields.push(field);
      }
    }
    if (missingFields.length > 0) {
      throw new BadRequestException({
        code: 'OZON_PRICING_DATA_INSUFFICIENT',
        message:
          'Ozon pricing requires explicit logistics, positive purchase cost, weight, and dimensions.',
        missingFields,
      });
    }
  }

  private isBlockedOzonResult(response: OzonPricingToolResult) {
    return (
      response.decision === 'BLOCKED' ||
      response.decision === 'DATA_INSUFFICIENT' ||
      response.result === null
    );
  }

  private assertPersistableOzonResult(
    response: OzonPricingToolResult,
  ): asserts response is PersistableOzonPricingToolResult {
    if (!response.inputs || !response.result) {
      throw new BadGatewayException({
        code: 'OZON_PRICING_RESPONSE_INCOMPLETE',
        message:
          'The Ozon pricing engine returned a non-blocked response without complete inputs and result.',
      });
    }
  }

  private toOzonToolArgs(dto: CalculateOzonPricingDto) {
    return {
      mode: dto.mode ?? (dto.observedSalePriceCny ? 'evaluate' : 'calculate'),
      category: dto.category,
      logistics: dto.logistics,
      purchase_cost: dto.purchaseCost,
      weight_gram: dto.weightGram,
      length_cm: dto.lengthCm,
      width_cm: dto.widthCm,
      height_cm: dto.heightCm,
      ...(dto.otherCost !== undefined ? { other_cost: dto.otherCost } : {}),
      ...(dto.targetMarginRate !== undefined
        ? { target_margin_rate: dto.targetMarginRate }
        : {}),
      ...(dto.advertisingRate !== undefined
        ? { advertising_rate: dto.advertisingRate }
        : {}),
      ...(dto.fixedCostRate !== undefined
        ? { fixed_cost_rate: dto.fixedCostRate }
        : {}),
      ...(dto.observedSalePriceCny !== undefined
        ? { observed_sale_price_cny: dto.observedSalePriceCny }
        : {}),
      ...(dto.exchangeRate !== undefined
        ? { exchange_rate: dto.exchangeRate }
        : {}),
      ...(dto.listingMultiplier !== undefined
        ? { listing_multiplier: dto.listingMultiplier }
        : {}),
      ...(dto.hasBattery !== undefined ? { has_battery: dto.hasBattery } : {}),
      ...(dto.hasMsds !== undefined ? { has_msds: dto.hasMsds } : {}),
    };
  }

  private async persistOzonCalculation(
    user: JwtPayload,
    dto: CalculateOzonPricingDto,
    response: PersistableOzonPricingToolResult,
    itemId?: string,
  ) {
    const orgId = requireOrg(user);
    const inputs = response.inputs;
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

  private completeProfitCostBreakdown(
    dto: CalculateProfitDto,
  ): CompleteProfitCostBreakdown {
    const missingFields = REQUIRED_PROFIT_COST_FIELDS.filter(
      (field) => dto[field] === undefined,
    );
    const invalidFields = [
      ...(typeof dto.salePrice !== 'number' ||
      !Number.isFinite(dto.salePrice) ||
      dto.salePrice <= 0
        ? ['salePrice']
        : []),
      ...(typeof dto.productCost !== 'number' ||
      !Number.isFinite(dto.productCost) ||
      dto.productCost <= 0
        ? ['productCost']
        : []),
      ...REQUIRED_PROFIT_COST_FIELDS.filter((field) => {
        const value = dto[field];
        return (
          value !== undefined &&
          (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
        );
      }),
    ];
    if (missingFields.length > 0 || invalidFields.length > 0) {
      throw new BadRequestException({
        code: 'PROFIT_COST_DATA_INSUFFICIENT',
        message:
          'Profit calculation requires positive sale/product prices and every cost component explicitly, using 0 only when the evidenced cost is none.',
        missingFields,
        invalidFields,
      });
    }

    return {
      salePrice: dto.salePrice,
      productCost: dto.productCost,
      packagingCost: dto.packagingCost as number,
      shippingCost: dto.shippingCost as number,
      domesticTransportCost: dto.domesticTransportCost as number,
      internationalLogisticsCost: dto.internationalLogisticsCost as number,
      platformFee: dto.platformFee as number,
      paymentFee: dto.paymentFee as number,
      adCost: dto.adCost as number,
      storageCost: dto.storageCost as number,
      taxCost: dto.taxCost as number,
      refundLossReserve: dto.refundLossReserve as number,
      exchangeRateRiskReserve: dto.exchangeRateRiskReserve as number,
      otherCost: dto.otherCost as number,
      currency: dto.currency ?? 'USD',
    };
  }

  async calculate(user: JwtPayload, dto: CalculateProfitDto) {
    const orgId = requireOrg(user);

    const costBreakdown = this.completeProfitCostBreakdown(dto);

    if (dto.workspaceId) {
      await assertWorkspaceInOrg(this.prisma, orgId, dto.workspaceId);
    }

    const productCost = costBreakdown.productCost;
    const packagingCost = costBreakdown.packagingCost;
    const shippingCost =
      costBreakdown.shippingCost +
      costBreakdown.domesticTransportCost +
      costBreakdown.internationalLogisticsCost;
    const platformFee = costBreakdown.platformFee;
    const paymentFee = costBreakdown.paymentFee;
    const adCost = costBreakdown.adCost;
    const storageCost = costBreakdown.storageCost;
    const otherCost =
      costBreakdown.otherCost +
      costBreakdown.taxCost +
      costBreakdown.refundLossReserve +
      costBreakdown.exchangeRateRiskReserve;

    const totalCost =
      productCost +
      packagingCost +
      shippingCost +
      platformFee +
      paymentFee +
      adCost +
      storageCost +
      otherCost;

    const estimatedProfit = costBreakdown.salePrice - totalCost;
    const profitMargin =
      Math.round((estimatedProfit / costBreakdown.salePrice) * 10000) / 100;
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
          currency: costBreakdown.currency,
          salePrice: costBreakdown.salePrice,
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
          scenarios: JSON.parse(
            JSON.stringify([
              {
                type: 'complete-cost-breakdown',
                evidenceVersion: 'profit-cost-evidence/v1',
                costBreakdown,
                persistenceMapping: {
                  shippingCost: [
                    'shippingCost',
                    'domesticTransportCost',
                    'internationalLogisticsCost',
                  ],
                  otherCost: [
                    'otherCost',
                    'taxCost',
                    'refundLossReserve',
                    'exchangeRateRiskReserve',
                  ],
                },
              },
            ]),
          ) as Prisma.InputJsonValue,
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
