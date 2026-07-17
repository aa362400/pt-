# ============================================================
# Dockerfile — ShopMate AI Backend (NestJS 11 + Prisma)
# Multi-stage build: builder → runner
# ============================================================

# ---- Stage 1: Builder ----
FROM node:24-alpine AS builder

WORKDIR /app

# Enable pnpm via corepack
RUN corepack enable

# Install build dependencies for native modules (argon2, etc.)
RUN apk add --no-cache python3 make g++

# Copy dependency manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Install dependencies (frozen lockfile guarantees reproducibility)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build the NestJS application
RUN npm run build

# ---- Stage 2: Runner ----
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts/migrations ./scripts/migrations

# Local storage is the production-compose fallback when S3 is not configured.
# Pre-create it while still running as root so the non-root runtime can write.
RUN mkdir -p /app/uploads && chown -R nestjs:nodejs /app/uploads

# Switch to non-root user
USER nestjs

# Expose the application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/v1/health || exit 1

# Apply pending database migrations, then start the NestJS server.
# `prisma migrate deploy` is a no-op when the schema is already up to date
# and takes an advisory lock, so concurrent replicas are safe.
CMD ["sh", "-c", "DATABASE_URL=\"$DATABASE_ADMIN_URL\" node scripts/migrations/deploy-guarded.mjs && node dist/main"]
