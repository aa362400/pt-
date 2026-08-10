ALTER TABLE "automation_runs"
  ADD COLUMN "leaseOwner" TEXT,
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "attempt" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "automation_step_executions" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "automationRunId" TEXT NOT NULL,
  "stepKey" TEXT NOT NULL,
  "stepIndex" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "leaseOwner" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "result" JSONB,
  "error" JSONB,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "automation_step_executions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "automation_step_executions_automationRunId_stepKey_key"
  ON "automation_step_executions"("automationRunId", "stepKey");
CREATE INDEX "automation_step_executions_organizationId_status_idx"
  ON "automation_step_executions"("organizationId", "status");
CREATE INDEX "automation_step_executions_automationRunId_stepIndex_idx"
  ON "automation_step_executions"("automationRunId", "stepIndex");

ALTER TABLE "automation_step_executions"
  ADD CONSTRAINT "automation_step_executions_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation_step_executions"
  ADD CONSTRAINT "automation_step_executions_automationRunId_fkey"
  FOREIGN KEY ("automationRunId") REFERENCES "automation_runs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "automation_step_executions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "automation_step_executions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "automation_step_executions_organization_isolation"
  ON "automation_step_executions" FOR ALL
  USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));
