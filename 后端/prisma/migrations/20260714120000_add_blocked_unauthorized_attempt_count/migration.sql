ALTER TABLE "enterprise_slo_daily_snapshots"
ADD COLUMN IF NOT EXISTS "blockedUnauthorizedAttemptCount" INTEGER NOT NULL DEFAULT 0;
