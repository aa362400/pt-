import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import { PrismaService } from '../../shared/database/prisma.service.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import {
  assertWorkspaceInOrg,
  requireOrg,
} from '../../shared/tenancy/org-scope.js';
import {
  CreateSupplierDto,
  CreateSupplySkuDto,
  DecideSupplyPlanDto,
  GenerateReplenishmentPlansDto,
  RequestPlanApprovalDto,
  SupplyChainQueryDto,
} from './supply-chain.dto.js';

@Injectable()
export class SupplyChainService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenantDatabase: TenantDatabaseContextService,
  ) {}

  async overview(user: JwtPayload, query: SupplyChainQueryDto) {
    const organizationId = requireOrg(user);
    if (query.workspaceId) {
      await assertWorkspaceInOrg(
        this.prisma,
        organizationId,
        query.workspaceId,
      );
    }
    const workspaceFilter = query.workspaceId
      ? { workspaceId: query.workspaceId }
      : {};
    const [suppliers, skus, plans] = await this.tenantDatabase.run(
      organizationId,
      (transaction) =>
        Promise.all([
          transaction.supplier.findMany({
            where: { organizationId, ...workspaceFilter },
            orderBy: { updatedAt: 'desc' },
          }),
          transaction.supplySku.findMany({
            where: { organizationId, ...workspaceFilter },
            include: {
              supplier: { select: { id: true, name: true } },
              product: { select: { id: true, title: true } },
            },
            orderBy: { updatedAt: 'desc' },
          }),
          transaction.replenishmentPlan.findMany({
            where: { organizationId, ...workspaceFilter },
            include: {
              supplySku: {
                select: {
                  sku: true,
                  productName: true,
                  currency: true,
                  unitCost: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
          }),
        ]),
    );
    const forecasts = skus.map((sku) => ({
      supplySkuId: sku.id,
      ...this.calculateForecast(sku, 30),
    }));
    return {
      generatedAt: new Date().toISOString(),
      source: 'organization_supply_records',
      summary: {
        suppliers: suppliers.length,
        skus: skus.length,
        reorderRequired: forecasts.filter((item) => item.recommendedQty > 0)
          .length,
        pendingApproval: plans.filter(
          (item) => item.status === 'PENDING_APPROVAL',
        ).length,
      },
      suppliers,
      skus,
      forecasts,
      plans,
    };
  }

  async createSupplier(user: JwtPayload, dto: CreateSupplierDto) {
    const organizationId = requireOrg(user);
    if (dto.workspaceId) {
      await assertWorkspaceInOrg(this.prisma, organizationId, dto.workspaceId);
    }
    const supplier = await this.tenantDatabase.run(
      organizationId,
      (transaction) =>
        transaction.supplier.create({
          data: {
            organizationId,
            workspaceId: dto.workspaceId,
            name: dto.name.trim(),
            code: dto.code?.trim() || null,
            currency: (dto.currency ?? 'USD').toUpperCase(),
            contact: (dto.contact ?? {}) as Prisma.InputJsonValue,
            notes: dto.notes?.trim() || null,
          },
        }),
    );
    await this.audit.log({
      organizationId,
      actorId: user.sub,
      action: 'supply.supplier.create',
      resourceType: 'Supplier',
      resourceId: supplier.id,
      after: { name: supplier.name, workspaceId: supplier.workspaceId },
    });
    return supplier;
  }

  async createSku(user: JwtPayload, dto: CreateSupplySkuDto) {
    const organizationId = requireOrg(user);
    await assertWorkspaceInOrg(this.prisma, organizationId, dto.workspaceId);
    const supplier = await this.tenantDatabase.run(
      organizationId,
      (transaction) =>
        transaction.supplier.findFirst({
          where: { id: dto.supplierId, organizationId },
        }),
    );
    if (!supplier)
      throw new BadRequestException(
        'Supplier is not available in this organization',
      );
    if (supplier.workspaceId && supplier.workspaceId !== dto.workspaceId) {
      throw new BadRequestException(
        'Supplier belongs to a different workspace',
      );
    }
    if (dto.productId) {
      const product = await this.tenantDatabase.run(organizationId, (tx) =>
        tx.product.findFirst({
          where: {
            id: dto.productId,
            workspaceId: dto.workspaceId,
            workspace: { organizationId },
          },
        }),
      );
      if (!product)
        throw new BadRequestException(
          'Product is not available in this workspace',
        );
    }
    const record = await this.tenantDatabase.run(
      organizationId,
      (transaction) =>
        transaction.supplySku.create({
          data: {
            organizationId,
            workspaceId: dto.workspaceId,
            supplierId: dto.supplierId,
            productId: dto.productId,
            sku: dto.sku.trim(),
            productName: dto.productName.trim(),
            unitCost: dto.unitCost,
            currency: (dto.currency ?? supplier.currency).toUpperCase(),
            moq: dto.moq,
            leadTimeDays: dto.leadTimeDays,
            safetyStock: dto.safetyStock,
            currentStock: dto.currentStock,
            dailySalesAvg: dto.dailySalesAvg,
          },
        }),
    );
    await this.audit.log({
      organizationId,
      actorId: user.sub,
      action: 'supply.sku.create',
      resourceType: 'SupplySku',
      resourceId: record.id,
      after: { sku: record.sku, workspaceId: record.workspaceId },
    });
    return record;
  }

  async generatePlans(user: JwtPayload, dto: GenerateReplenishmentPlansDto) {
    const organizationId = requireOrg(user);
    await assertWorkspaceInOrg(this.prisma, organizationId, dto.workspaceId);
    const coverageDays = dto.coverageDays ?? 30;
    const skus = await this.tenantDatabase.run(organizationId, (transaction) =>
      transaction.supplySku.findMany({
        where: {
          organizationId,
          workspaceId: dto.workspaceId,
          status: 'ACTIVE',
        },
      }),
    );
    const candidates = skus
      .map((sku) => ({
        sku,
        forecast: this.calculateForecast(sku, coverageDays),
      }))
      .filter((item) => item.forecast.recommendedQty > 0);
    const plans = [];
    for (const item of candidates) {
      const plan = await this.tenantDatabase.run(
        organizationId,
        (transaction) =>
          transaction.replenishmentPlan.create({
            data: {
              organizationId,
              workspaceId: item.sku.workspaceId,
              supplySkuId: item.sku.id,
              recommendedQty: item.forecast.recommendedQty,
              requestedQty: item.forecast.recommendedQty,
              reorderPoint: item.forecast.reorderPoint,
              projectedDaysLeft: item.forecast.projectedDaysLeft,
              inputSnapshot: {
                currentStock: item.sku.currentStock,
                dailySalesAvg: item.sku.dailySalesAvg,
                leadTimeDays: item.sku.leadTimeDays,
                safetyStock: item.sku.safetyStock,
                moq: item.sku.moq,
                coverageDays,
              },
              rationale: {
                formula:
                  'max(moq, dailySalesAvg * (leadTimeDays + coverageDays) + safetyStock - currentStock)',
                risk: item.forecast.risk,
                evidenceSource: 'organization_supply_records',
              },
              createdBy: user.sub,
            },
          }),
      );
      plans.push(plan);
    }
    await this.audit.log({
      organizationId,
      actorId: user.sub,
      action: 'supply.replenishment.generate',
      resourceType: 'Workspace',
      resourceId: dto.workspaceId,
      after: {
        coverageDays,
        generatedPlans: plans.length,
        evaluatedSkus: skus.length,
      },
    });
    return { evaluatedSkus: skus.length, generatedPlans: plans.length, plans };
  }

  async requestApproval(
    user: JwtPayload,
    planId: string,
    dto: RequestPlanApprovalDto,
  ) {
    const organizationId = requireOrg(user);
    const plan = await this.findPlan(organizationId, planId);
    if (!['DRAFT', 'REJECTED'].includes(plan.status)) {
      throw new BadRequestException(
        'Only draft or rejected plans can enter approval',
      );
    }
    const requestedQty = dto.requestedQty ?? plan.recommendedQty;
    const reviewTask = await this.tenantDatabase.run(
      organizationId,
      async (tx) => {
        const review = await tx.reviewTask.create({
          data: {
            organizationId,
            entityType: 'SUPPLY_PLAN',
            entityId: plan.id,
            threshold: 100,
            autoApproved: false,
            approvalScope: {
              action: 'local_replenishment_plan_approval',
              externalPurchaseOrder: false,
              platformWrite: false,
            },
            decisionEvidence: {
              requestedQty,
              recommendedQty: plan.recommendedQty,
              reorderPoint: plan.reorderPoint,
              projectedDaysLeft: plan.projectedDaysLeft,
              inputSnapshot: plan.inputSnapshot,
              reason: dto.reason ?? null,
            },
          },
        });
        await tx.replenishmentPlan.update({
          where: { id: plan.id },
          data: {
            requestedQty,
            status: 'PENDING_APPROVAL',
            reviewTaskId: review.id,
          },
        });
        return review;
      },
    );
    await this.audit.log({
      organizationId,
      actorId: user.sub,
      action: 'supply.replenishment.request_approval',
      resourceType: 'ReplenishmentPlan',
      resourceId: plan.id,
      after: {
        reviewTaskId: reviewTask.id,
        requestedQty,
        externalPurchaseOrder: false,
      },
    });
    return { planId: plan.id, reviewTask, externalPurchaseOrderCreated: false };
  }

  async decide(user: JwtPayload, planId: string, dto: DecideSupplyPlanDto) {
    const organizationId = requireOrg(user);
    const plan = await this.findPlan(organizationId, planId);
    if (plan.status !== 'PENDING_APPROVAL' || !plan.reviewTaskId) {
      throw new BadRequestException('Plan is not pending human approval');
    }
    const approved = dto.decision === 'APPROVE';
    const now = new Date();
    const updated = await this.tenantDatabase.run(
      organizationId,
      async (tx) => {
        await tx.reviewTask.update({
          where: { id: plan.reviewTaskId! },
          data: {
            status: approved ? 'APPROVED' : 'REJECTED',
            assignedTo: user.sub,
            notes: dto.reason?.trim() || null,
            reviewedAt: now,
          },
        });
        return tx.replenishmentPlan.update({
          where: { id: plan.id },
          data: {
            status: approved ? 'APPROVED' : 'REJECTED',
            approvedBy: approved ? user.sub : null,
            approvedAt: approved ? now : null,
          },
        });
      },
    );
    await this.audit.log({
      organizationId,
      actorId: user.sub,
      action: approved
        ? 'supply.replenishment.approve'
        : 'supply.replenishment.reject',
      resourceType: 'ReplenishmentPlan',
      resourceId: plan.id,
      before: { status: plan.status },
      after: {
        status: updated.status,
        reason: dto.reason ?? null,
        externalPurchaseOrderCreated: false,
      },
    });
    return { ...updated, externalPurchaseOrderCreated: false };
  }

  private async findPlan(organizationId: string, id: string) {
    const plan = await this.tenantDatabase.run(organizationId, (transaction) =>
      transaction.replenishmentPlan.findFirst({
        where: { id, organizationId },
      }),
    );
    if (!plan) throw new NotFoundException('Replenishment plan not found');
    return plan;
  }

  private calculateForecast(
    sku: {
      currentStock: number;
      dailySalesAvg: number;
      leadTimeDays: number;
      safetyStock: number;
      moq: number;
    },
    coverageDays: number,
  ) {
    const reorderPoint = Math.ceil(
      sku.dailySalesAvg * sku.leadTimeDays + sku.safetyStock,
    );
    const projectedDaysLeft =
      sku.dailySalesAvg > 0
        ? Number((sku.currentStock / sku.dailySalesAvg).toFixed(1))
        : null;
    const targetStock = Math.ceil(
      sku.dailySalesAvg * (sku.leadTimeDays + coverageDays) + sku.safetyStock,
    );
    const shortage = Math.max(0, targetStock - sku.currentStock);
    const recommendedQty =
      sku.currentStock <= reorderPoint && shortage > 0
        ? Math.max(sku.moq, shortage)
        : 0;
    const risk =
      sku.currentStock === 0
        ? 'OUT_OF_STOCK'
        : recommendedQty > 0
          ? 'REORDER'
          : projectedDaysLeft !== null &&
              projectedDaysLeft <= sku.leadTimeDays + 14
            ? 'WATCH'
            : 'HEALTHY';
    return {
      reorderPoint,
      projectedDaysLeft,
      targetStock,
      recommendedQty,
      risk,
    };
  }
}
