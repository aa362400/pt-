-- Durable store operating rules and human candidate decisions.

CREATE TYPE "ResearchCandidateDecisionStatus" AS ENUM ('APPROVED', 'REJECTED');

CREATE TABLE "store_agent_profiles" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "targetCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "forbiddenTerms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "minimumProfitMargin" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_agent_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_research_candidate_decisions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "candidateIndex" INTEGER NOT NULL,
    "status" "ResearchCandidateDecisionStatus" NOT NULL,
    "reason" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_research_candidate_decisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "store_agent_profiles_workspaceId_key"
  ON "store_agent_profiles"("workspaceId");
CREATE UNIQUE INDEX "product_research_candidate_decisions_organizationId_reportId_candidateIndex_key"
  ON "product_research_candidate_decisions"("organizationId", "reportId", "candidateIndex");
CREATE INDEX "product_research_candidate_decisions_organizationId_idx"
  ON "product_research_candidate_decisions"("organizationId");
CREATE INDEX "product_research_candidate_decisions_reportId_idx"
  ON "product_research_candidate_decisions"("reportId");
CREATE INDEX "product_research_candidate_decisions_workspaceId_idx"
  ON "product_research_candidate_decisions"("workspaceId");
CREATE INDEX "product_research_candidate_decisions_status_idx"
  ON "product_research_candidate_decisions"("status");

ALTER TABLE "store_agent_profiles"
  ADD CONSTRAINT "store_agent_profiles_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_research_candidate_decisions"
  ADD CONSTRAINT "product_research_candidate_decisions_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_research_candidate_decisions"
  ADD CONSTRAINT "product_research_candidate_decisions_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "product_research_reports"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_research_candidate_decisions"
  ADD CONSTRAINT "product_research_candidate_decisions_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
