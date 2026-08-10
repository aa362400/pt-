ALTER TYPE "ActionProposalStatus" ADD VALUE IF NOT EXISTS 'UNKNOWN' AFTER 'EXECUTING';

ALTER TABLE "action_proposals"
  ADD COLUMN "dedupeKey" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "activeDedupeSlot" TEXT,
  ADD COLUMN "executionAttempt" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3);

UPDATE "action_proposals"
SET
  "dedupeKey" = "payloadHash",
  "activeDedupeSlot" = CASE
    WHEN "status" IN ('PENDING', 'EXECUTING') THEN 'ACTIVE'
    ELSE NULL
  END;

ALTER TABLE "action_proposals"
  ALTER COLUMN "dedupeKey" SET NOT NULL;

CREATE UNIQUE INDEX "action_proposals_organizationId_dedupeKey_activeDedupeSlot_key"
  ON "action_proposals"("organizationId", "dedupeKey", "activeDedupeSlot");

CREATE OR REPLACE FUNCTION prevent_action_proposal_payload_mutation()
RETURNS trigger AS $$
BEGIN
  IF NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
    OR NEW."notificationId" IS DISTINCT FROM OLD."notificationId"
    OR NEW."requestedBy" IS DISTINCT FROM OLD."requestedBy"
    OR NEW."approverId" IS DISTINCT FROM OLD."approverId"
    OR NEW."source" IS DISTINCT FROM OLD."source"
    OR NEW."action" IS DISTINCT FROM OLD."action"
    OR NEW."params" IS DISTINCT FROM OLD."params"
    OR NEW."context" IS DISTINCT FROM OLD."context"
    OR NEW."payloadHash" IS DISTINCT FROM OLD."payloadHash"
    OR NEW."dedupeKey" IS DISTINCT FROM OLD."dedupeKey"
    OR NEW."version" IS DISTINCT FROM OLD."version"
    OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'Action proposal payload is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
