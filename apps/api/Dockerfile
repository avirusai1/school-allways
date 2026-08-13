# =============================================================================
# School All Ways API — multi-stage build for linux/arm64 (Oracle Ampere A1).
#
# BUILD FOR ARM. Oracle's Always Free compute is Ampere (aarch64). An image
# built on an x86 CI runner without --platform will not run there, and the
# failure looks like "exec format error" at container start.
#   docker buildx build --platform linux/arm64 ...
# =============================================================================

# ---- deps -------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Copy only manifests first so the dependency layer caches across code changes.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json apps/api/
COPY db/package.json db/
COPY packages/shared-types/package.json packages/shared-types/

RUN pnpm install --frozen-lockfile

# ---- build ------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /repo/db/node_modules ./db/node_modules

COPY . .
RUN pnpm --filter @saw/api build

# Strip dev dependencies for the runtime image.
RUN pnpm --filter @saw/api --prod deploy /out

# ---- runtime ----------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    TZ=Asia/Kolkata \
    # Cap the heap. The container limit is 2 GB; leaving Node to guess means it
    # sizes against the HOST's 12 GB and gets OOM-killed under load instead of
    # garbage collecting.
    NODE_OPTIONS=--max-old-space-size=768

RUN apk add --no-cache tini tzdata wget && \
    addgroup -g 1001 -S nodejs && \
    adduser -S saw -u 1001 -G nodejs

COPY --from=build --chown=saw:nodejs /out/node_modules ./node_modules
COPY --from=build --chown=saw:nodejs /repo/apps/api/dist ./dist
# Migrations and RLS policies ship with the image so deploy can apply them.
COPY --from=build --chown=saw:nodejs /repo/db ./db

USER saw
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

# tini reaps zombies and forwards SIGTERM, so enableShutdownHooks() actually
# gets a chance to drain the connection pool.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
