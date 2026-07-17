-- Add a durable, monotonic execution fence for Daily ProductResearchRun
-- workers. A lease owner may mutate stages or terminal state only while the
-- exact owner + epoch pair remains current.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE "product_research_runs"
  ADD COLUMN "leaseOwner" TEXT,
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "executionEpoch" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "product_research_runs_execution_epoch_nonnegative_check"
    CHECK ("executionEpoch" >= 0) NOT VALID;

ALTER TABLE "product_research_runs"
  VALIDATE CONSTRAINT "product_research_runs_execution_epoch_nonnegative_check";

CREATE INDEX "product_research_runs_org_status_lease_expiry_idx"
  ON "product_research_runs"("organizationId", "status", "leaseExpiresAt");

COMMIT;
