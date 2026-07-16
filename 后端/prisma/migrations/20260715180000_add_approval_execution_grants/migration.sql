ALTER TABLE "action_proposals"
  ADD COLUMN "executionGrantHash" TEXT,
  ADD COLUMN "executionGrantScope" TEXT,
  ADD COLUMN "executionGrantDecisionId" TEXT,
  ADD COLUMN "executionGrantExpiresAt" TIMESTAMP(3),
  ADD COLUMN "executionGrantConsumedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "action_proposals_executionGrantHash_key"
  ON "action_proposals"("executionGrantHash");

CREATE INDEX "action_proposals_organizationId_executionGrantDecisionId_idx"
  ON "action_proposals"("organizationId", "executionGrantDecisionId");

CREATE INDEX "action_proposals_executionGrantExpiresAt_idx"
  ON "action_proposals"("executionGrantExpiresAt");
