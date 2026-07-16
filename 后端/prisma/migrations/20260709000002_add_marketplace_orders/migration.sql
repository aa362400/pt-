CREATE TABLE "marketplace_orders" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT,
    "provider" TEXT NOT NULL,
    "fulfillmentType" TEXT,
    "externalOrderId" TEXT,
    "externalPostingNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "orderedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "raw" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketplace_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketplace_orders_organizationId_provider_externalPostingNumber_key"
ON "marketplace_orders"("organizationId", "provider", "externalPostingNumber");

CREATE INDEX "marketplace_orders_organizationId_idx" ON "marketplace_orders"("organizationId");
CREATE INDEX "marketplace_orders_workspaceId_idx" ON "marketplace_orders"("workspaceId");
CREATE INDEX "marketplace_orders_channelId_idx" ON "marketplace_orders"("channelId");
CREATE INDEX "marketplace_orders_provider_idx" ON "marketplace_orders"("provider");
CREATE INDEX "marketplace_orders_status_idx" ON "marketplace_orders"("status");
CREATE INDEX "marketplace_orders_orderedAt_idx" ON "marketplace_orders"("orderedAt");

ALTER TABLE "marketplace_orders"
ADD CONSTRAINT "marketplace_orders_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketplace_orders"
ADD CONSTRAINT "marketplace_orders_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketplace_orders"
ADD CONSTRAINT "marketplace_orders_channelId_fkey"
FOREIGN KEY ("channelId") REFERENCES "channel_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
