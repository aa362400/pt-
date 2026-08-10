ALTER TYPE "ExternalSubmissionStatus" ADD VALUE IF NOT EXISTS 'CLAIMED';
ALTER TYPE "ExternalSubmissionStatus" ADD VALUE IF NOT EXISTS 'RETRYABLE_FAILED';
ALTER TYPE "ExternalSubmissionStatus" ADD VALUE IF NOT EXISTS 'RECONCILING';

ALTER TABLE "external_submissions"
  ADD COLUMN "payloadHash" TEXT,
  ADD COLUMN "claimToken" TEXT,
  ADD COLUMN "claimedAt" TIMESTAMP(3),
  ADD COLUMN "responseReceivedAt" TIMESTAMP(3),
  ADD COLUMN "reconciliationResult" JSONB NOT NULL DEFAULT '{}';

CREATE INDEX "external_submissions_status_claimedAt_idx"
  ON "external_submissions"("status", "claimedAt");

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
    OR (
      OLD."payloadHash" IS NOT NULL
      AND NEW."payloadHash" IS DISTINCT FROM OLD."payloadHash"
    )
    OR NEW."request" IS DISTINCT FROM OLD."request"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'External submission identity is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
