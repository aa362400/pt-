ALTER TYPE "DeadLetterResolutionStatus" ADD VALUE IF NOT EXISTS 'REPLAYING' BEFORE 'REPLAYED';

ALTER TABLE "dead_letter_jobs"
  ADD COLUMN "replayClaimedAt" TIMESTAMP(3),
  ADD COLUMN "replayClaimedBy" TEXT;

CREATE INDEX "dead_letter_jobs_organizationId_resolutionStatus_replayClaimedAt_idx"
  ON "dead_letter_jobs"("organizationId", "resolutionStatus", "replayClaimedAt");
