ALTER TABLE "dead_letter_jobs"
ADD COLUMN "organizationId" TEXT;

CREATE INDEX "dead_letter_jobs_organizationId_idx"
ON "dead_letter_jobs"("organizationId");
