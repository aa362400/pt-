ALTER TABLE "automation_runs"
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "triggerSource" TEXT NOT NULL DEFAULT 'legacy',
ADD COLUMN "triggerReason" TEXT,
ADD COLUMN "requestedBy" TEXT,
ADD COLUMN "parentRunId" TEXT,
ADD COLUMN "jobSnapshot" JSONB;

UPDATE "automation_runs"
SET "idempotencyKey" = 'legacy:' || "id"
WHERE "idempotencyKey" IS NULL;

ALTER TABLE "automation_runs"
ALTER COLUMN "idempotencyKey" SET NOT NULL;

ALTER TABLE "dead_letter_jobs"
ADD COLUMN "replayReason" TEXT,
ADD COLUMN "replayIdempotencyKey" TEXT;

CREATE UNIQUE INDEX "automation_runs_flowId_idempotencyKey_key"
ON "automation_runs"("flowId", "idempotencyKey");

CREATE INDEX "automation_runs_parentRunId_idx"
ON "automation_runs"("parentRunId");

CREATE INDEX "automation_runs_triggerSource_idx"
ON "automation_runs"("triggerSource");

