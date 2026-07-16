CREATE TYPE "PromptVersionStatus" AS ENUM ('DRAFT', 'CHALLENGER', 'CHAMPION', 'RETIRED');
CREATE TYPE "TrainingJobStatus" AS ENUM ('DRAFT', 'QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

ALTER TABLE "business_outcomes"
  ADD COLUMN "agentRunId" TEXT,
  ADD COLUMN "externalReference" TEXT;

CREATE UNIQUE INDEX "business_outcomes_organizationId_source_externalReference_key"
  ON "business_outcomes"("organizationId", "source", "externalReference");
CREATE INDEX "business_outcomes_agentRunId_idx" ON "business_outcomes"("agentRunId");

CREATE TABLE "feedback_signals" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "runId" TEXT,
  "approvalId" TEXT,
  "listingId" TEXT,
  "snapshotId" TEXT,
  "promptVersion" TEXT,
  "modelVersion" TEXT,
  "agentType" "AgentType",
  "signalType" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "externalReference" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "feedback_signals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_eval_snapshots" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "agentType" "AgentType" NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "windowEnd" TIMESTAMP(3) NOT NULL,
  "scores" JSONB NOT NULL,
  "sampleSize" INTEGER NOT NULL,
  "coverage" DOUBLE PRECISION NOT NULL,
  "version" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_eval_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "prompt_versions" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "agentType" "AgentType" NOT NULL,
  "version" TEXT NOT NULL,
  "templateRef" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "routingWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" "PromptVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activatedAt" TIMESTAMP(3),
  CONSTRAINT "prompt_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "router_decision_logs" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "decisionKey" TEXT NOT NULL,
  "agentType" "AgentType" NOT NULL,
  "selectedModel" TEXT NOT NULL,
  "selectedPromptVersion" TEXT,
  "reason" JSONB NOT NULL,
  "latencyMs" INTEGER,
  "costAmount" DECIMAL(65,30),
  "qualityScore" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "router_decision_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "training_jobs" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "agentType" "AgentType" NOT NULL,
  "status" "TrainingJobStatus" NOT NULL DEFAULT 'DRAFT',
  "datasetRef" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "requestedBy" TEXT NOT NULL,
  "approvedBy" TEXT,
  "result" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "training_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "feedback_signals_org_source_reference_type_key"
  ON "feedback_signals"("organizationId", "source", "externalReference", "signalType");
CREATE INDEX "feedback_signals_org_type_created_idx"
  ON "feedback_signals"("organizationId", "signalType", "createdAt");
CREATE INDEX "feedback_signals_run_created_idx" ON "feedback_signals"("runId", "createdAt");
CREATE INDEX "feedback_signals_approval_idx" ON "feedback_signals"("approvalId");
CREATE INDEX "feedback_signals_listing_idx" ON "feedback_signals"("listingId");
CREATE INDEX "feedback_signals_snapshot_idx" ON "feedback_signals"("snapshotId");

CREATE UNIQUE INDEX "agent_eval_snapshots_org_agent_window_version_key"
  ON "agent_eval_snapshots"("organizationId", "agentType", "windowStart", "windowEnd", "version");
CREATE INDEX "agent_eval_snapshots_org_agent_window_idx"
  ON "agent_eval_snapshots"("organizationId", "agentType", "windowEnd");

CREATE UNIQUE INDEX "prompt_versions_org_agent_version_key"
  ON "prompt_versions"("organizationId", "agentType", "version");
CREATE INDEX "prompt_versions_org_agent_status_idx"
  ON "prompt_versions"("organizationId", "agentType", "status");
CREATE INDEX "prompt_versions_contentHash_idx" ON "prompt_versions"("contentHash");

CREATE UNIQUE INDEX "router_decision_logs_org_decisionKey_key"
  ON "router_decision_logs"("organizationId", "decisionKey");
CREATE INDEX "router_decision_logs_org_agent_created_idx"
  ON "router_decision_logs"("organizationId", "agentType", "createdAt");
CREATE INDEX "router_decision_logs_run_idx" ON "router_decision_logs"("runId");

CREATE INDEX "training_jobs_org_agent_status_idx"
  ON "training_jobs"("organizationId", "agentType", "status");
CREATE INDEX "training_jobs_inputHash_idx" ON "training_jobs"("inputHash");

ALTER TABLE "feedback_signals"
  ADD CONSTRAINT "feedback_signals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "feedback_signals_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_eval_snapshots"
  ADD CONSTRAINT "agent_eval_snapshots_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prompt_versions"
  ADD CONSTRAINT "prompt_versions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "router_decision_logs"
  ADD CONSTRAINT "router_decision_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "router_decision_logs_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_jobs"
  ADD CONSTRAINT "training_jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'feedback_signals', 'agent_eval_snapshots', 'prompt_versions',
    'router_decision_logs', 'training_jobs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING ("organizationId" = NULLIF(current_setting(''app.current_organization_id'', true), '''')) WITH CHECK ("organizationId" = NULLIF(current_setting(''app.current_organization_id'', true), ''''))',
      table_name || '_organization_isolation', table_name
    );
  END LOOP;
END $$;
