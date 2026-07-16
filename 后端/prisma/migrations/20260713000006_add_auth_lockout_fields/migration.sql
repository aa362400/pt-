ALTER TABLE "users"
ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lockedUntil" TIMESTAMP(3),
ADD COLUMN "lastFailedLoginAt" TIMESTAMP(3);

CREATE INDEX "users_lockedUntil_idx" ON "users"("lockedUntil");
