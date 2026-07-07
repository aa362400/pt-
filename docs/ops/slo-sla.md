# ShopMate AI SLO / SLA

## Service Level Objectives (Internal)

| Service | Indicator | Target | Measurement |
|---------|-----------|--------|-------------|
| API Server | Availability (HTTP 200/503 ratio) | 99.9% | Prometheus / `/ready` |
| API Server | Response time P95 (non-agent) | < 500ms | Prometheus / `/metrics` |
| Database | Query latency P99 | < 100ms | `pg_stat_statements` |
| Redis | Cache hit rate | > 90% | `redis-cli info` |
| AI Agent | Generation success rate | > 95% | AgentRun status |
| AI Agent | Generation P95 time | < 120s | AgentRun duration |
| File Upload | Success rate | > 99% | S3 metrics |
| Frontend | Page load P95 | < 3s | Lighthouse / RUM |
| Frontend | Lighthouse Performance | > 80 | Lighthouse CI |

## Error Budget (99.9% Availability)
- **Monthly uptime target:** 99.9%
- **Monthly allowed downtime:** 43m 12s
- **Error budget** = total requests × 0.001
- If budget exceeded: freeze new features, focus on reliability

## Service Level Agreement (Customer-Facing)
- **Platform Availability:** 99.9% uptime (monthly)
- **Support Response:** < 4 hours (business hours)
- **Incident Resolution:** < 8 hours (P1), < 24 hours (P2)
- **Data Durability:** 99.9999999% (S3 standard)
- **Data Retention:** Per Privacy Policy
- **Credits:** 5% monthly credit per 0.1% below SLA
