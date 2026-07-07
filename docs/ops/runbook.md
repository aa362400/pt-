# ShopMate AI Operations Runbook

## Service Overview
- **Stack:** NestJS 11 + Prisma + PostgreSQL, React + Vite, Python Flask agent
- **Infrastructure:** Docker Compose / K8s
- **Monitoring:** Prometheus + Grafana at `/metrics` endpoint
- **Logging:** Structured JSON (production)

## Health Checks
- `GET /health` — Liveness check
- `GET /ready` — Readiness check (DB, Redis, Storage, Agent)
- `GET /metrics` — Prometheus metrics

## Common Incident Response Procedures

### 1. Database Connectivity Issues
**Symptoms:** `/ready` returns database: down, 503 responses, connection pool exhaustion

**Check:**
1. `docker-compose logs postgres`
2. `pg_isready -h localhost`
3. Check connection count: `SELECT count(*) FROM pg_stat_activity;`

**Mitigation:**
1. Restart PostgreSQL: `docker-compose restart postgres`
2. Increase connection pool in `.env`
3. Scale read replicas if under write load

**Escalation:** Contact DBA / cloud provider support

### 2. Redis Down
**Symptoms:** BullMQ jobs stuck, `/ready` shows redis: down

**Check:**
1. `redis-cli ping`
2. `docker-compose logs redis`

**Mitigation:**
1. `docker-compose restart redis`
2. Jobs will retry with exponential backoff (attempts: 3)
3. If persistent: check memory (`redis-cli info memory`)

**Escalation:** Contact DevOps

### 3. High Error Rate (> 5%)
**Symptoms:** Error rate alert, `/metrics` shows increased 5xx count

**Check:**
1. `docker-compose logs backend | grep ERROR`
2. Check Sentry/error tracking
3. Review recent deployments

**Mitigation:**
1. Rollback to last stable version
2. If new dependency: temporarily disable feature flag
3. Scale up instances if under load

**Escalation:** Engineering lead

### 4. AI Agent Unresponsive
**Symptoms:** Agent generation failures, `/ready` shows agent: down

**Check:**
1. `curl http://agent:8080/health`
2. `docker-compose logs agent`
3. Check API key validity

**Mitigation:**
1. Restart agent: `docker-compose restart product-image-agent`
2. Failover to mock agent (set `AGENT_BASE_URL` empty)
3. If quota exhausted: top up API key

**Escalation:** AI/ML team

### 5. Storage Full / S3 Errors
**Symptoms:** File upload failures, `/ready` shows storage: down

**Check:**
1. Check S3 bucket permissions
2. Verify credentials
3. Check disk space for local storage

**Mitigation:**
1. Switch to alternative storage provider
2. Clean up temp files
3. Increase bucket quota

**Escalation:** Cloud ops

## Backup & Recovery
- Automated daily backup via `scripts/db-backup.sh`
- Recovery: `scripts/db-restore.sh <backup-file>`
- Verify: `scripts/db-refresh.sh` (restores latest backup)
- **RPO:** 24 hours (daily backup)
- **RTO:** < 30 minutes (restore from backup)

## Deployment Procedure
1. Check CI pipeline status (all green)
2. Tag release: `git tag vX.Y.Z`
3. Push tag triggers staging deploy
4. Verify staging health checks
5. Request production approval
6. Deploy to production (rolling update)
7. Monitor metrics for 15 minutes
8. Announce deployment in team channel

## Rollback Procedure
1. `git revert <deploy-commit>` or switch to previous Docker tag
2. Run database rollback if migration was included
3. Deploy previous version
4. Verify health checks
5. Announce rollback

## On-Call Rotation
- **Primary:** [Name], [Phone]
- **Secondary:** [Name], [Phone]
- **Escalation:** [Team Lead / Manager]

## Communication Templates

### Incident Acknowledged
> We are aware of an issue affecting [service]. Our team is investigating. Updates will be provided every 30 minutes.

### Incident Resolved
> The issue affecting [service] has been resolved. [Brief root cause]. We will follow up with a postmortem.

## Postmortem Template

```markdown
# Postmortem: [Title]
- Date: YYYY-MM-DD
- Duration: HH:MM
- Severity: SEV1/SEV2/SEV3
- Summary: ...
- Root Cause: ...
- Impact: ...
- Detection: ...
- Response: ...
- Action Items: ...
```
