ALTER TYPE "AgentRunStatus" ADD VALUE IF NOT EXISTS 'ENQUEUING';
ALTER TYPE "AgentRunStatus" ADD VALUE IF NOT EXISTS 'QUEUED';
ALTER TYPE "AgentRunStatus" ADD VALUE IF NOT EXISTS 'RETRYING';
ALTER TYPE "AgentRunStatus" ADD VALUE IF NOT EXISTS 'DEAD_LETTERED';

CREATE TYPE "OutboxStatus" AS ENUM (
  'PENDING', 'PROCESSING', 'PUBLISHED', 'RETRYING', 'FAILED', 'DEAD_LETTERED'
);

CREATE TABLE "outbox_events" (
  "id" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "organizationId" TEXT,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextRetryAt" TIMESTAMP(3),
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "lastError" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "outbox_events_status_nextRetryAt_createdAt_idx"
  ON "outbox_events"("status", "nextRetryAt", "createdAt");
CREATE INDEX "outbox_events_aggregateType_aggregateId_idx"
  ON "outbox_events"("aggregateType", "aggregateId");
CREATE INDEX "outbox_events_organizationId_createdAt_idx"
  ON "outbox_events"("organizationId", "createdAt");
CREATE UNIQUE INDEX "outbox_events_dedupeKey_key"
  ON "outbox_events"("dedupeKey");
