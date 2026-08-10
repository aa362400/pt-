CREATE TYPE "ProductLaunchStatus" AS ENUM (
  'QUEUED',
  'GENERATING_IMAGES',
  'SUBMITTING_TO_OZON',
  'SUBMITTED_TO_OZON',
  'ACTIVE_ON_OZON',
  'BLOCKED',
  'FAILED'
);

CREATE TABLE "product_launches" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "reviewTaskId" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "candidateIndex" INTEGER NOT NULL,
  "productId" TEXT,
  "imageProjectId" TEXT,
  "agentRunId" TEXT,
  "channelId" TEXT,
  "status" "ProductLaunchStatus" NOT NULL DEFAULT 'QUEUED',
  "confirmAutoPublish" BOOLEAN NOT NULL DEFAULT false,
  "requestedBy" TEXT NOT NULL,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "execution" JSONB NOT NULL DEFAULT '{}',
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_launches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_launches_reviewTaskId_candidateId_key"
  ON "product_launches"("reviewTaskId", "candidateId");
CREATE INDEX "product_launches_organizationId_idx" ON "product_launches"("organizationId");
CREATE INDEX "product_launches_reviewTaskId_idx" ON "product_launches"("reviewTaskId");
CREATE INDEX "product_launches_productId_idx" ON "product_launches"("productId");
CREATE INDEX "product_launches_status_idx" ON "product_launches"("status");
CREATE INDEX "product_launches_createdAt_idx" ON "product_launches"("createdAt");

ALTER TABLE "product_launches"
  ADD CONSTRAINT "product_launches_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_launches"
  ADD CONSTRAINT "product_launches_reviewTaskId_fkey"
  FOREIGN KEY ("reviewTaskId") REFERENCES "review_tasks"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_launches"
  ADD CONSTRAINT "product_launches_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
