CREATE TYPE "ExternalSubmissionStatus" AS ENUM (
  'PREPARED',
  'REQUEST_SENT',
  'ACKNOWLEDGED',
  'SUCCEEDED',
  'REJECTED',
  'UNKNOWN'
);

CREATE TABLE "external_submissions" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "productLaunchId" TEXT NOT NULL,
  "publishSnapshotId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'OZON',
  "operation" TEXT NOT NULL DEFAULT 'PRODUCT_PUBLISH',
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "status" "ExternalSubmissionStatus" NOT NULL DEFAULT 'PREPARED',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "request" JSONB NOT NULL DEFAULT '{}',
  "result" JSONB NOT NULL DEFAULT '{}',
  "externalTaskId" TEXT,
  "externalProductId" TEXT,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "requestSentAt" TIMESTAMP(3),
  "acknowledgedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "external_submissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "external_submissions_publishSnapshotId_key"
  ON "external_submissions"("publishSnapshotId");
CREATE UNIQUE INDEX "external_submissions_organizationId_provider_idempotencyKey_key"
  ON "external_submissions"("organizationId", "provider", "idempotencyKey");
CREATE INDEX "external_submissions_organizationId_idx"
  ON "external_submissions"("organizationId");
CREATE INDEX "external_submissions_productLaunchId_idx"
  ON "external_submissions"("productLaunchId");
CREATE INDEX "external_submissions_status_idx"
  ON "external_submissions"("status");
CREATE INDEX "external_submissions_createdAt_idx"
  ON "external_submissions"("createdAt");

ALTER TABLE "external_submissions"
  ADD CONSTRAINT "external_submissions_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_submissions"
  ADD CONSTRAINT "external_submissions_productLaunchId_fkey"
  FOREIGN KEY ("productLaunchId") REFERENCES "product_launches"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_submissions"
  ADD CONSTRAINT "external_submissions_publishSnapshotId_fkey"
  FOREIGN KEY ("publishSnapshotId") REFERENCES "listing_publish_snapshots"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "external_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "external_submissions" FORCE ROW LEVEL SECURITY;

CREATE POLICY "external_submissions_organization_isolation"
  ON "external_submissions"
  FOR ALL
  USING (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  )
  WITH CHECK (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  );

CREATE OR REPLACE FUNCTION prevent_external_submission_identity_mutation()
RETURNS trigger AS $$
BEGIN
  IF NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
    OR NEW."productLaunchId" IS DISTINCT FROM OLD."productLaunchId"
    OR NEW."publishSnapshotId" IS DISTINCT FROM OLD."publishSnapshotId"
    OR NEW."provider" IS DISTINCT FROM OLD."provider"
    OR NEW."operation" IS DISTINCT FROM OLD."operation"
    OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
    OR NEW."requestHash" IS DISTINCT FROM OLD."requestHash"
    OR NEW."request" IS DISTINCT FROM OLD."request"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'External submission identity is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "external_submissions_immutable_identity"
BEFORE UPDATE ON "external_submissions"
FOR EACH ROW EXECUTE FUNCTION prevent_external_submission_identity_mutation();
