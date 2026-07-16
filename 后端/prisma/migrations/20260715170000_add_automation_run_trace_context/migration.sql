ALTER TABLE "automation_runs"
ADD COLUMN "traceId" TEXT;

CREATE INDEX "automation_runs_traceId_idx"
ON "automation_runs"("traceId");
