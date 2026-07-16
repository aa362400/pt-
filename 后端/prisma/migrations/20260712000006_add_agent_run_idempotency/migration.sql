ALTER TABLE "agent_runs"
  ADD COLUMN "clientRequestId" TEXT,
  ADD COLUMN "attempt" INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX "agent_runs_organizationId_clientRequestId_key"
  ON "agent_runs"("organizationId", "clientRequestId");

CREATE INDEX "agent_runs_organizationId_status_createdAt_idx"
  ON "agent_runs"("organizationId", "status", "createdAt");
