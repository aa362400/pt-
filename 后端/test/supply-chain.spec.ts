import { SupplyChainService } from '../src/features/supply-chain/supply-chain.service.js';

describe('SupplyChainService', () => {
  const user = { sub: 'user-1', orgId: 'org-1', role: 'OWNER' } as any;

  function createService() {
    const sku = {
      id: 'supply-sku-1',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      supplierId: 'supplier-1',
      sku: 'SKU-001',
      productName: 'Test product',
      unitCost: 8,
      currency: 'USD',
      moq: 100,
      leadTimeDays: 14,
      safetyStock: 10,
      currentStock: 10,
      dailySalesAvg: 5,
      status: 'ACTIVE',
    };
    const plan = {
      id: 'plan-1',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      supplySkuId: sku.id,
      recommendedQty: 220,
      requestedQty: 220,
      reorderPoint: 80,
      projectedDaysLeft: 2,
      status: 'DRAFT',
      reviewTaskId: null,
      inputSnapshot: { currentStock: 10, dailySalesAvg: 5 },
    };
    const tx = {
      workspace: {
        findFirst: jest.fn().mockResolvedValue({ id: 'workspace-1' }),
      },
      reviewTask: {
        create: jest
          .fn()
          .mockResolvedValue({ id: 'review-1', status: 'PENDING' }),
        update: jest
          .fn()
          .mockResolvedValue({ id: 'review-1', status: 'APPROVED' }),
      },
      replenishmentPlan: {
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ ...plan, ...data }),
          ),
      },
    };
    const prisma = {
      workspace: {
        findFirst: jest.fn().mockResolvedValue({ id: 'workspace-1' }),
      },
      supplySku: { findMany: jest.fn().mockResolvedValue([sku]) },
      replenishmentPlan: {
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'plan-1', ...data }),
          ),
        findFirst: jest.fn().mockResolvedValue(plan),
        update: tx.replenishmentPlan.update,
      },
      reviewTask: tx.reviewTask,
      $transaction: jest
        .fn()
        .mockImplementation((input) =>
          typeof input === 'function' ? input(tx) : Promise.all(input),
        ),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const tenantDatabase = {
      run: jest.fn((_organizationId, operation) => operation(prisma)),
    };
    return {
      service: new SupplyChainService(
        prisma as any,
        audit as any,
        tenantDatabase as any,
      ),
      prisma,
      tx,
      plan,
    };
  }

  it('generates a reproducible local plan from inventory, demand, lead time and safety stock', async () => {
    const { service, prisma } = createService();
    const result = await service.generatePlans(user, {
      workspaceId: 'workspace-1',
      coverageDays: 30,
    });

    expect(result.generatedPlans).toBe(1);
    expect(prisma.replenishmentPlan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recommendedQty: 220,
        requestedQty: 220,
        reorderPoint: 80,
        projectedDaysLeft: 2,
        rationale: expect.objectContaining({
          evidenceSource: 'organization_supply_records',
        }),
      }),
    });
  });

  it('creates a human review task without creating an external purchase order', async () => {
    const { service, tx } = createService();
    const result = await service.requestApproval(user, 'plan-1', {
      requestedQty: 200,
    });

    expect(result.externalPurchaseOrderCreated).toBe(false);
    expect(tx.reviewTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: 'SUPPLY_PLAN',
        autoApproved: false,
        approvalScope: expect.objectContaining({
          externalPurchaseOrder: false,
          platformWrite: false,
        }),
      }),
    });
    expect(tx.replenishmentPlan.update).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
      data: expect.objectContaining({
        status: 'PENDING_APPROVAL',
        requestedQty: 200,
      }),
    });
  });

  it('approves only the local plan and records that no external purchase order was created', async () => {
    const { service, prisma, tx, plan } = createService();
    prisma.replenishmentPlan.findFirst.mockResolvedValue({
      ...plan,
      status: 'PENDING_APPROVAL',
      reviewTaskId: 'review-1',
    });

    const result = await service.decide(user, 'plan-1', {
      decision: 'APPROVE',
      reason: '库存证据已核对',
    });

    expect(result.externalPurchaseOrderCreated).toBe(false);
    expect(tx.reviewTask.update).toHaveBeenCalledWith({
      where: { id: 'review-1' },
      data: expect.objectContaining({
        status: 'APPROVED',
        assignedTo: 'user-1',
      }),
    });
    expect(tx.replenishmentPlan.update).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
      data: expect.objectContaining({
        status: 'APPROVED',
        approvedBy: 'user-1',
      }),
    });
  });
});
