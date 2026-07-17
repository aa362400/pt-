-- Restore the historical database default. Existing run rows are unchanged.
ALTER TABLE "product_research_runs"
  ALTER COLUMN "candidateLimit" SET DEFAULT 300;
