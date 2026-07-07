# Operations Documentation

This directory contains operational documentation for the ShopMate AI platform.

## Contents

| Document | Description |
|----------|-------------|
| [runbook.md](runbook.md) | Incident response procedures, health checks, deployment & rollback steps, on-call rotation, and communication templates |
| [slo-sla.md](slo-sla.md) | Service Level Objectives (internal targets) and Service Level Agreement (customer-facing commitments) |
| [deployment-checklist.md](deployment-checklist.md) | Pre-deployment, deployment, and post-deployment verification steps with rollback triggers |
| [monitoring-guide.md](monitoring-guide.md) | Monitoring configuration, alert rules, dashboard references, and metric explanations |

## Quick Links

- **Health Endpoints:** `GET /health`, `GET /ready`, `GET /metrics`
- **Monitoring:** Prometheus + Grafana
- **Logging:** Structured JSON (production)
- **Backup:** Automated daily via `scripts/db-backup.sh`
