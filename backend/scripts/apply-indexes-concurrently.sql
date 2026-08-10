-- =============================================================================
-- Ops script: apply performance indexes CONCURRENTLY (zero-downtime)
-- =============================================================================
-- Use this INSTEAD of migration 20260707000001 on a large, live production
-- database (the migration itself uses plain CREATE INDEX which locks writes).
-- Run outside a transaction, e.g.:
--   psql "$DATABASE_URL" -f scripts/apply-indexes-concurrently.sql
-- Each statement is idempotent (IF NOT EXISTS).
-- =============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_agent_runs_org_created"
  ON "agent_runs" ("organizationId", "createdAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_agent_runs_org_type_created"
  ON "agent_runs" ("organizationId", "agentType", "createdAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_audit_logs_org_created"
  ON "audit_logs" ("organizationId", "createdAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_audit_logs_org_resource_created"
  ON "audit_logs" ("organizationId", "resourceType", "createdAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_products_ws_status_created"
  ON "products" ("workspaceId", "status", "createdAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_listing_drafts_org_status_created"
  ON "listing_drafts" ("organizationId", "status", "createdAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_team_tasks_org_status_created"
  ON "team_tasks" ("organizationId", "status", "createdAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_trend_insights_org_observed"
  ON "trend_insights" ("organizationId", "observedAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_trend_insights_org_keyword_observed"
  ON "trend_insights" ("organizationId", "keyword", "observedAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_knowledge_docs_org_vis_creator"
  ON "knowledge_documents" ("organizationId", "visibility", "createdBy", "createdAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_notifications_org_user_read_created"
  ON "notifications" ("organizationId", "userId", "readAt", "createdAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_alerts_org_status_created"
  ON "alerts" ("organizationId", "status", "createdAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_keyword_reports_org_ws_created"
  ON "keyword_reports" ("organizationId", "workspaceId", "createdAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_channel_connections_ws_provider_status"
  ON "channel_connections" ("workspaceId", "provider", "syncStatus");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_products_active"
  ON "products" ("workspaceId") WHERE "status" NOT IN ('ARCHIVED', 'DELETED');
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_alerts_open"
  ON "alerts" ("organizationId") WHERE "status" = 'OPEN';
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_notifications_unread"
  ON "notifications" ("organizationId", "userId") WHERE "readAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_tasks_active"
  ON "team_tasks" ("organizationId") WHERE "status" IN ('TODO', 'IN_PROGRESS', 'REVIEW');
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_products_title_fts"
  ON "products" USING GIN (to_tsvector('simple', coalesce("title", '')));
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_listing_drafts_title_fts"
  ON "listing_drafts" USING GIN (to_tsvector('simple', coalesce("title", '')));
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_knowledge_docs_content_fts"
  ON "knowledge_documents" USING GIN (
    to_tsvector('simple', coalesce("title", ' ') || ' ' || coalesce("content", ''))
  );
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_trend_insights_keyword_fts"
  ON "trend_insights" USING GIN (to_tsvector('simple', coalesce("keyword", '')));
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_keyword_reports_query_fts"
  ON "keyword_reports" USING GIN (to_tsvector('simple', coalesce("query", '')));
