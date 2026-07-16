ALTER TABLE "product_launches"
  ADD COLUMN "publishExecutionGrantHash" TEXT,
  ADD COLUMN "publishExecutionGrantScope" TEXT,
  ADD COLUMN "publishExecutionGrantSnapshotHash" TEXT,
  ADD COLUMN "publishExecutionGrantExpiresAt" TIMESTAMP(3),
  ADD COLUMN "publishExecutionGrantConsumedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "product_launches_publishExecutionGrantHash_key"
  ON "product_launches"("publishExecutionGrantHash");

CREATE INDEX "product_launches_publishExecutionGrantExpiresAt_idx"
  ON "product_launches"("publishExecutionGrantExpiresAt");

ALTER TABLE "listing_publish_snapshots"
  ALTER COLUMN "schemaVersion" SET DEFAULT 'listing-publish-snapshot/v2';
