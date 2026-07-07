# Database Query Performance Guide — ShopMate AI

A practical reference for identifying, diagnosing, and fixing slow database queries in the ShopMate AI backend.

---

## 1. Identifying Slow Queries

### 1.1 Prisma Query Logging

Enable query logging in development by configuring the Prisma client in `src/shared/database/prisma.service.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

export class PrismaService extends PrismaClient {
  constructor() {
    super({
      log: [
        { emit: 'stdout', level: 'query' },    // Log all SQL queries
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });
  }
}
```

For production, use a more selective approach — log only slow queries:

```typescript
const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
  ],
});

prisma.$on('query', (e: { query: string; params: string; duration: number }) => {
  if (e.duration > 100) { // Log queries slower than 100ms
    console.warn(`SLOW QUERY (${e.duration}ms): ${e.query}`);
  }
});
```

### 1.2 PostgreSQL `pg_stat_statements`

The most powerful tool for finding slow queries in production is the `pg_stat_statements` extension.

**Enable the extension:**

```sql
-- Run once as superuser
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

Add to `postgresql.conf`:
```
shared_preload_libraries = 'pg_stat_statements'
pg_stat_statements.track = all
pg_stat_statements.max = 10000
```

**Query for top slow queries:**

```sql
SELECT
  queryid,
  LEFT(query, 120) AS query_preview,
  calls,
  ROUND(total_exec_time / 1000, 2) AS total_seconds,
  ROUND(mean_exec_time, 2) AS avg_ms,
  ROUND(max_exec_time, 2) AS max_ms,
  ROUND(100.0 * shared_blks_hit / NULLIF(shared_blks_hit + shared_blks_read, 0), 2) AS hit_ratio
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat%'
ORDER BY total_exec_time DESC
LIMIT 20;
```

**Key metrics:**

| Metric | What it tells you |
|---|---|
| `calls` | Frequency — high-call, low-time queries may still be worth optimizing |
| `mean_exec_time` | Average latency — target < 10ms for simple lookups, < 100ms for lists |
| `max_exec_time` | Worst-case latency — outliers may indicate index misses |
| `hit_ratio` | Buffer cache effectiveness — below 99% suggests missing indexes |

**Reset statistics (after deploying indexes to measure improvement):**

```sql
SELECT pg_stat_statements_reset();
```

### 1.3 PostgreSQL `EXPLAIN ANALYZE`

For individual slow queries captured from Prisma logs:

```sql
EXPLAIN ANALYZE
SELECT * FROM "products"
WHERE "workspace_id" = 'abc123'
  AND "status" = 'ACTIVE'
ORDER BY "created_at" DESC
LIMIT 20;
```

Look for:
- **Seq Scan on large tables** — missing index
- **Sort (using filesort)** — missing index on ORDER BY column
- **Bitmap Heap Scan** with high `rows removed by filter` — composite index needed

---

## 2. Index Strategy for Multi-Tenant SaaS

### 2.1 Org-First Indexing Principle

All queries in ShopMate AI are scoped to an organization. Every multi-tenant index **must** start with `organization_id` (or `workspace_id` which implies org scope via the workspace relationship).

**Good composite index:**
```sql
CREATE INDEX idx_agent_runs_org_created
  ON agent_runs (organization_id, created_at DESC);
```

**Less useful (PostgreSQL may still use it, but less efficiently):**
```sql
CREATE INDEX idx_agent_runs_created
  ON agent_runs (created_at DESC);
```

### 2.2 Workspace Scoping

Some queries filter by `workspace_id`. Since workspace already implies an org, these indexes should start with `workspace_id`:

```sql
CREATE INDEX idx_products_ws_status_created
  ON products (workspace_id, status, created_at DESC);
```

### 2.3 Common Index Patterns in This Project

| Pattern | Index Structure | Example Tables |
|---|---|---|
| Org-scoped list + date sort | `(org_id, created_at DESC)` | `audit_logs`, `agent_runs` |
| Org-scoped + status filter | `(org_id, status, created_at DESC)` | `listing_drafts`, `alerts` |
| Org-scoped + user filter | `(org_id, user_id, read_at)` | `notifications` |
| Org-scoped + visibility + creator | `(org_id, visibility, created_by)` | `knowledge_documents` |

### 2.4 Index Maintenance

- **Monitor index bloat:** `pgstattuple` extension or `pg_stat_user_indexes`
- **Rebuild bloated indexes:** `REINDEX INDEX CONCURRENTLY idx_name;`
- **Drop unused indexes:** Query `pg_stat_user_indexes` for `idx_scan = 0` after a full business cycle
- **Vacuum frequently:** Ensure `autovacuum` is running with aggressive settings for high-traffic tables like `audit_logs` and `agent_runs`

---

## 3. N+1 Query Prevention with Prisma

### 3.1 What is N+1?

The N+1 problem occurs when code issues 1 query to fetch parent records, then N additional queries for each child. This is the #1 performance killer in ORM-backed APIs.

### 3.2 Prisma's Eager Loading

**Bad — N+1:**
```typescript
// ❌ Fires 1 query for listings + N queries for each product
const drafts = await prisma.listingDraft.findMany();
for (const draft of drafts) {
  const product = await prisma.product.findUnique({
    where: { id: draft.productId },
  });
}
```

**Good — eager loading with `include`:**
```typescript
// ✅ Fires 1 query with a JOIN
const drafts = await prisma.listingDraft.findMany({
  include: {
    product: { select: { id: true, title: true } },
    creator: { select: { id: true, name: true } },
  },
});
```

**Best — only select needed fields with `select`:**
```typescript
// ✅ Minimal data transfer, prevents over-fetching
const drafts = await prisma.listingDraft.findMany({
  select: {
    id: true,
    title: true,
    status: true,
    product: { select: { id: true, title: true } },
  },
});
```

### 3.3 Batch Loading Pattern

When you need to load relations for items after they've been fetched separately:

```typescript
async function getProductsWithProfits(orgId: string) {
  // 1. Fetch products
  const products = await prisma.product.findMany({
    where: { workspace: { organizationId: orgId } },
  });

  // 2. Batch-load profits for all products in a single query
  const productIds = products.map((p) => p.id);
  const profits = await prisma.profitCalculation.findMany({
    where: { productId: { in: productIds } },
  });

  // 3. Map in memory
  const profitMap = new Map(profits.map((p) => [p.productId, p]));
  return products.map((product) => ({
    ...product,
    profit: profitMap.get(product.id) ?? null,
  }));
}
```

### 3.4 Using Prisma `include` and `select` Efficiently

| Scenario | Recommended Approach |
|---|---|
| List endpoint | `select` with nested `select` — only return what the API contract requires |
| Detail endpoint | `include` with nested `select` — include relations but limit their fields |
| Dashboard/counts | Use `count` with `where` — never load full rows just to count them |
| Write operations | Omit relations entirely — only the foreign key IDs are needed |

---

## 4. Pagination Best Practices

### 4.1 Offset-Based Pagination (Current)

The project uses offset-based pagination (`skip` / `take`) everywhere:

```typescript
const items = await prisma.product.findMany({
  where: { workspace: { organizationId: orgId } },
  orderBy: { createdAt: 'desc' },
  skip: (page - 1) * limit,
  take: limit,
});
```

**Pros:** Simple, supports arbitrary page jumps, REST-friendly.  
**Cons:** Slow on deep pages (large `OFFSET`), inconsistent if rows are inserted/deleted between pages.

### 4.2 Cursor-Based Pagination (Recommended for High-Volume Tables)

For tables with frequent writes (`audit_logs`, `agent_runs`, `notifications`), cursor pagination is more stable and performant:

```typescript
async function findAll(user: JwtPayload, cursor?: string, limit = 20) {
  const orgId = requireOrg(user);

  const items = await prisma.auditLog.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,                    // Fetch one extra to detect next page
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), // Skip the cursor row itself
  });

  const hasNext = items.length > limit;
  const nodes = hasNext ? items.slice(0, limit) : items;
  const nextCursor = hasNext ? nodes[nodes.length - 1].id : null;

  return { items: nodes, nextCursor, hasNext };
}
```

**Pros:** Stable across page flips, fast on any depth, works well with real-time data.  
**Cons:** No random page access, slightly more complex.

### 4.3 When to Use Which

| Table | Volume | Recommended |
|---|---|---|
| `products` | Low-Medium | Offset (current) — simple, users expect page numbers |
| `listing_drafts` | Low | Offset — page jumps useful for reviewing drafts |
| `audit_logs` | **High** | **Cursor** — deep pages would be slow, no need for page jumps |
| `agent_runs` | **High** | **Cursor** — constant writes, deep page issue |
| `notifications` | Medium | Cursor — stable across read/unread state changes |
| `trend_insights` | Medium | Cursor — time-series data fits cursor pattern naturally |

### 4.4 Pagination Performance Rules

1. **Always index the ORDER BY column** — `created_at DESC` should be in a composite index
2. **Count queries are expensive** — for cursor pagination, avoid `count()` on large tables
3. **Limit maximum page size** — enforce `@Max(100)` as already done in `PageQueryDto`
4. **Return total only when needed** — the frontend may not need `total` for infinite scroll

---

## 5. Connection Pooling Recommendations

### 5.1 Why Pooling Matters

Each Prisma query acquires a connection from the pool. If the pool is exhausted, queries queue up and latency spikes. Node.js's single-threaded event loop amplifies this — slow queries hold connections longer, starving faster queries.

### 5.2 Recommended Pool Configuration

Set via `DATABASE_URL` query parameters:

```
DATABASE_URL=postgresql://user:pass@host:5432/shopmate?schema=public&connection_limit=20&pool_timeout=10&pgbouncer=true
```

| Parameter | Recommended | Rationale |
|---|---|---|
| `connection_limit` | `20` | Matches typical Node.js concurrency. Too high = connection storms on PG. |
| `pool_timeout` | `10` (seconds) | Fail fast rather than queuing indefinitely. |
| `pgbouncer` | `true` | Enables transactional mode for PgBouncer compatibility. |

### 5.3 Using PgBouncer (Production)

In production, place PgBouncer between Prisma and PostgreSQL:

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  Node.js  │────▶│ PgBouncer │────▶│PostgreSQL│
│ (Prisma)  │     │ (pool: 20)│     │ (max: 100)│
└──────────┘     └──────────┘     └──────────┘
```

**PgBouncer config (`pgbouncer.ini`):**
```ini
[databases]
shopmate = host=localhost port=5432 dbname=shopmate

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = scram-sha-256
pool_mode = transaction
default_pool_size = 20
max_client_conn = 100
```

**Connection pooling rules of thumb:**
- **Set pool size to ~2× CPU cores** — Prisma already queues queries internally
- **Monitor `pool_timeout` errors** in production logs — they indicate pool starvation
- **Increase pool size before increasing DB connections**
- **Use separate pools for workers** — agent-run workers and web processes should have isolated pools to avoid interference

### 5.4 Prisma Pool Tuning for Workers

Agent-run and automation workers perform longer-running queries. They should use a smaller pool to avoid starving the web process:

```typescript
// In workers.module.ts or worker entry point
const workerPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL + '&connection_limit=5&pool_timeout=30',
    },
  },
});
```

---

## 6. Quick Reference: Performance Checklist

### Daily / On-Call
- [ ] Check `pg_stat_statements` for new slow queries
- [ ] Review Prisma query logs for N+1 patterns
- [ ] Monitor connection pool usage (`pool_timeout` errors)

### Per Deploy
- [ ] Run k6 smoke tests against staging
- [ ] Compare P95 latency before/after schema changes
- [ ] Verify new indexes are being used (`EXPLAIN ANALYZE`)

### Per Release
- [ ] Review new Prisma queries for missing `select` / `include`
- [ ] Check for sequential scans on large tables
- [ ] Update `index-audit.md` with new index recommendations
- [ ] Schedule REINDEX for heavily updated tables

### Troubleshooting Flow

```
Slow API endpoint?
    │
    ├── Check Prisma query log → identify the slow SQL
    │
    ├── Run EXPLAIN ANALYZE on the SQL
    │
    ├── Seq scan or high rows removed by filter?
    │   │
    │   └── Yes → Add or adjust index (org-first!)
    │
    ├── Multiple queries for a single request?
    │   │
    │   └── Yes → N+1 → use `include` or batch loading
    │
    ├── High `pool_timeout`?
    │   │
    │   └── Yes → Increase pool or optimize slow queries
    │
    └── All checks pass?
        │
        └── Profile application code (metrics interceptor)
```
