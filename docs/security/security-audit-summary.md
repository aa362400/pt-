# Security Audit Summary — ShopMate AI

**Date:** 2026-07-07
**Scope:** Backend NestJS API (`G:\平台\后端\src`), Infrastructure, CI/CD
**Methodology:** OWASP Top 10 (2021) self-assessment, code review, configuration audit

---

## Executive Summary

ShopMate AI has a **solid security foundation** with well-implemented authentication (JWT + Argon2), authorization (RBAC + tenant isolation), and input validation (class-validator + Prisma ORM). The audit identified **7 high-priority** and **12 medium-priority** remediation items. The most critical gaps are:

1. **No account lockout on failed login** — Attackers can brute-force passwords within IP rate limits.
2. **2FA not fully implemented** — Schema exists but no enable/verify endpoints.
3. **No secrets management** — Environment variables are the sole mechanism for secrets.
4. **No dependency vulnerability scanning in CI** — `pnpm audit` is not automated.
5. **Limited auth event monitoring** — Login failures are not logged to the audit trail.

---

## Posture Summary

| Area | Score | Notes |
|------|-------|-------|
| **Authentication** | 🟢 85% | JWT + Argon2 + email verification; missing 2FA and account lockout |
| **Authorization** | 🟢 90% | RBAC + Org isolation; a few endpoints missing role guards |
| **Data Protection** | 🟡 70% | Encryption at rest partial; no KMS; channel tokens need encryption service |
| **Network Security** | 🟡 65% | HTTPS via nginx with HSTS; limited egress controls |
| **Dependency Management** | 🟡 50% | No automated vulnerability scanning in CI; no Dependabot |
| **Secrets Management** | 🟡 50% | No KMS/Vault; dev fallbacks only blocked in production |
| **Logging & Monitoring** | 🟡 65% | Audit logs + Prometheus; no centralized log aggregation; auth events not logged |
| **Input Validation** | 🟢 95% | Zod env validation + class-validator + Prisma ORM |
| **Rate Limiting** | 🟢 90% | Global + per-endpoint throttling; could add per-user login limits |
| **Incident Response** | 🔴 20% | No documented IR plan; no security.txt before now |

---

## Key Security Features

### Authentication & Authorization
- **JWT with Passport** — `src/shared/auth/jwt.strategy.ts`, `jwt-auth.guard.ts`
- **Argon2 password hashing** — `src/features/auth/auth.service.ts` line 50
- **RBAC** — `src/shared/rbac/roles.guard.ts` with `OWNER`/`ADMIN`/`MEMBER`/`VIEWER`
- **Tenant isolation** — `src/shared/tenancy/org-scope.ts` (`requireOrg`, `requireOrgRole`, `assertWorkspaceInOrg`)
- **Rate limiting** — `src/app.module.ts` (global 100/min), auth controller (5–20/min per endpoint)
- **Email verification** — `src/features/auth/auth.service.ts` (`sendVerificationEmail`, `verifyEmail`)
- **Refresh token rotation** — `auth.service.ts` `refresh()` deletes old token before creating new one
- **Logout revokes all sessions** — `auth.service.ts` `logout()` deletes all user refresh tokens

### Data Protection
- **Argon2 password hashing** — GPU/ASIC resistant
- **SHA-256 token hashing** — Refresh tokens, password reset tokens, email verification tokens stored as hashes
- **Separate JWT secrets** — `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`
- **Environment validation** — `src/shared/config/env.ts` rejects dev defaults in production

### Input Validation
- **Zod schema** — `src/shared/config/env.ts` validates all environment variables
- **class-validator** — All DTOs use `@IsEmail()`, `@MinLength(8)`, etc.
- **Whitelist validation** — `main.ts` `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`
- **Path traversal protection** — `src/shared/storage/storage.service.ts` `resolveKey()`

### Logging & Monitoring
- **Audit log service** — `src/shared/audit/audit.service.ts` with immutability via Prisma
- **Request ID tracing** — `src/shared/middleware/request-id.middleware.ts`
- **Prometheus metrics** — `src/shared/metrics/metrics.interceptor.ts`
- **Structured error responses** — `src/shared/errors/filters.ts` with requestId

### Infrastructure
- **Helmet.js** — `src/main.ts` line 26
- **Nginx security headers** — `nginx/security-headers.conf` (CSP, HSTS, X-Frame-Options, etc.)
- **CORS whitelist** — Full wildcard blocked in production via Zod superRefine
- **Swagger disabled in production** — `main.ts` line 66
- **GDPR data deletion** — `src/shared/housekeeping/housekeeping.service.ts` `deleteUserData()`
- **Data retention cleanup** — `housekeeping.service.ts` `runCleanup()` (daily cron)

---

## High-Priority Remediation Items

| # | Finding | Category | Recommendation | Effort |
|---|---------|----------|----------------|--------|
| 1 | **No account lockout on failed login** | A07 | Implement per-user lockout after N failed attempts within window | Medium |
| 2 | **2FA not implemented** | A07 | Build 2FA enable/verify/disable endpoints | Medium |
| 3 | **No KMS/Vault for secrets** | A02 | Integrate with AWS Secrets Manager or HashiCorp Vault | Large |
| 4 | **No `ENCRYPTION_KEY` enforcement** | A02 | Make `ENCRYPTION_KEY` required in production via Zod | Small |
| 5 | **No dependency scanning in CI** | A06 | Add `pnpm audit` to CI (included in this audit) | Small |
| 6 | **No Dependabot/Renovate** | A06 | Configure automated dependency update PRs | Small |
| 7 | **Auth events not audited** | A09 | Log login, logout, failed attempts to audit service | Medium |

## Medium-Priority Remediation Items

| # | Finding | Category | Recommendation | Effort |
|---|---------|----------|----------------|--------|
| 8 | **No membership status check on requests** | A01 | Add middleware to verify `membership.status === 'ACTIVE'` | Medium |
| 9 | **Missing `@Roles()` guards on some endpoints** | A01 | Audit and add role guards (e.g., product creation) | Small |
| 10 | **Channel tokens not encrypted in code** | A02 | Implement encryption service for `accessTokenEncrypted` fields | Medium |
| 11 | **No CSRF protection** | A01 | Add CSRF if cookie-based auth is ever used | Small |
| 12 | **No centralized log aggregation** | A09 | Set up Grafana Loki or ELK stack | Medium |
| 13 | **No security alerting** | A09 | Create alerting rules for brute force, suspicious access | Medium |
| 14 | **No password complexity rules** | A07 | Add uppercase, number, special char requirements | Small |
| 15 | **No breached password check** | A07 | Integrate with Have I Been Pwned API | Medium |
| 16 | **Email-based forgot-password rate limiting** | A04 | Add per-email throttle to forgot password | Small |
| 17 | **No security header tests** | A05 | Add automated security header checks in CI | Small |
| 18 | **No SSRF review of agent providers** | A10 | Review user-influenced URLs in agent integrations | Medium |
| 19 | **VIEWER can create products** | A01 | Add `@Roles('OWNER', 'ADMIN', 'MEMBER')` to product creation | Small |

---

## Remediation Roadmap

### Phase 1 — Quick Wins (1–2 weeks)
- [x] Create `security.txt` for vulnerability reporting
- [x] Create security headers middleware in NestJS
- [x] Add SAST/DAST workflow to CI
- [x] Add stricter rate limiting on auth endpoints
- [x] Run automated SAST & dependency audit in CI
- [ ] Make `ENCRYPTION_KEY` required in production
- [ ] Add email-based rate limiting to forgot-password
- [ ] Add password complexity requirements
- [ ] Add `@Roles()` guards to unprotected endpoints

### Phase 2 — Core Security (2–4 weeks)
- [ ] Implement account lockout after N failed login attempts
- [ ] Implement 2FA enable/verify/disable endpoints
- [ ] Add membership status check on every authenticated request
- [ ] Add audit logging for auth events (login, logout, failures)
- [ ] Configure Dependabot for automated dependency updates
- [ ] Add automated security header and injection tests

### Phase 3 — Hardening (4–8 weeks)
- [ ] Integrate with secrets manager (AWS Secrets Manager / Vault)
- [ ] Implement column-level encryption for channel connection tokens
- [ ] Set up centralized log aggregation (Grafana Loki)
- [ ] Create security alerting rules
- [ ] Document security incident response plan
- [ ] Complete breached password check integration

### Phase 4 — Advanced (8+ weeks)
- [ ] Set up network egress filtering / segmentation
- [ ] Implement session management UI for users
- [ ] Run external penetration test
- [ ] Achieve SOC 2 / ISO 27001 compliance readiness
- [ ] Bug bounty program

---

## Directory Reference

| Security Artifact | Location |
|------------------|----------|
| OWASP Top 10 Checklist | `docs/security/owasp-top10-checklist.md` |
| Security Audit Summary | `docs/security/security-audit-summary.md` |
| Security.txt | `public/.well-known/security.txt` |
| SAST/DAST CI Workflow | `.github/workflows/security-scans.yml` |
| Security Headers Middleware | `backend/src/shared/middleware/security-headers.middleware.ts` |
| Rate Limiting Config | `backend/src/app.module.ts` + `auth.controller.ts` |
| Nginx Security Headers | `nginx/security-headers.conf` |
| Auth Guard (JWT) | `backend/src/shared/auth/jwt-auth.guard.ts` |
| Roles Guard (RBAC) | `backend/src/shared/rbac/roles.guard.ts` |
| Audit Service | `backend/src/shared/audit/audit.service.ts` |
| Tenant Isolation | `backend/src/shared/tenancy/org-scope.ts` |
| Global Exception Filter | `backend/src/shared/errors/filters.ts` |
| Environment Validation | `backend/src/shared/config/env.ts` |
| Housekeeping (GDPR) | `backend/src/shared/housekeeping/housekeeping.service.ts` |
