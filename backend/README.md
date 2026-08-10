# ShopMate AI Backend

NestJS backend for ShopMate AI — cross-border e-commerce AI SaaS platform。

## Prerequisites

- Node.js >= 20
- pnpm >= 8
- Docker + Docker Compose (recommended for PostgreSQL + Redis)

## Quick start

```bash
# 1. Start PostgreSQL and Redis
docker compose up -d

# 2. Install dependencies
pnpm install

# 3. Configure environment
cp .env.example .env
# Edit .env if needed (defaults work with docker compose services)

# 4. Initialize database schema
pnpm exec prisma db push

# 5. Run dev server
pnpm run start:dev
```

Server will be available at:

- API root: http://localhost:3000/api/v1
- Swagger docs: http://localhost:3000/api/docs
- Health check: http://localhost:3000/api/v1/health
- Readiness check: http://localhost:3000/api/v1/ready

## Verification commands

```bash
# Install with frozen lockfile (CI gate)
pnpm install --frozen-lockfile

# Prisma validate
pnpm exec prisma validate

# Generate Prisma client
pnpm exec prisma generate

# Build
pnpm run build

# Unit tests
pnpm test --runInBand

# E2E tests (requires PostgreSQL running)
pnpm run test:e2e --runInBand

# Lint
pnpm exec eslint "src/**/*.ts" "test/**/*.ts"

# Push schema to DB
pnpm exec prisma db push --skip-generate
```

## API conventions

- Base prefix: `/api/v1`
- Auth: Bearer JWT in `Authorization` header
- Public routes: marked with `@Public()` decorator
- Response shape:
  - Success: `{ data, meta }`
  - Error: `{ error: { code, message }, requestId }`

## Health & readiness

- `GET /api/v1/health` — process alive (always 200)
- `GET /api/v1/ready` — checks PostgreSQL and Redis; returns 200 if both up, **503** if either down

## Architecture

- Feature-first modules under `src/features/`
- Shared infrastructure under `src/shared/`
- Agent integration via `AgentProviderInterface` (swap Mock/Http implementations)
- BullMQ workers under `src/workers/`

## Environment variables

See `.env.example` for full list. Key variables:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `REDIS_URL` | yes | Redis connection string |
| `JWT_ACCESS_SECRET` | yes | Access token signing secret (min 16 chars) |
| `JWT_REFRESH_SECRET` | yes | Refresh token signing secret (min 16 chars) |
| `PORT` | no | Server port (default 3000) |
| `NODE_ENV` | no | `development` / `production` / `test` |