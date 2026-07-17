-- Local creative preparation is deliberately separated from publish approval.
-- Rollback requires restoring the pre-migration database dump because PostgreSQL
-- enum values cannot be removed safely while rows may still reference them.
ALTER TYPE "ProductLaunchStatus"
  ADD VALUE IF NOT EXISTS 'AWAITING_ECONOMICS_REVIEW';
