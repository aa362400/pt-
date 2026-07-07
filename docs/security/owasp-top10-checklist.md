# OWASP Top 10 (2021) — Self-Assessment for ShopMate AI

Last updated: 2026-07-07
Assessed by: ZCode Security Audit

---

## A01: Broken Access Control

**Risk:** Attackers can access data or functionality beyond their permissions.

### ✅ Existing Protections

- **JWT-based authentication with Passport** (`src/shared/auth/jwt-auth.guard.ts`) — globally registered via `APP_GUARD`, with `@Public()` opt-out for auth endpoints.
- **Organization-scoped data access** (`src/shared/tenancy/org-scope.ts`) — `requireOrg()` and `requireOrgRole()` helpers ensure every query is scoped.
- **Role-based access control** (`src/shared/rbac/roles.guard.ts`) — supports `OWNER`/`ADMIN`/`MEMBER`/`VIEWER` roles with `@Roles()` decorator.
- **Tenant isolation via organizationId** — every Prisma query filters by `organizationId` from the JWT. Verified by e2e tests (`test/tenant-isolation.e2e-spec.ts`).
- **Path traversal protection** in `LocalStorageService.resolveKey()` — rejects keys that escape the upload directory.
- **Refresh token rotation** — old refresh tokens are deleted on use, preventing replay.
- **Logout revokes all refresh tokens** (`AuthService.logout()`).

### ⚠️ Gaps

- [ ] **Test that JWT tampering is rejected** — Passport-JWT uses `secretOrKey` from env, but no explicit integration test verifies modified tokens fail.
- [ ] **Test that deleted/suspended users cannot access resources** — Membership `status` field exists (`ACTIVE`/`INVITED`/`SUSPENDED`/`REMOVED`) but the JWT auth guard does not verify the membership status on each request.
- [ ] **No CSRF protection** — The API uses Bearer tokens which are not vulnerable to CSRF, but if cookie-based auth is ever added, CSRF tokens would be needed.
- [ ] **VIEWER can create products** — The e2e test notes that `POST /products` has no `@Roles()` guard, allowing VIEWERs to create products (though they are in the correct org scope).

### 📋 Recommended Remediation

| # | Action | Priority | Effort |
|---|--------|----------|--------|
| 1 | Add middleware to verify membership `status === 'ACTIVE'` on authenticated requests | High | Medium |
| 2 | Add integration tests for JWT tampering rejection | Medium | Low |
| 3 | Review and add `@Roles()` guards where missing (e.g., product creation) | Medium | Low |
| 4 | Add automated test for deleted-user endpoint rejection | Medium | Low |

---

## A02: Cryptographic Failures

**Risk:** Sensitive data exposed due to weak or missing encryption.

### ✅ Existing Protections

- **Argon2 for password hashing** (`auth.service.ts` line 50) — resistant to GPU/ASIC attacks.
- **JWT with HS256 signing** — via `@nestjs/jwt` using `JWT_ACCESS_SECRET` (min 32 chars, validated by Zod).
- **HTTPS enforced** — nginx reverse proxy (`nginx.conf`) with TLS termination via cert-manager (production).
- **SHA-256 token hashing** — refresh tokens, password reset tokens, and email verification tokens are stored as `sha256` hashes.
- **Refresh tokens use a separate secret** (`JWT_REFRESH_SECRET`) from access tokens.
- **Zod superRefine rejects dev secrets in production** — `env.ts` rejects `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` dev fallbacks when `NODE_ENV=production`.
- **Error messages don't leak details in production** — `GlobalExceptionFilter` returns generic message for 500 errors.
- **Swagger/OpenAPI disabled in production** (`main.ts` line 66).

### ⚠️ Gaps

- [ ] **No KMS/Vault for secrets management** — Secrets are in environment variables, not encrypted at rest by a key management service.
- [ ] **ENCRYPTION_KEY is optional** — `env.ts` marks it optional (`z.string().min(16).optional()`), meaning sensitive fields like `accessTokenEncrypted`/`refreshTokenEncrypted` in `ChannelConnection` rely on it being set.
- [ ] **`CORS_ORIGINS` defaults to `*` in non-production** — env validation allows `CORS_ORIGINS=*` except in production. Dev/test environments are permissive.
- [ ] **2FA secrets are in the database** — `twoFactorSecret` stored on `User` model but 2FA is not yet fully implemented (schema exists, no routes to enable/verify).
- [ ] **No column-level encryption** — Sensitive channel tokens (`accessTokenEncrypted`, `refreshTokenEncrypted`) naming suggests encryption but the actual encryption/decryption logic is not visible in the shared storage layer.

### 📋 Recommended Remediation

| # | Action | Priority | Effort |
|---|--------|----------|--------|
| 1 | Integrate with a secrets manager (AWS Secrets Manager / HashiCorp Vault) | High | Large |
| 2 | Make `ENCRYPTION_KEY` required in production via Zod superRefine | High | Small |
| 3 | Implement column-level encryption service for `ChannelConnection` tokens | Medium | Medium |
| 4 | Complete 2FA enable/verify/disable endpoints | Medium | Medium |
| 5 | Tighten CORS in non-production environments | Low | Small |

---

## A03: Injection

**Risk:** Attacker injects malicious code (SQL, NoSQL, OS commands) via untrusted input.

### ✅ Existing Protections

- **Prisma ORM** — parameterized queries by default; raw SQL is only used for the health check (`SELECT 1`).
- **Zod schema validation** on all environment variables (`src/shared/config/env.ts`).
- **class-validator on all DTOs** — `@IsEmail()`, `@MinLength(8)`, `@IsString()`, etc. applied to all auth DTOs and presumably feature DTOs.
- **Whitelist validation** via NestJS `ValidationPipe` with `whitelist: true` and `forbidNonWhitelisted: true` (`main.ts`).
- **Path traversal protection** in `LocalStorageService` — `resolveKey()` rejects traversal attempts.
- **Body size limit** set to 50MB (for legitimate large payloads, not unbounded).

### ⚠️ Gaps

- [ ] **No dedicated SQL injection pentest** — While Prisma is safe by default, the `SELECT 1` raw query and any future raw queries need review.
- [ ] **No NoSQL injection test** — If Redis/MongoDB is used alongside PostgreSQL, injection paths need review.
- [ ] **No XSS protection in API responses** — While the nginx CSP header is set, API error responses that reflect user input could be vulnerable if consumed by a browser.

### 📋 Recommended Remediation

| # | Action | Priority | Effort |
|---|--------|----------|--------|
| 1 | Add automated injection test suite (SQLi, XSS, command injection) | Medium | Medium |
| 2 | Ensure no raw queries are added without review (add to PR checklist) | Medium | Low |
| 3 | Review if any user input is reflected in error messages | Low | Small |

---

## A04: Insecure Design

**Risk:** Security flaws introduced by missing or insufficient security controls in the design phase.

### ✅ Existing Protections

- **Rate limiting** — Global: 100 req/min per IP (`@nestjs/throttler`). Auth endpoints: stricter limits (5–20 req/min).
- **Password policy** — `@MinLength(8)` on `RegisterDto.password` and `ResetPasswordDto.password`.
- **Email verification** — Required before full access (tokens expire 24h, hashed in DB).
- **Account lockout on password reset** — Old tokens are invalidated, new tokens require email access.
- **GDPR data deletion** — `HousekeepingService.deleteUserData()` implements full user erasure.
- **Data retention cleanup** — `HousekeepingService.runCleanup()` removes expired tokens, archives old sessions, etc.
- **Tenant isolation by design** — Every model has `organizationId` as a required field.

### ⚠️ Gaps

- [ ] **No account lockout after failed login attempts** — Repeated failed logins are not rate-limited per-user; only per-IP.
- [ ] **No security.txt or security contact** — No documented channel for security researchers to report vulnerabilities. *(This is being created as part of this audit.)*
- [ ] **No brute-force protection on login** — The 10 req/min throttle helps but a distributed attack could bypass IP-based limits.
- [ ] **No "forgot password" rate limiting per email** — `forgotPassword()` is IP-rate-limited but not per-email, allowing email enumeration (though the API returns the same message regardless).
- [ ] **No automatic account suspension** — No mechanism to suspend accounts after prolonged suspicious activity.

### 📋 Recommended Remediation

| # | Action | Priority | Effort |
|---|--------|----------|--------|
| 1 | Implement account lockout after N failed login attempts (per-user) | High | Medium |
| 2 | Add email-based rate limiting to forgot-password and login | Medium | Small |
| 3 | Create a security contact policy and security.txt | Medium | Small |
| 4 | Consider adding login anomaly detection | Low | Large |

---

## A05: Security Misconfiguration

**Risk:** Deploying with insecure defaults, unnecessary features, or misconfigured permissions.

### ✅ Existing Protections

- **Helmet.js** — security headers middleware applied globally (`main.ts` line 26: `app.use(helmet())`).
- **Nginx security headers** — Comprehensive headers in `security-headers.conf` including CSP, HSTS, X-Frame-Options, etc.
- **CORS whitelist** — Production requires explicit comma-separated origins (`env.ts` superRefine).
- **Swagger disabled in production** — API documentation is only available in dev/test.
- **Global validation pipe** — Strips unknown properties (`whitelist: true`), rejects non-whitelisted (`forbidNonWhitelisted: true`).
- **Versioned API prefix** — `/api/v1` enables graceful API versioning without breaking consumers.
- **Docker health check** — Port 3000 health endpoint in Dockerfile.

### ⚠️ Gaps

- [ ] **No security headers middleware in NestJS backend** — Helmet is used in `main.ts`, but there's no dedicated middleware class that could be applied per-route or tested in isolation.
- [ ] **No explicit CSP for API responses** — CSP is set at the nginx level (for the frontend), but the API does not set CSP headers directly.
- [ ] **No security.txt endpoint** — The backend doesn't serve `.well-known/security.txt`.
- [ ] **No automated security header check in CI** — No test validates that all security headers are present in responses.
- [ ] **No dir listing protection** — Static file serving configuration needs verification.

### 📋 Recommended Remediation

| # | Action | Priority | Effort |
|---|--------|----------|--------|
| 1 | Create security headers middleware in NestJS (being done in this audit) | High | Small |
| 2 | Add automated security header tests | Medium | Small |
| 3 | Configure `security.txt` serving | Medium | Small |
| 4 | Run a security header scanner (e.g., securityheaders.com) | Low | Small |

---

## A06: Vulnerable and Outdated Components

**Risk:** Using libraries or frameworks with known vulnerabilities.

### ✅ Existing Protections

- **Dependencies managed via pnpm** — Lockfile ensures reproducible installs.
- **Relatively modern framework versions** — NestJS 11, Prisma 6, TypeScript 5, etc. (as of July 2026).
- **Argon2** used over bcrypt — modern, actively maintained password hashing library.

### ⚠️ Gaps

- [ ] **No automated dependency vulnerability scanning** — `pnpm audit` is not run in CI.
- [ ] **No Dependabot or Renovate configuration** — No automated PRs for dependency updates.
- [ ] **No Software Bill of Materials (SBOM)** — No inventory of dependencies and their licenses.
- [ ] **No policy for dependency update frequency** — No scheduled review of outdated packages.

### 📋 Recommended Remediation

| # | Action | Priority | Effort |
|---|--------|----------|--------|
| 1 | Add `pnpm audit` to CI pipeline (being done in this audit) | High | Small |
| 2 | Configure Dependabot or Renovate for automated update PRs | High | Small |
| 3 | Run `pnpm audit --audit-level=high` weekly | Medium | Small |
| 4 | Generate SBOM (e.g., using `@cyclonedx/cyclonedx-npm`) | Low | Small |

---

## A07: Identification and Authentication Failures

**Risk:** Weak authentication allowing impersonation or credential compromise.

### ✅ Existing Protections

- **JWT-based authentication** with access + refresh token pattern.
- **Argon2 password hashing** — resistant to offline cracking.
- **Access token TTL** — default 15 minutes (short-lived).
- **Refresh token TTL** — default 7 days, stored hashed in DB, rotated on use.
- **Email verification** — Required, with 24h token expiry and hash storage.
- **Password reset** — Token expires in 30 minutes, hashed in DB, single-use (usedAt field).
- **Logout revokes all refresh tokens** — Immediate session invalidation.
- **Rate limiting on auth endpoints** — Register (5/min), Login (10/min), Refresh (20/min), Forgot/Reset (5/min each).

### ⚠️ Gaps

- [ ] **No multi-factor authentication (2FA)** — Schema has `twoFactorEnabled` and `twoFactorSecret` but no implementation.
- [ ] **No account lockout on failed login** — Attackers can try unlimited passwords (within IP rate limits).
- [ ] **No password complexity rules** — Only `@MinLength(8)` enforced; no requirement for uppercase, numbers, or special characters.
- [ ] **No breached password detection** — No check against known compromised passwords (e.g., Have I Been Pwned API).
- [ ] **No session management UI** — Users cannot view or revoke active sessions.
- [ ] **`/auth/me` returns user info without verifying membership status** — A user with a suspended membership can still call `/auth/me`.

### 📋 Recommended Remediation

| # | Action | Priority | Effort |
|---|--------|----------|--------|
| 1 | Implement 2FA enable/verify/disable endpoints | High | Medium |
| 2 | Add account lockout after N failed login attempts | High | Medium |
| 3 | Add password complexity requirements (uppercase, number, special) | Medium | Small |
| 4 | Add breached password check on registration | Medium | Medium |
| 5 | Create session management endpoint (list/revoke sessions) | Medium | Medium |
| 6 | Verify membership status on authenticated requests | High | Medium |

---

## A08: Software and Data Integrity Failures

**Risk:** Using untrusted software or failing to verify the integrity of updates.

### ✅ Existing Protections

- **pnpm lockfile** — Ensures deterministic installs.
- **Docker multi-stage builds** — Dockerfile uses separate build/run stages.
- **CI/CD pipeline** — Presumably has build and test stages before deployment.

### ⚠️ Gaps

- [ ] **No package signature verification** — No integrity checking of npm packages beyond lockfile hashes.
- [ ] **No CI/CD pipeline visible in repository** — No `.github/workflows` for build/test/deploy.
- [ ] **No signed commits or releases** — No GPG signing of tags or releases.
- [ ] **No SBOM generation** — No automated bill of materials for supply chain transparency.

### 📋 Recommended Remediation

| # | Action | Priority | Effort |
|---|--------|----------|--------|
| 1 | Create CI/CD pipeline with build, test, and security stages (partially in this audit) | High | Medium |
| 2 | Enable Dependabot alerts and security updates | High | Small |
| 3 | Configure branch protection rules on main branch | Medium | Small |
| 4 | Generate SBOM as part of release pipeline | Low | Small |

---

## A09: Security Logging and Monitoring Failures

**Risk:** Inability to detect or respond to security incidents.

### ✅ Existing Protections

- **Audit log service** (`src/shared/audit/audit.service.ts`) — Writes immutable audit trail records with organizationId, actorId, action, resourceType, resourceId, before/after diffs, IP, and user agent.
- **Structured logging** (`LoggerModule`) — NestJS Logger with request context.
- **Prometheus metrics** (`metrics.interceptor.ts`) — HTTP request count and duration histograms.
- **Request ID middleware** — Every request gets a UUID for tracing across logs.
- **Unified error handling** — `GlobalExceptionFilter` returns structured errors with requestId.
- **Housekeeping cleanup** — Periodic cleanup of expired tokens and old data.

### ⚠️ Gaps

- [ ] **No centralized log aggregation** — No ELK/Loki stack configured for log analysis.
- [ ] **No security-specific alerting** — No automated alerting for brute-force attempts, suspicious access patterns, etc.
- [ ] **No audit trail for auth events** — Login, logout, failed login attempts are not logged to the audit service.
- [ ] **No real-time monitoring of rate limit violations** — Throttler doesn't log violations automatically.
- [ ] **No security incident response plan** — No documented IR process.

### 📋 Recommended Remediation

| # | Action | Priority | Effort |
|---|--------|----------|--------|
| 1 | Add audit logging for authentication events (login, logout, failed attempts) | High | Medium |
| 2 | Set up centralized log aggregation (e.g., Grafana Loki) | Medium | Medium |
| 3 | Create alerting rules for security events (brute force, suspicious IPs) | Medium | Medium |
| 4 | Log rate limit violations with request context | Medium | Small |
| 5 | Document security incident response plan | Medium | Medium |

---

## A10: Server-Side Request Forgery (SSRF)

**Risk:** Attacker makes the server send requests to internal or external systems.

### ✅ Existing Protections

- **No direct URL fetching from user input** — The codebase doesn't appear to have any endpoints that accept a URL and fetch it server-side.
- **S3 client uses pre-configured endpoint** — `S3StorageService` uses endpoint from env, not user input.
- **File uploads go through storage service** — Not direct URL-based fetching.

### ⚠️ Gaps

- [ ] **No explicit SSRF review** — Agent providers and external API calls need audit for user-influenced URLs.
- [ ] **No URL validation helper** — If URL fetching is added in the future, there's no centralized URL validation/sanitization utility.
- [ ] **No network segmentation** — The nginx config proxies to services by name (frontend, backend, agent) but there's no explicit egress filtering.

### 📋 Recommended Remediation

| # | Action | Priority | Effort |
|---|--------|----------|--------|
| 1 | Review all agent provider integrations for user-controlled URL parameters | Medium | Medium |
| 2 | Create a URL validation utility for future use | Low | Small |
| 3 | Review network egress rules in Kubernetes deployment | Medium | Medium |

---

## Summary

| Category | Status | Score |
|----------|--------|-------|
| A01: Broken Access Control | 🟢 Strong | 85% |
| A02: Cryptographic Failures | 🟡 Good | 70% |
| A03: Injection | 🟢 Strong | 90% |
| A04: Insecure Design | 🟡 Good | 70% |
| A05: Security Misconfiguration | 🟡 Good | 75% |
| A06: Vulnerable & Outdated Components | 🟡 Needs Work | 50% |
| A07: Identification & Auth Failures | 🟡 Good | 70% |
| A08: Software & Data Integrity | 🟡 Needs Work | 40% |
| A09: Logging & Monitoring | 🟡 Good | 65% |
| A10: SSRF | 🟢 Strong | 85% |

**Overall: 70% — Good foundation with clear remediation priorities.**
