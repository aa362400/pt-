CREATE TYPE "DeadLetterClassification" AS ENUM (
  'UNCLASSIFIED',
  'RETRYABLE',
  'PERMANENT',
  'DATA_MISSING',
  'PROVIDER_FAILURE'
);

CREATE TYPE "DeadLetterResolutionStatus" AS ENUM (
  'OPEN',
  'REPLAYED',
  'RESOLVED'
);

ALTER TABLE "dead_letter_jobs"
  ADD COLUMN "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "classification" "DeadLetterClassification" NOT NULL DEFAULT 'UNCLASSIFIED',
  ADD COLUMN "classificationReason" TEXT,
  ADD COLUMN "replayEligible" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "classifiedAt" TIMESTAMP(3),
  ADD COLUMN "classifiedBy" TEXT,
  ADD COLUMN "resolutionStatus" "DeadLetterResolutionStatus" NOT NULL DEFAULT 'OPEN',
  ADD COLUMN "replayRunId" TEXT,
  ADD COLUMN "resolvedAt" TIMESTAMP(3),
  ADD COLUMN "resolvedBy" TEXT;

UPDATE "dead_letter_jobs"
SET "resolutionStatus" = 'RESOLVED',
    "resolvedAt" = "inspectedAt"
WHERE "inspectedAt" IS NOT NULL;

CREATE INDEX "dead_letter_jobs_organizationId_resolutionStatus_classification_idx"
  ON "dead_letter_jobs"("organizationId", "resolutionStatus", "classification");
