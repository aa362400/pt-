-- =============================================================================
-- ShopMate AI — Auth / Billing / Compliance drift fix
-- =============================================================================
-- Brings the database in line with schema.prisma:
--   * users: email verification + TOTP 2FA columns
--   * password_reset_tokens, email_verification_tokens
--   * dead_letter_jobs (BullMQ dead letter persistence)
--   * user_consents (GDPR consent records)
--   * invoices (billing)
--   * feature_flags (gray release)
-- =============================================================================

-- ─── users: new columns ──────────────────────────────────────────────────────

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twoFactorSecret" TEXT;

-- ─── password_reset_tokens ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");
CREATE INDEX IF NOT EXISTS "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");
CREATE INDEX IF NOT EXISTS "password_reset_tokens_expiresAt_idx" ON "password_reset_tokens"("expiresAt");

ALTER TABLE "password_reset_tokens"
  ADD CONSTRAINT "password_reset_tokens_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── email_verification_tokens ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "email_verification_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_verification_tokens_tokenHash_key" ON "email_verification_tokens"("tokenHash");
CREATE INDEX IF NOT EXISTS "email_verification_tokens_userId_idx" ON "email_verification_tokens"("userId");
CREATE INDEX IF NOT EXISTS "email_verification_tokens_expiresAt_idx" ON "email_verification_tokens"("expiresAt");

ALTER TABLE "email_verification_tokens"
  ADD CONSTRAINT "email_verification_tokens_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── dead_letter_jobs ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "dead_letter_jobs" (
    "id" TEXT NOT NULL,
    "queueName" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "failedReason" TEXT,
    "failedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inspectedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dead_letter_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "dead_letter_jobs_queueName_idx" ON "dead_letter_jobs"("queueName");
CREATE INDEX IF NOT EXISTS "dead_letter_jobs_failedAt_idx" ON "dead_letter_jobs"("failedAt");
CREATE INDEX IF NOT EXISTS "dead_letter_jobs_inspectedAt_idx" ON "dead_letter_jobs"("inspectedAt");

-- ─── user_consents ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "user_consents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,

    CONSTRAINT "user_consents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "user_consents_userId_idx" ON "user_consents"("userId");
CREATE INDEX IF NOT EXISTS "user_consents_type_version_idx" ON "user_consents"("type", "version");

-- ─── invoices ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "invoices" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "plan" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "stripeInvoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "invoices_organizationId_idx" ON "invoices"("organizationId");
CREATE INDEX IF NOT EXISTS "invoices_status_idx" ON "invoices"("status");
CREATE INDEX IF NOT EXISTS "invoices_createdAt_idx" ON "invoices"("createdAt");

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── feature_flags ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "feature_flags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "orgIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "feature_flags_name_key" ON "feature_flags"("name");
CREATE INDEX IF NOT EXISTS "feature_flags_name_idx" ON "feature_flags"("name");
CREATE INDEX IF NOT EXISTS "feature_flags_enabled_idx" ON "feature_flags"("enabled");
