-- Add durable organization control and resumable checkpoint metadata without
-- changing any existing run state or applying the new terminal values yet.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TYPE "OrganizationAgentControlState" AS ENUM (
  'RUNNING',
  'PAUSE_REQUESTED',
  'STOP_REQUESTED'
);

-- PostgreSQL makes these values usable after this migration commits. The
-- follow-up migration is intentionally separate before it references PAUSED.
ALTER TYPE "ProductResearchRunStatus" ADD VALUE IF NOT EXISTS 'PAUSED';
ALTER TYPE "ProductResearchRunStatus" ADD VALUE IF NOT EXISTS 'STOPPED';

ALTER TABLE "product_research_runs"
  ADD COLUMN "controlRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "checkpointStage" "ProductResearchStage",
  ADD COLUMN "checkpointedAt" TIMESTAMP(3),
  ADD CONSTRAINT "product_research_runs_controlRevision_check"
    CHECK ("controlRevision" >= 0);

ALTER TABLE "automation_runs"
  ADD COLUMN "controlRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "checkpointStepIndex" INTEGER,
  ADD COLUMN "checkpointedAt" TIMESTAMP(3),
  ADD CONSTRAINT "automation_runs_controlRevision_check"
    CHECK ("controlRevision" >= 0),
  ADD CONSTRAINT "automation_runs_checkpointStepIndex_check"
    CHECK (
      "checkpointStepIndex" IS NULL
      OR "checkpointStepIndex" >= 0
    );

CREATE TABLE "organization_agent_controls" (
  "organizationId" TEXT NOT NULL,
  "state" "OrganizationAgentControlState" NOT NULL DEFAULT 'RUNNING',
  "revision" INTEGER NOT NULL DEFAULT 0,
  "requestedAt" TIMESTAMP(3),
  "requestedBy" TEXT,
  "requestReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "organization_agent_controls_pkey"
    PRIMARY KEY ("organizationId"),
  CONSTRAINT "organization_agent_controls_revision_check"
    CHECK ("revision" >= 0),
  CONSTRAINT "organization_agent_controls_reason_check"
    CHECK (
      "requestReason" IS NULL
      OR char_length("requestReason") <= 500
    )
);

ALTER TABLE "organization_agent_controls"
  ADD CONSTRAINT "organization_agent_controls_organizationId_fkey"
  FOREIGN KEY ("organizationId")
  REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "organization_agent_controls_state_updatedAt_idx"
  ON "organization_agent_controls"("state", "updatedAt");

-- Preserve the effective state of the legacy boolean kill switch. RUNNING rows
-- start at revision zero; an existing enabled pause is imported as revision one.
INSERT INTO "organization_agent_controls" (
  "organizationId",
  "state",
  "revision",
  "requestedAt",
  "requestedBy",
  "requestReason",
  "createdAt",
  "updatedAt"
)
SELECT
  o."id",
  CASE
    WHEN COALESCE(f."enabled", false)
      THEN 'PAUSE_REQUESTED'::"OrganizationAgentControlState"
    ELSE 'RUNNING'::"OrganizationAgentControlState"
  END,
  CASE WHEN COALESCE(f."enabled", false) THEN 1 ELSE 0 END,
  CASE WHEN COALESCE(f."enabled", false) THEN f."updatedAt" ELSE NULL END,
  NULL,
  CASE
    WHEN COALESCE(f."enabled", false) THEN 'LEGACY_FEATURE_FLAG_BACKFILL'
    ELSE NULL
  END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "organizations" AS o
LEFT JOIN "feature_flags" AS f
  ON f."name" = 'agent-paused-' || o."id"
ON CONFLICT ("organizationId") DO NOTHING;

ALTER TABLE "organization_agent_controls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_agent_controls" FORCE ROW LEVEL SECURITY;

CREATE POLICY "organization_agent_controls_organization_isolation"
  ON "organization_agent_controls"
  FOR ALL
  USING (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  )
  WITH CHECK (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  );

DO $organization_agent_controls_app_role_grant$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'shopmate_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "organization_agent_controls" TO "shopmate_app"';
  END IF;
END
$organization_agent_controls_app_role_grant$;

COMMIT;
