CREATE TABLE "enterprise_slo_daily_snapshots" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "totalTasks" INTEGER NOT NULL DEFAULT 0,
    "successfulTasks" INTEGER NOT NULL DEFAULT 0,
    "taskSuccessRate" DOUBLE PRECISION,
    "qualitySamples" INTEGER NOT NULL DEFAULT 0,
    "qualityPassed" INTEGER NOT NULL DEFAULT 0,
    "qualityPassRate" DOUBLE PRECISION,
    "autonomousCompletions" INTEGER NOT NULL DEFAULT 0,
    "autonomousCompletionRate" DOUBLE PRECISION,
    "totalSuggestions" INTEGER NOT NULL DEFAULT 0,
    "acceptedSuggestions" INTEGER NOT NULL DEFAULT 0,
    "suggestionAdoptionRate" DOUBLE PRECISION,
    "unauthorizedActionCount" INTEGER NOT NULL DEFAULT 0,
    "p95LatencyMs" INTEGER,
    "queueBacklog" INTEGER NOT NULL DEFAULT 0,
    "queueEvidenceAvailable" BOOLEAN NOT NULL DEFAULT false,
    "unresolvedDeadLetters" INTEGER NOT NULL DEFAULT 0,
    "totalCostAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "costSampleCount" INTEGER NOT NULL DEFAULT 0,
    "averageCostPerTask" DECIMAL(65,30),
    "errorBudgetConsumed" DOUBLE PRECISION,
    "dataComplete" BOOLEAN NOT NULL DEFAULT false,
    "missingEvidence" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_slo_daily_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "enterprise_slo_daily_snapshots_organizationId_date_key"
ON "enterprise_slo_daily_snapshots"("organizationId", "date");
CREATE INDEX "enterprise_slo_daily_snapshots_organizationId_idx"
ON "enterprise_slo_daily_snapshots"("organizationId");
CREATE INDEX "enterprise_slo_daily_snapshots_date_idx"
ON "enterprise_slo_daily_snapshots"("date");
CREATE INDEX "enterprise_slo_daily_snapshots_passed_idx"
ON "enterprise_slo_daily_snapshots"("passed");

ALTER TABLE "enterprise_slo_daily_snapshots"
ADD CONSTRAINT "enterprise_slo_daily_snapshots_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
