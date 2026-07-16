ALTER TYPE "ListingStatus" ADD VALUE IF NOT EXISTS 'APPROVED';

ALTER TABLE "listing_drafts"
ADD COLUMN "contentHash" TEXT;

UPDATE "listing_drafts"
SET "contentHash" = CASE
  WHEN "provenance"->>'outputSha256' ~ '^[a-f0-9]{64}$'
    THEN "provenance"->>'outputSha256'
  ELSE NULL
END;

ALTER TABLE "review_tasks"
ADD COLUMN "approvalScope" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "decisionEvidence" JSONB NOT NULL DEFAULT '{}';
