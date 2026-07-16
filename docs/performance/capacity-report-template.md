# Capacity Test Report — ShopMate AI

> **Template** — Replace placeholders (italicised) with actual values.

## 1. Test Environment

| Component | Spec |
|-----------|------|
| **Backend (NestJS)** | _e.g. 4 vCPU, 8 GB RAM, Node 20_ |
| **Python Agent** | _e.g. 4 vCPU, 16 GB RAM, Python 3.11_ |
| **PostgreSQL** | _e.g. db.r6g.large, 2 vCPU, 16 GB RAM_ |
| **Redis** | _e.g. cache.r6g.large, 2 vCPU, 13 GB RAM_ |
| **Network** | _e.g. 10 Gbps internal_ |
| **Nginx** | _e.g. 2 vCPU, 4 GB RAM_ |
| **Locust / k6 host** | _e.g. 8 vCPU, 32 GB RAM (same AZ)_ |

## 2. Test Scenarios

| Scenario | Tool | Duration | Peak VUs | Description |
|----------|------|----------|----------|-------------|
| Smoke Test | k6 | 30 s | 5 | Validate endpoints respond correctly under minimal load |
| Auth Scenario | k6 | 40 s | 10 | Register / login / profile / token refresh |
| API Scenario | k6 | 2 min | 20 | Mixed authenticated CRUD operations |
| Staging Simulation | k6 | 10 min | 20 | Realistic traffic mix: health 30%, products 20%, agent runs 30%, profile 10%, dashboard 10% |
| Agent Load Test | Locust | 60 s | 5 | Health, text task create+poll, image task create+poll |
| Agent Soak Test | Locust | _30 min_ | _10_ | Sustained agent task workload |
| Spike Test | k6 / Locust | _1 min_ | _50 → 5_ | Sudden burst, observe recovery |

## 3. Key Metrics

| Metric | Smoke | Auth | API | Staging | Agent Load | Agent Soak | Spike |
|--------|-------|------|-----|---------|------------|------------|-------|
| **Peak QPS** | _—_ | _— /s_ | _— /s_ | _— /s_ | _— /s_ | _— /s_ | _— /s_ |
| **P95 Latency** | _— ms_ | _— ms_ | _— ms_ | _— ms_ | _— ms_ | _— ms_ | _— ms_ |
| **P99 Latency** | _— ms_ | _— ms_ | _— ms_ | _— ms_ | _— ms_ | _— ms_ | _— ms_ |
| **Error Rate** | _— %_ | _— %_ | _— %_ | _— %_ | _— %_ | _— %_ | _— %_ |
| **Concurrent Capacity** | _—_ | _—_ | _—_ | _—_ | _—_ | _—_ | _—_ |

### Thresholds

| Threshold | Target | Met? |
|-----------|--------|------|
| P95 latency < 2000 ms | 2000 ms | _Yes / No_ |
| P95 latency < 500 ms (smoke) | 500 ms | _Yes / No_ |
| Error rate < 5% | 5% | _Yes / No_ |
| Error rate < 2% (API) | 2% | _Yes / No_ |
| Error rate < 1% (smoke) | 1% | _Yes / No_ |

## 4. Bottleneck Analysis

| Layer | Bottleneck | Evidence | Recommendation |
|-------|------------|----------|---------------|
| Nginx | _Rate limiting / connection pool_ | _e.g. 429 spikes at 50 req/s_ | Tune `limit_req` zone sizes |
| Backend (NestJS) | _CPU / DB pool / I/O_ | _e.g. P95 rises at 20 concurrent_ | Add instance or tune pool |
| Python Agent | _Image generation queue_ | _e.g. task queue backs up_ | Increase `job_queue` thread pool |
| PostgreSQL | _Connection pool / query slowness_ | _e.g. slow sequential scan_ | Add index or read replica |
| Redis | _Memory / throughput_ | _e.g. eviction rate > 0_ | Increase memory or cluster |

## 5. Scaling Formula

```
N concurrent users ≈ (N × avg_req_time_ms) / 1000 / instance_threads
```

**Example:**

- Target: 100 concurrent users
- Average request time: 150 ms (across all endpoints)
- Instance threads (NestJS UV_THREADPOOL_SIZE): 4

```
100 concurrent ≈ (100 × 150) / 1000 / 4 = 3.75 instances
```

Round up: **4 backend instances** to serve 100 concurrent users at P95 < 2 s.

For the **Python Agent**:
- Target: 20 concurrent agent tasks
- Average task duration: 45 s
- Agent thread pool: 8

```
20 concurrent ≈ (20 × 45000) / 1000 / 8 = 112.5 → unrealistic standalone
```

Agent tasks are long-running; concurrency is bound by **queue depth + thread pool size**.
Practical model: `max_concurrent_tasks = thread_pool_size × instances`.
Thus 2 agent instances × 8 threads = **16 concurrent image tasks**.

## 6. Production Sizing Recommendation

| Tier | Backend Instances | Agent Instances | DB Instance | Redis | Estimated Capacity |
|------|-------------------|-----------------|-------------|-------|--------------------|
| **Minimum** | 2 | 1 | db.r6g.large | cache.r6g.large | ~50 concurrent users, ~8 agent tasks |
| **Standard** | 4 | 2 | db.r6g.xlarge | cache.r6g.xlarge | ~100 concurrent users, ~16 agent tasks |
| **High** | 8 | 4 | db.r6g.2xlarge | cache.r6g.2xlarge | ~200 concurrent users, ~32 agent tasks |

## 7. Observations & Action Items

| # | Observation | Severity | Action |
|---|-------------|----------|--------|
| 1 | _— fill from test run_ | _High/Med/Low_ | _— corresponding fix_ |
| 2 | _— fill from test run_ | _High/Med/Low_ | _— corresponding fix_ |
| 3 | _— fill from test run_ | _High/Med/Low_ | _— corresponding fix_ |

---

*Generated: {{DATE}} by {{TOOL}} (e.g. k6 v0.52 / Locust 2.31)*
