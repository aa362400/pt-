DROP INDEX IF EXISTS "automation_runs_triggerSource_idx";
DROP INDEX IF EXISTS "automation_runs_parentRunId_idx";
DROP INDEX IF EXISTS "automation_runs_flowId_idempotencyKey_key";

ALTER TABLE "dead_letter_jobs"
DROP COLUMN IF EXISTS "replayIdempotencyKey",
DROP COLUMN IF EXISTS "replayReason";

ALTER TABLE "automation_runs"
DROP COLUMN IF EXISTS "jobSnapshot",
DROP COLUMN IF EXISTS "parentRunId",
DROP COLUMN IF EXISTS "requestedBy",
DROP COLUMN IF EXISTS "triggerReason",
DROP COLUMN IF EXISTS "triggerSource",
DROP COLUMN IF EXISTS "idempotencyKey";

