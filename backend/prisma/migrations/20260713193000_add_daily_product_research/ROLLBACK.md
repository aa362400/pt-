# Rollback

This migration is additive. Disable the daily-product-research feature and stop
the `daily-product-research` worker before rollback.

1. Export `research_report_artifacts`, `product_feedback`, `product_scores`,
   `product_risk_records`, `product_signals`, `product_candidates`, source
   health, stage runs, runs, and scoring versions for audit retention.
2. Remove the nullable compatibility columns `researchRunId` and `candidateId`.
3. Drop the new tables in reverse foreign-key order.
4. Drop the new enum types only after every dependent table has been removed.

Do not run a destructive rollback after a pilot without an approved evidence
retention plan. Normal rollback should use the feature flag and application
version rollback while retaining the additive tables.
