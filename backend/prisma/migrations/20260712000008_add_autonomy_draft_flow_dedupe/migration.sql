ALTER TABLE "automation_flows" ADD COLUMN "dedupeKey" TEXT;

CREATE UNIQUE INDEX "automation_flows_organizationId_dedupeKey_key"
  ON "automation_flows"("organizationId", "dedupeKey");

CREATE INDEX "automation_flows_organizationId_status_nextRunAt_idx"
  ON "automation_flows"("organizationId", "status", "nextRunAt");
