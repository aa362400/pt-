CREATE TABLE "audit_archives" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "objectKey" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "entryCount" INTEGER NOT NULL,
    "firstSequence" BIGINT NOT NULL,
    "lastSequence" BIGINT NOT NULL,
    "firstPreviousHash" TEXT NOT NULL,
    "finalHash" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "objectLockMode" TEXT NOT NULL,
    "retainUntil" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_archives_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "audit_archives_objectKey_key" ON "audit_archives"("objectKey");
CREATE UNIQUE INDEX "audit_archives_organizationId_date_key" ON "audit_archives"("organizationId", "date");
CREATE INDEX "audit_archives_organizationId_idx" ON "audit_archives"("organizationId");
CREATE INDEX "audit_archives_date_idx" ON "audit_archives"("date");
CREATE INDEX "audit_archives_retainUntil_idx" ON "audit_archives"("retainUntil");

ALTER TABLE "audit_archives"
ADD CONSTRAINT "audit_archives_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
