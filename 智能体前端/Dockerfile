# ============================================================
# Dockerfile — ShopMate AI Frontend (Vite + React + TypeScript)
# Multi-stage build: builder → nginx runner
# ============================================================

# ---- Stage 1: Builder ----
FROM node:20-alpine AS builder

WORKDIR /app

# Enable pnpm via corepack
RUN corepack enable

# Copy dependency manifests
COPY pnpm-lock.yaml package.json ./

# Install dependencies (frozen lockfile guarantees reproducibility)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the frontend application
RUN npm run build

# ---- Stage 2: Nginx Runner ----
FROM nginx:alpine AS runner

# Copy built static files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx config with SPA routing support
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose the web server port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
