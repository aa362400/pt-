-- =============================================================================
-- ShopMate AI text?Review Task System
-- =============================================================================
-- Adds ReviewTask model, enums, and supporting indexes for human review
-- workflow and consistency scoring integration.
--
-- Migration: 20260707000002_add_review_tasks
-- Applied:    yyyy-mm-dd
-- =============================================================================

-- english_text?-- PHASE 1 text?Enums
-- english_text?
-- Review status for tracking human review outcomes
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REWORK');

-- Entity types that can have review tasks
CREATE TYPE "ReviewEntityType" AS ENUM ('AGENT_RUN', 'IMAGE_GENERATION', 'LISTING_DRAFT', 'PRODUCT_RESEARCH');

-- english_text?-- PHASE 2 text?Review Task table
-- english_text?
CREATE TABLE "review_tasks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" "ReviewEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "score" DOUBLE PRECISION,
    "threshold" DOUBLE PRECISION NOT NULL DEFAULT 60.0,
    "autoApproved" BOOLEAN NOT NULL DEFAULT false,
    "autoRegenerations" INTEGER NOT NULL DEFAULT 0,
    "assignedTo" TEXT,
    "notes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_tasks_pkey" PRIMARY KEY ("id")
);

-- english_text?-- PHASE 3 text?Indexes
-- english_text?
-- Org-scoped queries (core tenancy pattern)
CREATE INDEX IF NOT EXISTS "idx_review_tasks_organization_id"
  ON "review_tasks" ("organizationId");

-- Filter queries by entity type
CREATE INDEX IF NOT EXISTS "idx_review_tasks_entity_type"
  ON "review_tasks" ("entityType");

-- Lookup by entity ID (reverse relation queries)
CREATE INDEX IF NOT EXISTS "idx_review_tasks_entity_id"
  ON "review_tasks" ("entityId");

-- Filter by review status (pending/approved/rejected/rework)
CREATE INDEX IF NOT EXISTS "idx_review_tasks_status"
  ON "review_tasks" ("status");

-- Reviewer assignment queries
CREATE INDEX IF NOT EXISTS "idx_review_tasks_assigned_to"
  ON "review_tasks" ("assignedTo");

-- Time-ordered queries (dashboard, recents)
CREATE INDEX IF NOT EXISTS "idx_review_tasks_created_at"
  ON "review_tasks" ("createdAt");

-- Composite: org + status + createdAt (for query performance)
CREATE INDEX IF NOT EXISTS "idx_review_tasks_org_status_created"
  ON "review_tasks" ("organizationId", "status", "createdAt" DESC);

-- english_text?-- PHASE 4 text?Foreign keys
-- english_text?
ALTER TABLE "review_tasks"
  ADD CONSTRAINT "review_tasks_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- english_text?-- PHASE 5 text?Down migration (for rollback)
-- english_text?-- To roll back this migration, run:
--
--   DROP TABLE IF EXISTS "review_tasks";
--   DROP TYPE IF EXISTS "ReviewStatus";
--   DROP TYPE IF EXISTS "ReviewEntityType";
--
-- english_text?