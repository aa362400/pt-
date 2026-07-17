-- One continuous-selection batch targets ten unique normalized candidates.
-- The API still accepts an explicit 1..300 limit for controlled backfills.
ALTER TABLE "product_research_runs"
  ALTER COLUMN "candidateLimit" SET DEFAULT 10;
