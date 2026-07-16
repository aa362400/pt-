# Go-Live Checklist — ShopMate AI Platform

## Pre-Flight (24 hours before)
- [ ] All CI pipelines green for last 24 hours
- [ ] Contract tests passing (27 tests)
- [ ] No high-severity vulnerabilities from pnpm audit
- [ ] Database backup verified (recent restore drill passed)
- [ ] Prometheus metrics / /metrics endpoint accessible
- [ ] Grafana dashboards showing real data
- [ ] Error budget has > 50% remaining for the month
- [ ] Fault injection drill passed (all 4 scenarios)

## Launch
- [ ] Feature flags enabled for pilot orgs
- [ ] Staging deploy verified
- [ ] Production deploy executed (rolling update)
- [ ] Health checks passing (/health, /ready)
- [ ] Core flow tested: login → create product → generate listing
- [ ] Core flow tested: upload image → generate product images
- [ ] Core flow tested: create agent run → see results

## Post-Launch (monitoring period)
- [ ] Error rate < 1% for 1 hour
- [ ] P95 latency < 500ms for non-agent endpoints
- [ ] Agent success rate > 95%
- [ ] No 5xx spikes
- [ ] All team members aware of on-call rotation

## Rollback Criteria
If any of these occur within the first 24 hours:
- [ ] Error rate > 5% for 5 consecutive minutes
- [ ] P95 latency > 2s for 10 minutes
- [ ] Agent success rate < 80% for 15 minutes
- [ ] Complete outage > 5 minutes
→ **Initiate rollback immediately**
