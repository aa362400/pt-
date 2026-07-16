ALTER TYPE "ProductLaunchStatus"
ADD VALUE IF NOT EXISTS 'AWAITING_PUBLISH_APPROVAL';

ALTER TABLE "product_launches"
ADD COLUMN "imageGenerationApproved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "listingDraftId" TEXT,
ADD COLUMN "publishReviewTaskId" TEXT,
ADD COLUMN "approvedContentHash" TEXT,
ADD COLUMN "publishApprovedBy" TEXT,
ADD COLUMN "publishApprovedAt" TIMESTAMP(3);

ALTER TABLE "listing_drafts"
ADD COLUMN "productLaunchId" TEXT;

CREATE UNIQUE INDEX "listing_drafts_productLaunchId_key"
ON "listing_drafts"("productLaunchId");

UPDATE "product_launches"
SET
  "imageGenerationApproved" = "confirmAutoPublish",
  "confirmAutoPublish" = false,
  "execution" = COALESCE("execution", '{}'::jsonb) || jsonb_build_object(
    'migrationGuard',
    'Legacy combined confirmation revoked; separate publish approval required.'
  )
WHERE "confirmAutoPublish" = true
  AND "status" IN ('QUEUED', 'GENERATING_IMAGES', 'BLOCKED', 'FAILED');
