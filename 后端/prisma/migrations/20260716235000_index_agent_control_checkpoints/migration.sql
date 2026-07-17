-- Validate the legacy TEXT automation status contract and add the two lookup
-- indexes only after the new ProductResearchRunStatus values have committed.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE "automation_runs"
  ADD CONSTRAINT "automation_runs_status_check"
  CHECK (
    "status" IN (
      'PENDING',
      'RUNNING',
      'PAUSED',
      'PARTIAL',
      'COMPLETED',
      'FAILED',
      'STOPPED'
    )
  ) NOT VALID;

ALTER TABLE "automation_runs"
  VALIDATE CONSTRAINT "automation_runs_status_check";

CREATE INDEX "product_research_runs_org_status_updated_idx"
  ON "product_research_runs"("organizationId", "status", "updatedAt");

CREATE INDEX "automation_runs_flow_status_started_idx"
  ON "automation_runs"("flowId", "status", "startedAt");

COMMIT;
