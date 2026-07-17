-- Controlled rollback only: stop the fence-aware runtime and restore the
-- preceding backend image before removing these additive columns.
DROP INDEX IF EXISTS "product_research_runs_org_status_lease_expiry_idx";

ALTER TABLE "product_research_runs"
  DROP CONSTRAINT IF EXISTS "product_research_runs_execution_epoch_nonnegative_check",
  DROP COLUMN IF EXISTS "leaseOwner",
  DROP COLUMN IF EXISTS "leaseExpiresAt",
  DROP COLUMN IF EXISTS "executionEpoch";
