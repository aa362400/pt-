# Index Audit Report — ShopMate AI

## 1. Existing Indexes Assessment

### Methodology
Reviewed all `@@index` declarations in `schema.prisma` (27 models) and cross-referenced with actual query patterns found in every service/controller file under `src/features/`.

### Coverage by Table

| Table | Existing Indexes | Assessment |
|---|---|---|
| `users` | (unique on email) | Adequate for auth lookups. |
| `refresh_tokens` | `userId`, `expiresAt` | Good for token rotation cleanup. |
| `password_reset_tokens` | `userId`, `expiresAt` | Good. |
| `email_verification_tokens` | `userId`, `expiresAt` | Good. |
| `dead_letter_jobs` | `queueName`, `failedAt`, `inspectedAt` | Good for worker queries. |
| `organizations` | `plan`, `slug` | Adequate. |
| `memberships` | `organizationId`, `userId`, `role`, `status` | Good. Covers multi-tenant access checks. |
| `workspaces` | `organizationId`, `channelType`, `status` | Adequate for org-scoped listing. |
| `channel_connections` | `workspaceId`, `provider`, `syncStatus` | Missing composite for status + workspace filtering. |
| `products` | `workspaceId`, `sku`, `asinOrExternalId`, `status`, `createdAt` | **Missing FTS on title**; missing composite for listing queries. |
| `file_assets` | `organizationId`, `workspaceId`, `ownerId`, `purpose` | Adequate. |
| `knowledge_documents` | `organizationId`, `workspaceId`, `createdBy`, `visibility`, `title` | **Missing FTS on title/content**; missing composite for visibility filter. |
| `sops` | `organizationId`, `status`, `createdBy` | Adequate. |
| `team_tasks` | `organizationId`, `workspaceId`, `assigneeId`, `createdBy`, `status`, `priority` | **Missing composite for org+status ordering**. |
| `prompt_templates` | `organizationId`, `category`, `createdBy` | Adequate. |
| `assistant_sessions` | `organizationId`, `workspaceId`, `userId`, `contextType`, `status` | Adequate. |
| `assistant_messages` | `sessionId`, `createdAt` | Adequate for chat history. |
| `agent_runs` | `organizationId`, `workspaceId`, `userId`, `agentType`, `status`, `createdAt` | **Missing composite for org+createdAt** (default sort). |
| `automation_flows` | `organizationId`, `workspaceId`, `status`, `triggerType` | Adequate. |
| `automation_runs` | `flowId`, `status`, `startedAt` | Adequate. |
| `store_metric_snapshots` | `workspaceId`, `date` (unique on workspaceId+date) | Good. |
| `alerts` | `organizationId`, `workspaceId`, `type`, `severity`, `status`, `createdAt` | **Missing composite for org+status**. |
| `trend_insights` | `organizationId`, `workspaceId`, `keyword`, `category`, `observedAt` | **Missing composite for org+observedAt** (common sort). |
| `product_research_reports` | `organizationId`, `workspaceId`, `createdBy`, `status` | Adequate. |
| `keyword_reports` | `organizationId`, `workspaceId`, `createdBy`, `country` | **Missing FTS on `query`** (contains search). |
| `listing_drafts` | `organizationId`, `workspaceId`, `productId`, `createdBy`, `status` | **Missing composite for org+status+createdAt**. |
| `profit_calculations` | `organizationId`, `workspaceId`, `productId`, `createdBy` | Adequate. |
| `image_prompt_projects` | `organizationId`, `workspaceId`, `productId`, `createdBy`, `status` | Adequate. |
| `notifications` | `organizationId`, `userId`, `type`, `readAt`, `createdAt` | **Missing composite for unread-count query**. |
| `audit_logs` | `organizationId`, `actorId`, `action`, `resourceType`, `resourceId`, `createdAt` | **Missing composite for org+createdAt** (high-volume table). |

---

## 2. Recommended Additional Indexes

### 2.1 Full-Text Search Indexes

PostgreSQL `tsvector` GIN indexes dramatically accelerate `LIKE` / `contains` searches on text fields — the app uses `{ contains: query, mode: 'insensitive' }` extensively.

```prisma
// --- products ---
@@index([title], type: Gin)                           // FTS on product title for search

// --- knowledge_documents ---
@@index([title, content], type: Gin)                  // FTS on title+content for knowledge search

// --- listing_drafts ---
@@index([title], type: Gin)                           // FTS on listing title

// --- trend_insights ---
@@index([keyword], type: Gin)                         // FTS on keyword search

// --- keyword_reports ---
@@index([query], type: Gin)                           // FTS on keyword report query
```

**Note:** Prisma does not natively support GIN indexes via `@@index([field], type: Gin)` in all versions. For maximum compatibility, these are best added as raw SQL migrations.

### 2.2 Composite Indexes for Common Query Patterns

These target the exact `WHERE + ORDER BY` combinations seen in service files.

| # | Table | Columns | Rationale | Used In |
|---|---|---|---|---|
| C1 | `products` | `(workspaceId, status, createdAt DESC)` | Product listing with status filter + date sort | `ProductsService.findAll` |
| C2 | `listing_drafts` | `(organizationId, status, createdAt DESC)` | Listing queries with status filter + date sort | `ListingsService.findAll` |
| C3 | `agent_runs` | `(organizationId, createdAt DESC)` | Default agent run history query (most frequent) | `AgentRunsService.findAll`, Dashboard |
| C4 | `agent_runs` | `(organizationId, agentType, createdAt DESC)` | Agent run history filtered by agent type | Future agent-type filter |
| C5 | `audit_logs` | `(organizationId, createdAt DESC)` | Default audit log list + Dashboard recent activity | `AuditLogsService.findAll`, Dashboard |
| C6 | `audit_logs` | `(organizationId, resourceType, createdAt DESC)` | Resource-type filtered audit queries | `AuditLogsService.findAll` |
| C7 | `notifications` | `(organizationId, userId, readAt, createdAt DESC)` | Notification list with read/unread filter + unread count | `NotificationsService.findAll`, `unreadCount`, Dashboard |
| C8 | `team_tasks` | `(organizationId, status, createdAt DESC)` | Task listing filtered by status + date sort | `TasksService.findAll` |
| C9 | `trend_insights` | `(organizationId, observedAt DESC)` | Trend listing sorted by date | `TrendsService.findAll`, Dashboard |
| C10 | `trend_insights` | `(organizationId, keyword, observedAt DESC)` | Trend search by keyword | `TrendsService.findAll` |
| C11 | `knowledge_documents` | `(organizationId, visibility, createdBy, createdAt DESC)` | Knowledge doc listing with visibility access control | `KnowledgeBaseService.findAll` |
| C12 | `alerts` | `(organizationId, status, createdAt DESC)` | Alert list with status filter | Dashboard (`getCounts`), Alert listing |
| C13 | `keyword_reports` | `(organizationId, workspaceId, createdAt DESC)` | Keyword report listing | `KeywordsService.findAll` |
| C14 | `channel_connections` | `(workspaceId, provider, syncStatus)` | Channel list with provider+status filter | `ChannelsService.findAll` |

### 2.3 Partial Indexes for Soft-Delete / Active-Record Patterns

The dashboard and many listing queries filter out archived/deleted records. PostgreSQL partial indexes can make these COUNT queries nearly instant.

```sql
-- Active products (excluding ARCHIVED, DELETED) for dashboard counts
CREATE INDEX idx_products_active
  ON products (workspace_id)
  WHERE status NOT IN ('ARCHIVED', 'DELETED');

-- Open alerts for dashboard counts
CREATE INDEX idx_alerts_open
  ON alerts (organization_id)
  WHERE status = 'OPEN';

-- Unread notifications for per-user unread badge
CREATE INDEX idx_notifications_unread
  ON notifications (organization_id, user_id)
  WHERE read_at IS NULL;

-- Active tasks (TODO, IN_PROGRESS, REVIEW) for dashboard
CREATE INDEX idx_tasks_active
  ON team_tasks (organization_id)
  WHERE status IN ('TODO', 'IN_PROGRESS', 'REVIEW');
```

---

## 3. Migration Plan

### Phase 1 — Add composite indexes (safe, online-safe with CONCURRENTLY)

These are additive changes that do not block reads/writes when created `CONCURRENTLY`. Each can be deployed independently.

| Order | Index | Risk | Rollback |
|---|---|---|---|
| 1 | `idx_agent_runs_org_created` — `agent_runs(organization_id, created_at DESC)` | Low | `DROP INDEX ...` |
| 2 | `idx_audit_logs_org_created` — `audit_logs(organization_id, created_at DESC)` | Low | `DROP INDEX ...` |
| 3 | `idx_notifications_org_user_read` — `notifications(organization_id, user_id, read_at, created_at DESC)` | Low | `DROP INDEX ...` |
| 4 | `idx_products_ws_status_created` — `products(workspace_id, status, created_at DESC)` | Low | `DROP INDEX ...` |
| 5 | `idx_listing_drafts_org_status_created` — `listing_drafts(organization_id, status, created_at DESC)` | Low | `DROP INDEX ...` |
| 6 | `idx_team_tasks_org_status_created` — `team_tasks(organization_id, status, created_at DESC)` | Low | `DROP INDEX ...` |
| 7 | `idx_trend_insights_org_observed` — `trend_insights(organization_id, observed_at DESC)` | Low | `DROP INDEX ...` |
| 8 | `idx_knowledge_docs_org_vis_creator` — `knowledge_documents(organization_id, visibility, created_by, created_at DESC)` | Low | `DROP INDEX ...` |

### Phase 2 — Add partial indexes

| Order | Index | Risk | Rollback |
|---|---|---|---|
| 9 | `idx_products_active` — partial on products | Low | `DROP INDEX ...` |
| 10 | `idx_alerts_open` — partial on alerts | Low | `DROP INDEX ...` |
| 11 | `idx_notifications_unread` — partial on notifications | Low | `DROP INDEX ...` |
| 12 | `idx_tasks_active` — partial on team_tasks | Low | `DROP INDEX ...` |

### Phase 3 — Add full-text search indexes (requires maintenance / trigger)

Full-text search indexes require a generated `tsvector` column or expression index. These are more involved:

1. Create the generated columns or expression indexes
2. Backfill existing data
3. Add triggers to keep vectors in sync (or use generated stored columns)

Because they require careful rollout and testing, these are recommended but can be deferred:

```sql
-- Expression-based GIN indexes (no column changes needed)
CREATE INDEX CONCURRENTLY idx_products_title_fts
  ON products USING GIN (to_tsvector('simple', coalesce(title, '')));

CREATE INDEX CONCURRENTLY idx_knowledge_docs_content_fts
  ON knowledge_documents USING GIN (to_tsvector('simple', coalesce(title, ' ') || ' ' || coalesce(content, '')));
```

### Deployment Steps

1. Run Phase 1 indexes via a Prisma migration (`npx prisma migrate dev --name add_performance_indexes`)
2. Monitor query performance (see `docs/query-performance.md`)
3. Deploy Phase 2 partial indexes
4. Evaluate need for Phase 3 full-text indexes based on search query latency
