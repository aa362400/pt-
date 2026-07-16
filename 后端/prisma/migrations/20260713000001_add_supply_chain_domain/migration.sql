CREATE TYPE "SupplyRecordStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "ReplenishmentPlanStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

ALTER TYPE "ReviewEntityType" ADD VALUE IF NOT EXISTS 'SUPPLY_PLAN';

CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "contact" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "status" "SupplyRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supply_skus" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT,
    "supplierId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "moq" INTEGER NOT NULL DEFAULT 1,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 0,
    "safetyStock" INTEGER NOT NULL DEFAULT 0,
    "currentStock" INTEGER NOT NULL DEFAULT 0,
    "dailySalesAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "SupplyRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "supply_skus_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "replenishment_plans" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "supplySkuId" TEXT NOT NULL,
    "recommendedQty" INTEGER NOT NULL,
    "requestedQty" INTEGER NOT NULL,
    "reorderPoint" INTEGER NOT NULL,
    "projectedDaysLeft" DOUBLE PRECISION,
    "status" "ReplenishmentPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "inputSnapshot" JSONB NOT NULL DEFAULT '{}',
    "rationale" JSONB NOT NULL DEFAULT '{}',
    "reviewTaskId" TEXT,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "replenishment_plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "suppliers_organizationId_code_key" ON "suppliers"("organizationId", "code");
CREATE INDEX "suppliers_organizationId_idx" ON "suppliers"("organizationId");
CREATE INDEX "suppliers_workspaceId_idx" ON "suppliers"("workspaceId");
CREATE INDEX "suppliers_status_idx" ON "suppliers"("status");
CREATE UNIQUE INDEX "supply_skus_organizationId_workspaceId_supplierId_sku_key" ON "supply_skus"("organizationId", "workspaceId", "supplierId", "sku");
CREATE INDEX "supply_skus_organizationId_idx" ON "supply_skus"("organizationId");
CREATE INDEX "supply_skus_workspaceId_idx" ON "supply_skus"("workspaceId");
CREATE INDEX "supply_skus_productId_idx" ON "supply_skus"("productId");
CREATE INDEX "supply_skus_supplierId_idx" ON "supply_skus"("supplierId");
CREATE UNIQUE INDEX "replenishment_plans_reviewTaskId_key" ON "replenishment_plans"("reviewTaskId");
CREATE INDEX "replenishment_plans_organizationId_idx" ON "replenishment_plans"("organizationId");
CREATE INDEX "replenishment_plans_workspaceId_idx" ON "replenishment_plans"("workspaceId");
CREATE INDEX "replenishment_plans_supplySkuId_idx" ON "replenishment_plans"("supplySkuId");
CREATE INDEX "replenishment_plans_status_idx" ON "replenishment_plans"("status");

ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supply_skus" ADD CONSTRAINT "supply_skus_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supply_skus" ADD CONSTRAINT "supply_skus_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supply_skus" ADD CONSTRAINT "supply_skus_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supply_skus" ADD CONSTRAINT "supply_skus_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "replenishment_plans" ADD CONSTRAINT "replenishment_plans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "replenishment_plans" ADD CONSTRAINT "replenishment_plans_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "replenishment_plans" ADD CONSTRAINT "replenishment_plans_supplySkuId_fkey" FOREIGN KEY ("supplySkuId") REFERENCES "supply_skus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
