ALTER TYPE "ActionProposalStatus" ADD VALUE IF NOT EXISTS 'CHANGES_REQUESTED';
ALTER TYPE "ActionProposalStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

CREATE TYPE "ApprovalDecisionType" AS ENUM (
  'APPROVE',
  'REJECT',
  'REQUEST_CHANGES',
  'OVERRIDE'
);

CREATE TYPE "ListingSandboxRiskLevel" AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH',
  'BLOCKED'
);

CREATE TYPE "ListingSandboxStatus" AS ENUM (
  'PASSED',
  'REVIEW_REQUIRED',
  'BLOCKED',
  'OVERRIDDEN'
);

CREATE TABLE "listing_sandbox_reports" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "publishSnapshotId" TEXT NOT NULL,
  "snapshotHash" TEXT NOT NULL,
  "target" TEXT NOT NULL DEFAULT 'OZON',
  "policyVersion" TEXT NOT NULL,
  "status" "ListingSandboxStatus" NOT NULL,
  "riskLevel" "ListingSandboxRiskLevel" NOT NULL,
  "blocking" BOOLEAN NOT NULL DEFAULT false,
  "summary" JSONB NOT NULL DEFAULT '{}',
  "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "overriddenBy" TEXT,
  "overrideReason" TEXT,
  "overriddenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "listing_sandbox_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "policy_rule_hits" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "sandboxReportId" TEXT NOT NULL,
  "ruleCode" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "severity" "ListingSandboxRiskLevel" NOT NULL,
  "blocking" BOOLEAN NOT NULL DEFAULT false,
  "message" TEXT NOT NULL,
  "evidence" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "policy_rule_hits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "approval_decisions" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "actionProposalId" TEXT NOT NULL,
  "decision" "ApprovalDecisionType" NOT NULL,
  "actorId" TEXT NOT NULL,
  "actorRole" TEXT NOT NULL,
  "reason" TEXT,
  "payloadHash" TEXT NOT NULL,
  "sandboxReportId" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "approval_decisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "listing_sandbox_reports_publishSnapshotId_key"
  ON "listing_sandbox_reports"("publishSnapshotId");
CREATE INDEX "listing_sandbox_reports_organizationId_idx"
  ON "listing_sandbox_reports"("organizationId");
CREATE INDEX "listing_sandbox_reports_snapshotHash_idx"
  ON "listing_sandbox_reports"("snapshotHash");
CREATE INDEX "listing_sandbox_reports_status_idx"
  ON "listing_sandbox_reports"("status");
CREATE INDEX "listing_sandbox_reports_riskLevel_idx"
  ON "listing_sandbox_reports"("riskLevel");
CREATE INDEX "listing_sandbox_reports_evaluatedAt_idx"
  ON "listing_sandbox_reports"("evaluatedAt");

CREATE INDEX "policy_rule_hits_organizationId_idx"
  ON "policy_rule_hits"("organizationId");
CREATE INDEX "policy_rule_hits_sandboxReportId_idx"
  ON "policy_rule_hits"("sandboxReportId");
CREATE INDEX "policy_rule_hits_ruleCode_idx"
  ON "policy_rule_hits"("ruleCode");
CREATE INDEX "policy_rule_hits_severity_idx"
  ON "policy_rule_hits"("severity");
CREATE INDEX "policy_rule_hits_createdAt_idx"
  ON "policy_rule_hits"("createdAt");

CREATE INDEX "approval_decisions_organizationId_idx"
  ON "approval_decisions"("organizationId");
CREATE INDEX "approval_decisions_actionProposalId_idx"
  ON "approval_decisions"("actionProposalId");
CREATE INDEX "approval_decisions_decision_idx"
  ON "approval_decisions"("decision");
CREATE INDEX "approval_decisions_actorId_idx"
  ON "approval_decisions"("actorId");
CREATE INDEX "approval_decisions_createdAt_idx"
  ON "approval_decisions"("createdAt");

ALTER TABLE "listing_sandbox_reports"
  ADD CONSTRAINT "listing_sandbox_reports_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "listing_sandbox_reports_publishSnapshotId_fkey"
  FOREIGN KEY ("publishSnapshotId") REFERENCES "listing_publish_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "policy_rule_hits"
  ADD CONSTRAINT "policy_rule_hits_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "policy_rule_hits_sandboxReportId_fkey"
  FOREIGN KEY ("sandboxReportId") REFERENCES "listing_sandbox_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "approval_decisions"
  ADD CONSTRAINT "approval_decisions_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "approval_decisions_actionProposalId_fkey"
  FOREIGN KEY ("actionProposalId") REFERENCES "action_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "approval_decisions_sandboxReportId_fkey"
  FOREIGN KEY ("sandboxReportId") REFERENCES "listing_sandbox_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'listing_sandbox_reports', 'policy_rule_hits', 'approval_decisions'
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
