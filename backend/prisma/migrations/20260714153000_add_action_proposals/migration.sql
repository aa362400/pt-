CREATE TYPE "ActionProposalStatus" AS ENUM (
  'PENDING',
  'EXECUTING',
  'APPROVED',
  'EXECUTED',
  'DISMISSED',
  'FAILED',
  'EXPIRED'
);

CREATE TABLE "action_proposals" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "requestedBy" TEXT NOT NULL,
  "approverId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "params" JSONB NOT NULL,
  "context" JSONB NOT NULL DEFAULT '{}',
  "payloadHash" TEXT NOT NULL,
  "status" "ActionProposalStatus" NOT NULL DEFAULT 'PENDING',
  "result" JSONB,
  "error" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "claimedAt" TIMESTAMP(3),
  "decidedAt" TIMESTAMP(3),
  "executedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "action_proposals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "action_proposals_notificationId_key"
  ON "action_proposals"("notificationId");
CREATE INDEX "action_proposals_organizationId_status_idx"
  ON "action_proposals"("organizationId", "status");
CREATE INDEX "action_proposals_organizationId_approverId_status_idx"
  ON "action_proposals"("organizationId", "approverId", "status");
CREATE INDEX "action_proposals_expiresAt_idx"
  ON "action_proposals"("expiresAt");
CREATE INDEX "action_proposals_createdAt_idx"
  ON "action_proposals"("createdAt");

ALTER TABLE "action_proposals"
  ADD CONSTRAINT "action_proposals_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "action_proposals"
  ADD CONSTRAINT "action_proposals_notificationId_fkey"
  FOREIGN KEY ("notificationId") REFERENCES "notifications"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "action_proposals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "action_proposals" FORCE ROW LEVEL SECURITY;

CREATE POLICY "action_proposals_organization_isolation"
  ON "action_proposals"
  FOR ALL
  USING (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  )
  WITH CHECK (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  );

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
    OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'Action proposal payload is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "action_proposals_immutable_payload"
BEFORE UPDATE ON "action_proposals"
FOR EACH ROW EXECUTE FUNCTION prevent_action_proposal_payload_mutation();
