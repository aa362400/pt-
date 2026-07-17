-- Remove only the additive validation and lookup indexes. The durable control
-- primitives from the preceding forward-only migration remain in place.
DROP INDEX IF EXISTS "automation_runs_flow_status_started_idx";
DROP INDEX IF EXISTS "product_research_runs_org_status_updated_idx";

ALTER TABLE "automation_runs"
  DROP CONSTRAINT IF EXISTS "automation_runs_status_check";
