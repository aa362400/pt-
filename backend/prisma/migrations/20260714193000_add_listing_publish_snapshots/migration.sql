CREATE TYPE "ListingPublishSnapshotStatus" AS ENUM (
  'APPROVED',
  'SUBMITTING',
  'SUBMITTED',
  'ACTIVE',
  'BLOCKED',
  'FAILED'
);

ALTER TABLE "listing_drafts"
  ADD COLUMN "approvalHash" TEXT;

ALTER TABLE "product_launches"
  ADD COLUMN "selectedPublishSnapshotId" TEXT,
  ADD COLUMN "approvedPublishSnapshotHash" TEXT;

CREATE TABLE "listing_publish_snapshots" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "productLaunchId" TEXT NOT NULL,
  "listingDraftId" TEXT NOT NULL,
  "reviewTaskId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "target" TEXT NOT NULL DEFAULT 'OZON',
  "schemaVersion" TEXT NOT NULL DEFAULT 'listing-publish-snapshot/v1',
  "listingApprovalHash" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "snapshotHash" TEXT NOT NULL,
  "status" "ListingPublishSnapshotStatus" NOT NULL DEFAULT 'APPROVED',
  "approvedBy" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL,
  "result" JSONB NOT NULL DEFAULT '{}',
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "submittedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "listing_publish_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_launches_selectedPublishSnapshotId_key"
  ON "product_launches"("selectedPublishSnapshotId");
CREATE UNIQUE INDEX "listing_publish_snapshots_productLaunchId_snapshotHash_key"
  ON "listing_publish_snapshots"("productLaunchId", "snapshotHash");
CREATE INDEX "listing_publish_snapshots_organizationId_idx"
  ON "listing_publish_snapshots"("organizationId");
CREATE INDEX "listing_publish_snapshots_productLaunchId_idx"
  ON "listing_publish_snapshots"("productLaunchId");
CREATE INDEX "listing_publish_snapshots_listingDraftId_idx"
  ON "listing_publish_snapshots"("listingDraftId");
CREATE INDEX "listing_publish_snapshots_reviewTaskId_idx"
  ON "listing_publish_snapshots"("reviewTaskId");
CREATE INDEX "listing_publish_snapshots_productId_idx"
  ON "listing_publish_snapshots"("productId");
CREATE INDEX "listing_publish_snapshots_channelId_idx"
  ON "listing_publish_snapshots"("channelId");
CREATE INDEX "listing_publish_snapshots_status_idx"
  ON "listing_publish_snapshots"("status");
CREATE INDEX "listing_publish_snapshots_createdAt_idx"
  ON "listing_publish_snapshots"("createdAt");

ALTER TABLE "listing_publish_snapshots"
  ADD CONSTRAINT "listing_publish_snapshots_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "listing_publish_snapshots"
  ADD CONSTRAINT "listing_publish_snapshots_productLaunchId_fkey"
  FOREIGN KEY ("productLaunchId") REFERENCES "product_launches"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_launches"
  ADD CONSTRAINT "product_launches_selectedPublishSnapshotId_fkey"
  FOREIGN KEY ("selectedPublishSnapshotId") REFERENCES "listing_publish_snapshots"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "listing_publish_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "listing_publish_snapshots" FORCE ROW LEVEL SECURITY;

CREATE POLICY "listing_publish_snapshots_organization_isolation"
  ON "listing_publish_snapshots"
  FOR ALL
  USING (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  )
  WITH CHECK (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  );

CREATE OR REPLACE FUNCTION prevent_listing_publish_snapshot_payload_mutation()
RETURNS trigger AS $$
BEGIN
  IF NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
    OR NEW."productLaunchId" IS DISTINCT FROM OLD."productLaunchId"
    OR NEW."listingDraftId" IS DISTINCT FROM OLD."listingDraftId"
    OR NEW."reviewTaskId" IS DISTINCT FROM OLD."reviewTaskId"
    OR NEW."productId" IS DISTINCT FROM OLD."productId"
    OR NEW."channelId" IS DISTINCT FROM OLD."channelId"
    OR NEW."target" IS DISTINCT FROM OLD."target"
    OR NEW."schemaVersion" IS DISTINCT FROM OLD."schemaVersion"
    OR NEW."listingApprovalHash" IS DISTINCT FROM OLD."listingApprovalHash"
    OR NEW."snapshot" IS DISTINCT FROM OLD."snapshot"
    OR NEW."snapshotHash" IS DISTINCT FROM OLD."snapshotHash"
    OR NEW."approvedBy" IS DISTINCT FROM OLD."approvedBy"
    OR NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'Listing publish snapshot payload is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "listing_publish_snapshots_immutable_payload"
BEFORE UPDATE ON "listing_publish_snapshots"
FOR EACH ROW EXECUTE FUNCTION prevent_listing_publish_snapshot_payload_mutation();
