-- CreateEnum
CREATE TYPE "ProductResearchRunTrigger" AS ENUM ('SCHEDULE', 'MANUAL', 'RETRY', 'BACKFILL');

-- CreateEnum
CREATE TYPE "ProductResearchRunStatus" AS ENUM ('PENDING', 'RUNNING', 'PARTIAL', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProductResearchStage" AS ENUM ('COLLECT', 'NORMALIZE', 'KEYWORDS', 'DEMAND', 'COMPETITION', 'PROFIT', 'RISK', 'SCORE', 'REPORT', 'FEEDBACK');

-- CreateEnum
CREATE TYPE "ProductResearchStageStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ProductCandidateStatus" AS ENUM ('DISCOVERED', 'ELIGIBLE', 'SCORED', 'RECOMMENDED', 'WATCH', 'HOLD', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProductSignalStrength" AS ENUM ('STRONG', 'MEDIUM', 'WEAK', 'INVALID');

-- CreateEnum
CREATE TYPE "ProductSignalQuality" AS ENUM ('VERIFIED', 'ESTIMATED', 'MANUAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ProductRiskSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ProductRiskReviewStatus" AS ENUM ('AUTO', 'NEEDS_REVIEW', 'CONFIRMED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ProductResearchDecision" AS ENUM ('TEST_NOW', 'WATCH', 'HOLD', 'REJECT');

-- CreateEnum
CREATE TYPE "ScoringVersionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "ProductResearchSourceStatus" AS ENUM ('HEALTHY', 'DEGRADED', 'FAILED', 'DISABLED', 'NOT_CONFIGURED', 'CSV_ONLY');

-- CreateEnum
CREATE TYPE "ResearchArtifactType" AS ENUM ('TOP_MD', 'TOP_JSON', 'WATCHLIST_JSON', 'REJECTED_JSON', 'RISK_JSON', 'SOURCE_HEALTH_JSON', 'RUN_LOG_JSON');

-- AlterTable
ALTER TABLE "product_research_candidate_decisions" ADD COLUMN     "candidateId" TEXT;

-- AlterTable
ALTER TABLE "product_research_reports" ADD COLUMN     "researchRunId" TEXT;

-- CreateTable
CREATE TABLE "product_research_runs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "workspaceScopeKey" TEXT NOT NULL DEFAULT 'ORG',
    "automationRunId" TEXT,
    "parentRunId" TEXT,
    "businessDate" DATE NOT NULL,
    "scheduleTimezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "trigger" "ProductResearchRunTrigger" NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "status" "ProductResearchRunStatus" NOT NULL DEFAULT 'PENDING',
    "currentStage" "ProductResearchStage",
    "partialData" BOOLEAN NOT NULL DEFAULT false,
    "configSnapshot" JSONB NOT NULL DEFAULT '{}',
    "configVersion" TEXT NOT NULL,
    "scoringVersionId" TEXT,
    "candidateLimit" INTEGER NOT NULL DEFAULT 300,
    "topLimit" INTEGER NOT NULL DEFAULT 10,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorSummary" JSONB,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_research_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_research_stage_runs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "researchRunId" TEXT NOT NULL,
    "stage" "ProductResearchStage" NOT NULL,
    "status" "ProductResearchStageStatus" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "inputSnapshot" JSONB,
    "outputSummary" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_research_stage_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_candidates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "researchRunId" TEXT NOT NULL,
    "legacyReportId" TEXT,
    "fingerprint" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "material" TEXT,
    "primaryUse" TEXT,
    "customizationMethod" TEXT,
    "targetAudience" TEXT,
    "market" TEXT,
    "sourceCount" INTEGER NOT NULL DEFAULT 0,
    "signalStrength" "ProductSignalStrength" NOT NULL DEFAULT 'INVALID',
    "confidenceScore" DOUBLE PRECISION,
    "dataCompleteness" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "ProductCandidateStatus" NOT NULL DEFAULT 'DISCOVERED',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_signals" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "researchRunId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT,
    "url" TEXT,
    "market" TEXT,
    "metricName" TEXT NOT NULL,
    "metricValue" DECIMAL(65,30),
    "unit" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "quality" "ProductSignalQuality" NOT NULL,
    "rawSnapshotRef" TEXT,
    "rawData" JSONB,
    "sourceHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_risk_records" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "researchRunId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "riskType" TEXT NOT NULL,
    "severity" "ProductRiskSeverity" NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "matchedTerm" TEXT,
    "evidence" JSONB NOT NULL,
    "source" TEXT,
    "reviewStatus" "ProductRiskReviewStatus" NOT NULL DEFAULT 'AUTO',
    "reviewTaskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_risk_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_scores" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "researchRunId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "scoringVersionId" TEXT NOT NULL,
    "componentScores" JSONB NOT NULL,
    "rawTotal" DECIMAL(65,30) NOT NULL,
    "finalScore" DECIMAL(65,30) NOT NULL,
    "hardGateStatus" TEXT NOT NULL,
    "hardGateReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "missingDataPenalties" JSONB NOT NULL DEFAULT '[]',
    "rank" INTEGER,
    "decision" "ProductResearchDecision" NOT NULL,
    "explanation" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scoring_versions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "workspaceScopeKey" TEXT NOT NULL DEFAULT 'ORG',
    "version" TEXT NOT NULL,
    "status" "ScoringVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "weights" JSONB NOT NULL,
    "thresholds" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "basedOnVersionId" TEXT,
    "createdBy" TEXT NOT NULL,
    "activatedBy" TEXT,
    "activatedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scoring_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_research_source_health" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "researchRunId" TEXT,
    "source" TEXT NOT NULL,
    "status" "ProductResearchSourceStatus" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "requestedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "dataFreshnessSeconds" INTEGER,
    "httpStatus" INTEGER,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "budgetUsed" DECIMAL(65,30),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_research_source_health_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_feedback" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "productId" TEXT,
    "listingDraftId" TEXT,
    "productLaunchId" TEXT,
    "eventType" TEXT NOT NULL,
    "eventAt" TIMESTAMP(3) NOT NULL,
    "value" DECIMAL(65,30),
    "currency" TEXT,
    "source" TEXT NOT NULL,
    "externalReference" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_report_artifacts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "researchRunId" TEXT NOT NULL,
    "artifactType" "ResearchArtifactType" NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_report_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_research_runs_organizationId_businessDate_idx" ON "product_research_runs"("organizationId", "businessDate");

-- CreateIndex
CREATE INDEX "product_research_runs_workspaceId_businessDate_idx" ON "product_research_runs"("workspaceId", "businessDate");

-- CreateIndex
CREATE INDEX "product_research_runs_status_businessDate_idx" ON "product_research_runs"("status", "businessDate");

-- CreateIndex
CREATE INDEX "product_research_runs_automationRunId_idx" ON "product_research_runs"("automationRunId");

-- CreateIndex
CREATE UNIQUE INDEX "product_research_runs_organizationId_workspaceScopeKey_busi_key" ON "product_research_runs"("organizationId", "workspaceScopeKey", "businessDate", "configVersion", "attempt");

-- CreateIndex
CREATE INDEX "product_research_stage_runs_organizationId_status_idx" ON "product_research_stage_runs"("organizationId", "status");

-- CreateIndex
CREATE INDEX "product_research_stage_runs_researchRunId_stage_idx" ON "product_research_stage_runs"("researchRunId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "product_research_stage_runs_researchRunId_stage_attempt_key" ON "product_research_stage_runs"("researchRunId", "stage", "attempt");

-- CreateIndex
CREATE INDEX "product_candidates_organizationId_fingerprint_lastSeenAt_idx" ON "product_candidates"("organizationId", "fingerprint", "lastSeenAt");

-- CreateIndex
CREATE INDEX "product_candidates_workspaceId_status_idx" ON "product_candidates"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "product_candidates_researchRunId_status_idx" ON "product_candidates"("researchRunId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "product_candidates_researchRunId_fingerprint_key" ON "product_candidates"("researchRunId", "fingerprint");

-- CreateIndex
CREATE INDEX "product_signals_organizationId_source_fetchedAt_idx" ON "product_signals"("organizationId", "source", "fetchedAt");

-- CreateIndex
CREATE INDEX "product_signals_researchRunId_source_idx" ON "product_signals"("researchRunId", "source");

-- CreateIndex
CREATE INDEX "product_signals_candidateId_metricName_idx" ON "product_signals"("candidateId", "metricName");

-- CreateIndex
CREATE UNIQUE INDEX "product_signals_candidateId_source_metricName_sourceHash_key" ON "product_signals"("candidateId", "source", "metricName", "sourceHash");

-- CreateIndex
CREATE INDEX "product_risk_records_organizationId_severity_idx" ON "product_risk_records"("organizationId", "severity");

-- CreateIndex
CREATE INDEX "product_risk_records_researchRunId_severity_idx" ON "product_risk_records"("researchRunId", "severity");

-- CreateIndex
CREATE INDEX "product_risk_records_candidateId_reviewStatus_idx" ON "product_risk_records"("candidateId", "reviewStatus");

-- CreateIndex
CREATE INDEX "product_scores_organizationId_decision_finalScore_idx" ON "product_scores"("organizationId", "decision", "finalScore");

-- CreateIndex
CREATE INDEX "product_scores_researchRunId_decision_rank_idx" ON "product_scores"("researchRunId", "decision", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "product_scores_candidateId_scoringVersionId_key" ON "product_scores"("candidateId", "scoringVersionId");

-- CreateIndex
CREATE INDEX "scoring_versions_organizationId_workspaceScopeKey_status_idx" ON "scoring_versions"("organizationId", "workspaceScopeKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "scoring_versions_organizationId_workspaceScopeKey_version_key" ON "scoring_versions"("organizationId", "workspaceScopeKey", "version");

-- CreateIndex
CREATE INDEX "product_research_source_health_organizationId_source_update_idx" ON "product_research_source_health"("organizationId", "source", "updatedAt");

-- CreateIndex
CREATE INDEX "product_research_source_health_workspaceId_source_updatedAt_idx" ON "product_research_source_health"("workspaceId", "source", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "product_research_source_health_researchRunId_source_key" ON "product_research_source_health"("researchRunId", "source");

-- CreateIndex
CREATE INDEX "product_feedback_candidateId_eventAt_idx" ON "product_feedback"("candidateId", "eventAt");

-- CreateIndex
CREATE INDEX "product_feedback_workspaceId_eventType_eventAt_idx" ON "product_feedback"("workspaceId", "eventType", "eventAt");

-- CreateIndex
CREATE UNIQUE INDEX "product_feedback_organizationId_source_externalReference_ev_key" ON "product_feedback"("organizationId", "source", "externalReference", "eventType");

-- CreateIndex
CREATE INDEX "research_report_artifacts_organizationId_createdAt_idx" ON "research_report_artifacts"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "research_report_artifacts_workspaceId_createdAt_idx" ON "research_report_artifacts"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "research_report_artifacts_researchRunId_artifactType_key" ON "research_report_artifacts"("researchRunId", "artifactType");

-- CreateIndex
CREATE INDEX "product_research_candidate_decisions_candidateId_idx" ON "product_research_candidate_decisions"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "product_research_candidate_decisions_organizationId_candida_key" ON "product_research_candidate_decisions"("organizationId", "candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "product_research_reports_researchRunId_key" ON "product_research_reports"("researchRunId");

-- AddForeignKey
ALTER TABLE "product_research_reports" ADD CONSTRAINT "product_research_reports_researchRunId_fkey" FOREIGN KEY ("researchRunId") REFERENCES "product_research_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_research_candidate_decisions" ADD CONSTRAINT "product_research_candidate_decisions_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "product_candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_research_runs" ADD CONSTRAINT "product_research_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_research_runs" ADD CONSTRAINT "product_research_runs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_research_runs" ADD CONSTRAINT "product_research_runs_scoringVersionId_fkey" FOREIGN KEY ("scoringVersionId") REFERENCES "scoring_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_research_runs" ADD CONSTRAINT "product_research_runs_parentRunId_fkey" FOREIGN KEY ("parentRunId") REFERENCES "product_research_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_research_stage_runs" ADD CONSTRAINT "product_research_stage_runs_researchRunId_fkey" FOREIGN KEY ("researchRunId") REFERENCES "product_research_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_candidates" ADD CONSTRAINT "product_candidates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_candidates" ADD CONSTRAINT "product_candidates_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_candidates" ADD CONSTRAINT "product_candidates_researchRunId_fkey" FOREIGN KEY ("researchRunId") REFERENCES "product_research_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_candidates" ADD CONSTRAINT "product_candidates_legacyReportId_fkey" FOREIGN KEY ("legacyReportId") REFERENCES "product_research_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_signals" ADD CONSTRAINT "product_signals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_signals" ADD CONSTRAINT "product_signals_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_signals" ADD CONSTRAINT "product_signals_researchRunId_fkey" FOREIGN KEY ("researchRunId") REFERENCES "product_research_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_signals" ADD CONSTRAINT "product_signals_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "product_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_risk_records" ADD CONSTRAINT "product_risk_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_risk_records" ADD CONSTRAINT "product_risk_records_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_risk_records" ADD CONSTRAINT "product_risk_records_researchRunId_fkey" FOREIGN KEY ("researchRunId") REFERENCES "product_research_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_risk_records" ADD CONSTRAINT "product_risk_records_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "product_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_scores" ADD CONSTRAINT "product_scores_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_scores" ADD CONSTRAINT "product_scores_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_scores" ADD CONSTRAINT "product_scores_researchRunId_fkey" FOREIGN KEY ("researchRunId") REFERENCES "product_research_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_scores" ADD CONSTRAINT "product_scores_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "product_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_scores" ADD CONSTRAINT "product_scores_scoringVersionId_fkey" FOREIGN KEY ("scoringVersionId") REFERENCES "scoring_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_versions" ADD CONSTRAINT "scoring_versions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_versions" ADD CONSTRAINT "scoring_versions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_versions" ADD CONSTRAINT "scoring_versions_basedOnVersionId_fkey" FOREIGN KEY ("basedOnVersionId") REFERENCES "scoring_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_research_source_health" ADD CONSTRAINT "product_research_source_health_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_research_source_health" ADD CONSTRAINT "product_research_source_health_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_research_source_health" ADD CONSTRAINT "product_research_source_health_researchRunId_fkey" FOREIGN KEY ("researchRunId") REFERENCES "product_research_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_feedback" ADD CONSTRAINT "product_feedback_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_feedback" ADD CONSTRAINT "product_feedback_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_feedback" ADD CONSTRAINT "product_feedback_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "product_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_report_artifacts" ADD CONSTRAINT "research_report_artifacts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_report_artifacts" ADD CONSTRAINT "research_report_artifacts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_report_artifacts" ADD CONSTRAINT "research_report_artifacts_researchRunId_fkey" FOREIGN KEY ("researchRunId") REFERENCES "product_research_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enforce one active scoring version per organization/workspace scope.
CREATE UNIQUE INDEX "scoring_versions_one_active_per_scope"
ON "scoring_versions" ("organizationId", "workspaceScopeKey")
WHERE "status" = 'ACTIVE';

-- Every daily-research table is tenant isolated. Application queries set the
-- organization context through TenantDatabaseContextService.
ALTER TABLE "product_research_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_research_runs" FORCE ROW LEVEL SECURITY;
ALTER TABLE "product_research_stage_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_research_stage_runs" FORCE ROW LEVEL SECURITY;
ALTER TABLE "product_candidates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_candidates" FORCE ROW LEVEL SECURITY;
ALTER TABLE "product_signals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_signals" FORCE ROW LEVEL SECURITY;
ALTER TABLE "product_risk_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_risk_records" FORCE ROW LEVEL SECURITY;
ALTER TABLE "product_scores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_scores" FORCE ROW LEVEL SECURITY;
ALTER TABLE "scoring_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "scoring_versions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "product_research_source_health" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_research_source_health" FORCE ROW LEVEL SECURITY;
ALTER TABLE "product_feedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_feedback" FORCE ROW LEVEL SECURITY;
ALTER TABLE "research_report_artifacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "research_report_artifacts" FORCE ROW LEVEL SECURITY;

CREATE POLICY "product_research_runs_organization_isolation" ON "product_research_runs" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));
CREATE POLICY "product_research_stage_runs_organization_isolation" ON "product_research_stage_runs" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));
CREATE POLICY "product_candidates_organization_isolation" ON "product_candidates" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));
CREATE POLICY "product_signals_organization_isolation" ON "product_signals" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));
CREATE POLICY "product_risk_records_organization_isolation" ON "product_risk_records" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));
CREATE POLICY "product_scores_organization_isolation" ON "product_scores" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));
CREATE POLICY "scoring_versions_organization_isolation" ON "scoring_versions" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));
CREATE POLICY "product_research_source_health_organization_isolation" ON "product_research_source_health" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));
CREATE POLICY "product_feedback_organization_isolation" ON "product_feedback" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));
CREATE POLICY "research_report_artifacts_organization_isolation" ON "research_report_artifacts" FOR ALL
USING ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''))
WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_organization_id', true), ''));
