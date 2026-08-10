-- =============================================================================
-- ShopMate AI — Performance Indexes
-- =============================================================================
-- Composite and partial indexes for the most frequent query patterns.
-- NOTE: runs inside the prisma migrate transaction, so plain CREATE INDEX is
-- used (fine for fresh/small databases). For a large production table, apply
-- the CONCURRENTLY variant manually via scripts/apply-indexes-concurrently.sql.
-- =============================================================================

-- ─── PHASE 1: Composite indexes ──────────────────────────────────────────────

-- 1. Agent run history (org-scoped, ordered by creation date)
CREATE INDEX IF NOT EXISTS "idx_agent_runs_org_created"
  ON "agent_runs" ("organizationId", "createdAt" DESC);

-- 2. Agent run history filtered by agent type
CREATE INDEX IF NOT EXISTS "idx_agent_runs_org_type_created"
  ON "agent_runs" ("organizationId", "agentType", "createdAt" DESC);

-- 3. Audit log queries (org-scoped, ordered by creation date)
CREATE INDEX IF NOT EXISTS "idx_audit_logs_org_created"
  ON "audit_logs" ("organizationId", "createdAt" DESC);

-- 4. Audit log queries filtered by resource type
CREATE INDEX IF NOT EXISTS "idx_audit_logs_org_resource_created"
  ON "audit_logs" ("organizationId", "resourceType", "createdAt" DESC);

-- 5. Product listing with status filter + date sort
CREATE INDEX IF NOT EXISTS "idx_products_ws_status_created"
  ON "products" ("workspaceId", "status", "createdAt" DESC);

-- 6. Listing draft queries with status filter
CREATE INDEX IF NOT EXISTS "idx_listing_drafts_org_status_created"
  ON "listing_drafts" ("organizationId", "status", "createdAt" DESC);

-- 7. Team task listing filtered by status
CREATE INDEX IF NOT EXISTS "idx_team_tasks_org_status_created"
  ON "team_tasks" ("organizationId", "status", "createdAt" DESC);

-- 8. Trend insights sorted by observed date
CREATE INDEX IF NOT EXISTS "idx_trend_insights_org_observed"
  ON "trend_insights" ("organizationId", "observedAt" DESC);

-- 9. Trend insights filtered by keyword
CREATE INDEX IF NOT EXISTS "idx_trend_insights_org_keyword_observed"
  ON "trend_insights" ("organizationId", "keyword", "observedAt" DESC);

-- 10. Knowledge document listing with visibility access control
CREATE INDEX IF NOT EXISTS "idx_knowledge_docs_org_vis_creator"
  ON "knowledge_documents" ("organizationId", "visibility", "createdBy", "createdAt" DESC);

-- 11. Notification list with read/unread filter
CREATE INDEX IF NOT EXISTS "idx_notifications_org_user_read_created"
  ON "notifications" ("organizationId", "userId", "readAt", "createdAt" DESC);

-- 12. Alerts list with status filter
CREATE INDEX IF NOT EXISTS "idx_alerts_org_status_created"
  ON "alerts" ("organizationId", "status", "createdAt" DESC);

-- 13. Keyword report listing (org + workspace scoped)
CREATE INDEX IF NOT EXISTS "idx_keyword_reports_org_ws_created"
  ON "keyword_reports" ("organizationId", "workspaceId", "createdAt" DESC);

-- 14. Channel connections with provider+status filter
CREATE INDEX IF NOT EXISTS "idx_channel_connections_ws_provider_status"
  ON "channel_connections" ("workspaceId", "provider", "syncStatus");

-- ─── PHASE 2: Partial indexes ────────────────────────────────────────────────

-- 15. Active products only (excludes ARCHIVED, DELETED)
CREATE INDEX IF NOT EXISTS "idx_products_active"
  ON "products" ("workspaceId")
  WHERE "status" NOT IN ('ARCHIVED', 'DELETED');

-- 16. Open alerts for dashboard counts
CREATE INDEX IF NOT EXISTS "idx_alerts_open"
  ON "alerts" ("organizationId")
  WHERE "status" = 'OPEN';

-- 17. Unread notifications per user (badge count)
CREATE INDEX IF NOT EXISTS "idx_notifications_unread"
  ON "notifications" ("organizationId", "userId")
  WHERE "readAt" IS NULL;

-- 18. Active tasks (TODO, IN_PROGRESS, REVIEW) for dashboard
CREATE INDEX IF NOT EXISTS "idx_tasks_active"
  ON "team_tasks" ("organizationId")
  WHERE "status" IN ('TODO', 'IN_PROGRESS', 'REVIEW');

-- ─── PHASE 3: Full-text search indexes (expression-based GIN) ────────────────

-- 19. Full-text search on product title
CREATE INDEX IF NOT EXISTS "idx_products_title_fts"
  ON "products" USING GIN (to_tsvector('simple', coalesce("title", '')));

-- 20. Full-text search on listing draft title
CREATE INDEX IF NOT EXISTS "idx_listing_drafts_title_fts"
  ON "listing_drafts" USING GIN (to_tsvector('simple', coalesce("title", '')));

-- 21. Full-text search on knowledge document title+content
CREATE INDEX IF NOT EXISTS "idx_knowledge_docs_content_fts"
  ON "knowledge_documents" USING GIN (
    to_tsvector('simple', coalesce("title", ' ') || ' ' || coalesce("content", ''))
  );

-- 22. Full-text search on trend insight keyword
CREATE INDEX IF NOT EXISTS "idx_trend_insights_keyword_fts"
  ON "trend_insights" USING GIN (to_tsvector('simple', coalesce("keyword", '')));

-- 23. Full-text search on keyword report query field
CREATE INDEX IF NOT EXISTS "idx_keyword_reports_query_fts"
  ON "keyword_reports" USING GIN (to_tsvector('simple', coalesce("query", '')));
