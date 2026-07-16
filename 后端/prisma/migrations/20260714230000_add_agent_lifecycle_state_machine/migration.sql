CREATE TYPE "AgentLifecycleStatus" AS ENUM (
  'CREATED',
  'PLANNING',
  'WAITING_TOOL',
  'WAITING_APPROVAL',
  'EXECUTING',
  'VERIFYING',
  'RETRY_SCHEDULED',
  'COMPLETED',
  'FAILED',
  'CANCELLED'
);

CREATE TYPE "AgentStepStatus" AS ENUM (
  'PENDING',
  'RUNNING',
  'WAITING_APPROVAL',
  'COMPLETED',
  'FAILED',
  'CANCELLED'
);

ALTER TABLE "agent_runs"
  ADD COLUMN "lifecycleStatus" "AgentLifecycleStatus" NOT NULL DEFAULT 'CREATED',
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "currentStep" TEXT,
  ADD COLUMN "traceId" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "agent_runs"
SET "lifecycleStatus" = CASE
  WHEN "status" IN ('RUNNING') THEN 'EXECUTING'::"AgentLifecycleStatus"
  WHEN "status" IN ('RETRYING') THEN 'RETRY_SCHEDULED'::"AgentLifecycleStatus"
  WHEN "status" IN ('COMPLETED') THEN 'COMPLETED'::"AgentLifecycleStatus"
  WHEN "status" IN ('FAILED', 'TIMEOUT', 'DEAD_LETTERED') THEN 'FAILED'::"AgentLifecycleStatus"
  WHEN "status" IN ('CANCELLED') THEN 'CANCELLED'::"AgentLifecycleStatus"
  ELSE 'CREATED'::"AgentLifecycleStatus"
END;

CREATE TABLE "agent_transitions" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "fromStatus" "AgentLifecycleStatus",
  "toStatus" "AgentLifecycleStatus" NOT NULL,
  "eventType" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "attempt" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_transitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_steps" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "stepKey" TEXT NOT NULL,
  "stepType" TEXT NOT NULL,
  "toolName" TEXT,
  "toolCallId" TEXT,
  "status" "AgentStepStatus" NOT NULL DEFAULT 'PENDING',
  "inputRef" TEXT,
  "outputRef" TEXT,
  "attempt" INTEGER NOT NULL DEFAULT 1,
  "version" INTEGER NOT NULL DEFAULT 0,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_steps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_run_leases" (
  "runId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "leaseUntil" TIMESTAMP(3) NOT NULL,
  "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_run_leases_pkey" PRIMARY KEY ("runId")
);

INSERT INTO "agent_transitions" (
  "id", "organizationId", "runId", "fromStatus", "toStatus",
  "eventType", "eventKey", "payload", "attempt", "createdAt"
)
SELECT
  "id" || '_migration_v2',
  "organizationId",
  "id",
  NULL,
  "lifecycleStatus",
  'MIGRATED_LEGACY_STATE',
  'migration:agent-state-v2:' || "id",
  jsonb_build_object('legacyStatus', "status"::TEXT),
  "attempt",
  "createdAt"
FROM "agent_runs";

CREATE UNIQUE INDEX "agent_transitions_eventKey_key" ON "agent_transitions"("eventKey");
CREATE INDEX "agent_transitions_organizationId_createdAt_idx" ON "agent_transitions"("organizationId", "createdAt");
CREATE INDEX "agent_transitions_runId_createdAt_idx" ON "agent_transitions"("runId", "createdAt");
CREATE INDEX "agent_transitions_runId_eventType_idx" ON "agent_transitions"("runId", "eventType");

CREATE UNIQUE INDEX "agent_steps_runId_stepKey_attempt_key" ON "agent_steps"("runId", "stepKey", "attempt");
CREATE INDEX "agent_steps_organizationId_status_createdAt_idx" ON "agent_steps"("organizationId", "status", "createdAt");
CREATE INDEX "agent_steps_runId_createdAt_idx" ON "agent_steps"("runId", "createdAt");
CREATE INDEX "agent_steps_toolCallId_idx" ON "agent_steps"("toolCallId");

CREATE INDEX "agent_run_leases_organizationId_leaseUntil_idx" ON "agent_run_leases"("organizationId", "leaseUntil");
CREATE INDEX "agent_run_leases_ownerId_leaseUntil_idx" ON "agent_run_leases"("ownerId", "leaseUntil");

CREATE INDEX "agent_runs_organizationId_lifecycleStatus_createdAt_idx" ON "agent_runs"("organizationId", "lifecycleStatus", "createdAt");
CREATE INDEX "agent_runs_traceId_idx" ON "agent_runs"("traceId");

ALTER TABLE "agent_transitions"
  ADD CONSTRAINT "agent_transitions_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_steps"
  ADD CONSTRAINT "agent_steps_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_run_leases"
  ADD CONSTRAINT "agent_run_leases_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agent_transitions"
  ADD CONSTRAINT "agent_transitions_attempt_check" CHECK ("attempt" > 0);
ALTER TABLE "agent_steps"
  ADD CONSTRAINT "agent_steps_attempt_check" CHECK ("attempt" > 0),
  ADD CONSTRAINT "agent_steps_version_check" CHECK ("version" >= 0);
ALTER TABLE "agent_run_leases"
  ADD CONSTRAINT "agent_run_leases_version_check" CHECK ("version" >= 0);
ALTER TABLE "agent_runs"
  ADD CONSTRAINT "agent_runs_version_check" CHECK ("version" >= 0);

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_transitions', 'agent_steps', 'agent_run_leases'
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
