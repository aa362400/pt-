-- Durable claim/result ledger for POST /listings/generate. The client key is
-- stored only as SHA-256, and the request hash prevents key reuse with a
-- different payload.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE "listing_generation_requests" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "idempotencyKeyHash" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  "claimToken" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL DEFAULT 1,
  "leaseExpiresAt" TIMESTAMP(3) NOT NULL,
  "listingDraftId" TEXT,
  "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "listing_generation_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "listing_generation_requests_key_hash_check"
    CHECK ("idempotencyKeyHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "listing_generation_requests_request_hash_check"
    CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "listing_generation_requests_status_check"
    CHECK ("status" IN ('IN_PROGRESS', 'COMPLETED', 'FAILED')),
  CONSTRAINT "listing_generation_requests_claim_token_check"
    CHECK (char_length("claimToken") BETWEEN 16 AND 128),
  CONSTRAINT "listing_generation_requests_attempt_check"
    CHECK ("attempt" >= 1),
  CONSTRAINT "listing_generation_requests_failure_code_check"
    CHECK ("failureCode" IS NULL OR char_length("failureCode") <= 64)
);

CREATE UNIQUE INDEX "listing_generation_requests_org_user_key_key"
  ON "listing_generation_requests"(
    "organizationId",
    "userId",
    "idempotencyKeyHash"
  );

CREATE UNIQUE INDEX "listing_generation_requests_listing_draft_key"
  ON "listing_generation_requests"("listingDraftId");

CREATE INDEX "listing_generation_requests_org_status_lease_idx"
  ON "listing_generation_requests"(
    "organizationId",
    "status",
    "leaseExpiresAt"
  );

ALTER TABLE "listing_generation_requests"
  ADD CONSTRAINT "listing_generation_requests_organizationId_fkey"
  FOREIGN KEY ("organizationId")
  REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "listing_generation_requests"
  ADD CONSTRAINT "listing_generation_requests_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "listing_generation_requests"
  ADD CONSTRAINT "listing_generation_requests_listingDraftId_fkey"
  FOREIGN KEY ("listingDraftId")
  REFERENCES "listing_drafts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "listing_generation_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "listing_generation_requests" FORCE ROW LEVEL SECURITY;

CREATE POLICY "listing_generation_requests_organization_isolation"
  ON "listing_generation_requests"
  FOR ALL
  USING (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  )
  WITH CHECK (
    "organizationId" =
      NULLIF(current_setting('app.current_organization_id', true), '')
  );

DO $listing_generation_requests_app_role_grant$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'shopmate_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "listing_generation_requests" TO "shopmate_app"';
  END IF;
END
$listing_generation_requests_app_role_grant$;

COMMIT;
