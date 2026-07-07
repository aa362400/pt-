# Production Deployment Checklist

## Pre-Deployment
- [ ] All CI checks pass (lint, build, test, security scan)
- [ ] PR approved by at least 1 reviewer
- [ ] Database migration generated and reviewed
- [ ] Changelog updated
- [ ] Version tag created
- [ ] Backup taken (current production DB)
- [ ] Feature flags verified (new features behind flags)

## Deployment
- [ ] Deploy to staging
- [ ] Run e2e tests on staging
- [ ] Verify health checks (`/health`, `/ready`)
- [ ] Check metrics dashboard for anomalies
- [ ] Deploy to production (rolling update)
- [ ] Monitor error rate for 15 minutes
- [ ] Verify core business flow works

## Post-Deployment
- [ ] Announce deployment in team channel
- [ ] Update deployment log
- [ ] Check error tracking for new issues
- [ ] If migration: verify data integrity
- [ ] Update runbook if new procedures added

## Rollback Triggers
- [ ] Error rate increase > 5%
- [ ] P95 latency increase > 50%
- [ ] Agent success rate drop > 10%
- [ ] Any P0 feature broken
