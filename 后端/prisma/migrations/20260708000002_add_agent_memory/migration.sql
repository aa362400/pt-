-- Stage 18-20: durable agent work memory, review learning, and autonomy metrics.

CREATE TABLE "agent_work_memories" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "agentRunId" TEXT,
    "productId" TEXT,
    "productName" TEXT,
    "taskType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "reviewStatus" TEXT,
    "reviewNotes" TEXT,
    "durationSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "result" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_work_memories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_experience_cards" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "sourceReviewTaskId" TEXT,
    "taskType" TEXT,
    "entityType" TEXT,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "lesson" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "scoreImpact" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_experience_cards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_autonomy_daily_metrics" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "taskSuccessRate" DOUBLE PRECISION NOT NULL,
    "suggestionAdoptionRate" DOUBLE PRECISION NOT NULL,
    "autonomousCompletionRate" DOUBLE PRECISION NOT NULL,
    "memoryQueryAccuracy" DOUBLE PRECISION NOT NULL,
    "unauthorizedActionCount" INTEGER NOT NULL DEFAULT 0,
    "totalTasks" INTEGER NOT NULL DEFAULT 0,
    "successfulTasks" INTEGER NOT NULL DEFAULT 0,
    "totalSuggestions" INTEGER NOT NULL DEFAULT 0,
    "acceptedSuggestions" INTEGER NOT NULL DEFAULT 0,
    "autonomousCompletions" INTEGER NOT NULL DEFAULT 0,
    "memoryQaTotal" INTEGER NOT NULL DEFAULT 0,
    "memoryQaCorrect" INTEGER NOT NULL DEFAULT 0,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_autonomy_daily_metrics_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_work_memories_organizationId_idx" ON "agent_work_memories"("organizationId");
CREATE INDEX "agent_work_memories_workspaceId_idx" ON "agent_work_memories"("workspaceId");
CREATE INDEX "agent_work_memories_agentRunId_idx" ON "agent_work_memories"("agentRunId");
CREATE INDEX "agent_work_memories_productId_idx" ON "agent_work_memories"("productId");
CREATE INDEX "agent_work_memories_productName_idx" ON "agent_work_memories"("productName");
CREATE INDEX "agent_work_memories_taskType_idx" ON "agent_work_memories"("taskType");
CREATE INDEX "agent_work_memories_status_idx" ON "agent_work_memories"("status");
CREATE INDEX "agent_work_memories_createdAt_idx" ON "agent_work_memories"("createdAt");

CREATE INDEX "agent_experience_cards_organizationId_idx" ON "agent_experience_cards"("organizationId");
CREATE INDEX "agent_experience_cards_workspaceId_idx" ON "agent_experience_cards"("workspaceId");
CREATE INDEX "agent_experience_cards_sourceReviewTaskId_idx" ON "agent_experience_cards"("sourceReviewTaskId");
CREATE INDEX "agent_experience_cards_taskType_idx" ON "agent_experience_cards"("taskType");
CREATE INDEX "agent_experience_cards_entityType_idx" ON "agent_experience_cards"("entityType");
CREATE INDEX "agent_experience_cards_category_idx" ON "agent_experience_cards"("category");
CREATE INDEX "agent_experience_cards_createdAt_idx" ON "agent_experience_cards"("createdAt");

CREATE UNIQUE INDEX "agent_autonomy_daily_metrics_organizationId_date_key"
  ON "agent_autonomy_daily_metrics"("organizationId", "date");
CREATE INDEX "agent_autonomy_daily_metrics_organizationId_idx" ON "agent_autonomy_daily_metrics"("organizationId");
CREATE INDEX "agent_autonomy_daily_metrics_date_idx" ON "agent_autonomy_daily_metrics"("date");
CREATE INDEX "agent_autonomy_daily_metrics_passed_idx" ON "agent_autonomy_daily_metrics"("passed");

ALTER TABLE "agent_work_memories"
  ADD CONSTRAINT "agent_work_memories_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agent_work_memories"
  ADD CONSTRAINT "agent_work_memories_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "agent_work_memories"
  ADD CONSTRAINT "agent_work_memories_agentRunId_fkey"
  FOREIGN KEY ("agentRunId") REFERENCES "agent_runs"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "agent_experience_cards"
  ADD CONSTRAINT "agent_experience_cards_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agent_experience_cards"
  ADD CONSTRAINT "agent_experience_cards_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "agent_autonomy_daily_metrics"
  ADD CONSTRAINT "agent_autonomy_daily_metrics_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
