ALTER TABLE "assistant_sessions"
  ADD COLUMN "allowedDomains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "autonomyLevel" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "context" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "assistant_sessions" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "assistant_sessions" ALTER COLUMN "updatedAt" SET NOT NULL;

CREATE TABLE "agent_autonomy_policies" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT,
  "scopeKey" TEXT NOT NULL,
  "level" INTEGER NOT NULL DEFAULT 1,
  "allowedTools" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "deniedTools" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "highRiskApproval" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_autonomy_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_plans" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "goal" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "plan" JSONB NOT NULL,
  "result" JSONB,
  "error" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_tool_executions" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "toolName" TEXT NOT NULL,
  "toolVersion" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "riskLevel" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "input" JSONB NOT NULL,
  "output" JSONB,
  "error" JSONB,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_tool_executions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "market_observation_batches" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "source" TEXT NOT NULL,
  "pageType" TEXT NOT NULL,
  "pageUrl" TEXT NOT NULL,
  "query" TEXT,
  "category" TEXT,
  "capturedAt" TIMESTAMP(3) NOT NULL,
  "locale" TEXT,
  "pageTitle" TEXT,
  "pageFingerprint" TEXT NOT NULL,
  "parserVersion" TEXT NOT NULL,
  "extensionVersion" TEXT,
  "rawEvidence" JSONB NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "requiresReview" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "market_observation_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "market_observation_items" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "externalId" TEXT,
  "offerId" TEXT,
  "title" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "imageUrl" TEXT,
  "brand" TEXT,
  "category" TEXT,
  "sellerName" TEXT,
  "currentPrice" DECIMAL(65,30),
  "originalPrice" DECIMAL(65,30),
  "currency" TEXT,
  "rating" DOUBLE PRECISION,
  "reviewCount" INTEGER,
  "displayedSalesText" TEXT,
  "position" INTEGER,
  "badges" JSONB NOT NULL DEFAULT '[]',
  "deliveryText" TEXT,
  "promotionText" TEXT,
  "sponsored" BOOLEAN,
  "rawEvidence" JSONB NOT NULL,
  "evidenceHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "market_observation_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_opportunities" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "observationItemId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "externalId" TEXT,
  "sourceUrl" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CANDIDATE',
  "score" DOUBLE PRECISION,
  "decision" TEXT,
  "dimensions" JSONB NOT NULL,
  "reasons" JSONB NOT NULL,
  "risks" JSONB NOT NULL,
  "missingEvidence" JSONB NOT NULL,
  "sources" JSONB NOT NULL,
  "scoringVersion" TEXT NOT NULL,
  "evidenceConfidence" DOUBLE PRECISION NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_opportunities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "business_outcomes" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "productId" TEXT,
  "opportunityId" TEXT,
  "listingDraftId" TEXT,
  "publishSnapshotId" TEXT,
  "source" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "metrics" JSONB NOT NULL,
  "evidence" JSONB NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_outcomes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "agent_autonomy_policies"
  ADD CONSTRAINT "agent_autonomy_policies_level_check" CHECK ("level" BETWEEN 0 AND 4);
ALTER TABLE "assistant_sessions"
  ADD CONSTRAINT "assistant_sessions_autonomyLevel_check" CHECK ("autonomyLevel" BETWEEN 0 AND 4);
ALTER TABLE "market_observation_batches"
  ADD CONSTRAINT "market_observation_batches_confidence_check" CHECK ("confidence" BETWEEN 0 AND 1);
ALTER TABLE "product_opportunities"
  ADD CONSTRAINT "product_opportunities_evidenceConfidence_check" CHECK ("evidenceConfidence" BETWEEN 0 AND 1);
ALTER TABLE "business_outcomes"
  ADD CONSTRAINT "business_outcomes_confidence_check" CHECK ("confidence" BETWEEN 0 AND 1);

CREATE INDEX "agent_autonomy_policies_organizationId_userId_idx" ON "agent_autonomy_policies"("organizationId", "userId");
CREATE UNIQUE INDEX "agent_autonomy_policies_organizationId_scopeKey_key" ON "agent_autonomy_policies"("organizationId", "scopeKey");
CREATE INDEX "agent_plans_organizationId_status_idx" ON "agent_plans"("organizationId", "status");
CREATE INDEX "agent_plans_conversationId_createdAt_idx" ON "agent_plans"("conversationId", "createdAt");
CREATE INDEX "agent_tool_executions_organizationId_status_idx" ON "agent_tool_executions"("organizationId", "status");
CREATE INDEX "agent_tool_executions_planId_idx" ON "agent_tool_executions"("planId");
CREATE UNIQUE INDEX "agent_tool_executions_organizationId_idempotencyKey_key" ON "agent_tool_executions"("organizationId", "idempotencyKey");
CREATE INDEX "market_observation_batches_organizationId_capturedAt_idx" ON "market_observation_batches"("organizationId", "capturedAt");
CREATE INDEX "market_observation_batches_workspaceId_idx" ON "market_observation_batches"("workspaceId");
CREATE UNIQUE INDEX "market_observation_batches_org_fingerprint_captured_key" ON "market_observation_batches"("organizationId", "pageFingerprint", "capturedAt");
CREATE INDEX "market_observation_items_organizationId_externalId_idx" ON "market_observation_items"("organizationId", "externalId");
CREATE INDEX "market_observation_items_organizationId_url_idx" ON "market_observation_items"("organizationId", "url");
CREATE INDEX "market_observation_items_batchId_position_idx" ON "market_observation_items"("batchId", "position");
CREATE INDEX "product_opportunities_organizationId_status_idx" ON "product_opportunities"("organizationId", "status");
CREATE INDEX "product_opportunities_organizationId_score_idx" ON "product_opportunities"("organizationId", "score");
CREATE INDEX "product_opportunities_observationItemId_scoringVersion_idx" ON "product_opportunities"("observationItemId", "scoringVersion");
CREATE INDEX "business_outcomes_organizationId_productId_idx" ON "business_outcomes"("organizationId", "productId");
CREATE INDEX "business_outcomes_organizationId_periodEnd_idx" ON "business_outcomes"("organizationId", "periodEnd");
CREATE INDEX "business_outcomes_opportunityId_idx" ON "business_outcomes"("opportunityId");

ALTER TABLE "agent_autonomy_policies" ADD CONSTRAINT "agent_autonomy_policies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_autonomy_policies" ADD CONSTRAINT "agent_autonomy_policies_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_plans" ADD CONSTRAINT "agent_plans_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "assistant_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_plans" ADD CONSTRAINT "agent_plans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_tool_executions" ADD CONSTRAINT "agent_tool_executions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_tool_executions" ADD CONSTRAINT "agent_tool_executions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "agent_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "market_observation_batches" ADD CONSTRAINT "market_observation_batches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "market_observation_batches" ADD CONSTRAINT "market_observation_batches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "market_observation_batches" ADD CONSTRAINT "market_observation_batches_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "market_observation_items" ADD CONSTRAINT "market_observation_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "market_observation_items" ADD CONSTRAINT "market_observation_items_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "market_observation_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_opportunities" ADD CONSTRAINT "product_opportunities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_opportunities" ADD CONSTRAINT "product_opportunities_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_opportunities" ADD CONSTRAINT "product_opportunities_observationItemId_fkey" FOREIGN KEY ("observationItemId") REFERENCES "market_observation_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_opportunities" ADD CONSTRAINT "product_opportunities_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_outcomes" ADD CONSTRAINT "business_outcomes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "business_outcomes" ADD CONSTRAINT "business_outcomes_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "business_outcomes" ADD CONSTRAINT "business_outcomes_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "product_opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_autonomy_policies', 'agent_plans', 'agent_tool_executions',
    'market_observation_batches', 'market_observation_items',
    'product_opportunities', 'business_outcomes'
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
