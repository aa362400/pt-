import { api } from './client';

export interface Supplier {
  id: string;
  workspaceId: string | null;
  name: string;
  code: string | null;
  currency: string;
  status: 'ACTIVE' | 'INACTIVE';
  updatedAt: string;
}

export interface SupplySku {
  id: string;
  workspaceId: string;
  supplierId: string;
  sku: string;
  productName: string;
  unitCost: string | number;
  currency: string;
  moq: number;
  leadTimeDays: number;
  safetyStock: number;
  currentStock: number;
  dailySalesAvg: number;
  supplier: { id: string; name: string };
}

export interface SupplyForecast {
  supplySkuId: string;
  reorderPoint: number;
  projectedDaysLeft: number | null;
  targetStock: number;
  recommendedQty: number;
  risk: 'OUT_OF_STOCK' | 'REORDER' | 'WATCH' | 'HEALTHY';
}

export interface ReplenishmentPlan {
  id: string;
  supplySkuId: string;
  recommendedQty: number;
  requestedQty: number;
  reorderPoint: number;
  projectedDaysLeft: number | null;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  reviewTaskId: string | null;
  createdAt: string;
  supplySku: { sku: string; productName: string; currency: string; unitCost: string | number };
}

export interface SupplyChainOverview {
  generatedAt: string;
  source: 'organization_supply_records';
  summary: { suppliers: number; skus: number; reorderRequired: number; pendingApproval: number };
  suppliers: Supplier[];
  skus: SupplySku[];
  forecasts: SupplyForecast[];
  plans: ReplenishmentPlan[];
}

export const supplyChainApi = {
  overview: (workspaceId?: string) =>
    api.get<SupplyChainOverview>('/supply-chain', { params: { workspaceId } }),
  createSupplier: (input: { workspaceId?: string; name: string; code?: string; currency?: string }) =>
    api.post<Supplier>('/supply-chain/suppliers', input),
  createSku: (input: {
    workspaceId: string; supplierId: string; sku: string; productName: string;
    unitCost: number; currency?: string; moq: number; leadTimeDays: number;
    safetyStock: number; currentStock: number; dailySalesAvg: number;
  }) => api.post<SupplySku>('/supply-chain/skus', input),
  generatePlans: (workspaceId: string, coverageDays = 30) =>
    api.post<{ evaluatedSkus: number; generatedPlans: number; plans: ReplenishmentPlan[] }>(
      '/supply-chain/plans/generate', { workspaceId, coverageDays },
    ),
  requestApproval: (id: string, requestedQty?: number) =>
    api.post<{ planId: string; reviewTask: { id: string }; externalPurchaseOrderCreated: false }>(
      `/supply-chain/plans/${id}/request-approval`, { requestedQty },
    ),
};
