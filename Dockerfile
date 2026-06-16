# syntax=docker/dockerfile:1

# ──────────────────────────────────────────────────────────────────────────────
# anticloud — production image (Bun runtime, Alpine)
#
# One image, two roles (see docker-compose.yml):
#   • app    → `next start` on port 3070
#   • worker → `bun run worker.ts` (Redis BLPOP job consumer)
#
# Both roles need the FULL dependency tree (the worker pulls in archiver, minio,
# ioredis and the generated Prisma client at runtime), so we deliberately do NOT
# use Next's standalone output — that would trace only the web server's imports
# and break the worker.
# ──────────────────────────────────────────────────────────────────────────────

ARG BUN_VERSION=1
FROM oven/bun:${BUN_VERSION}-alpine AS base
WORKDIR /app
# libstdc++ is needed by some optional native bits; harmless and tiny on Alpine.
RUN apk add --no-cache libstdc++

# ── deps ─────────────────────────────────────────────────────────────────────
# Cached as long as package.json / bun.lock are unchanged.
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ── builder ──────────────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate the Prisma client (driver-adapter / queryCompiler build).
RUN bunx prisma generate

# lib/env.ts validates process.env at import time, and `next build` executes
# server modules — so the build needs values that SATISFY the Zod schema. These
# are throwaway build-time placeholders; real values are injected at runtime by
# docker-compose. They are never baked into the running container's config.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    REDIS_URL=redis://127.0.0.1:6379 \
    MINIO_ENDPOINT=127.0.0.1 \
    MINIO_PORT=9000 \
    MINIO_ACCESS_KEY=build \
    MINIO_SECRET_KEY=build \
    MINIO_BUCKET=build \
    MINIO_USE_SSL=false \
    BETTER_AUTH_SECRET=build_only_placeholder_secret_change_me \
    BETTER_AUTH_URL=http://127.0.0.1:3070 \
    APP_URL=http://127.0.0.1:3070 \
    CRON_SECRET=build_only_placeholder

RUN bun run build

# ── runner ───────────────────────────────────────────────────────────────────
FROM base AS runner

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3070 \
    HOSTNAME=0.0.0.0

# Whole built app (node_modules incl. generated Prisma client, .next, source the
# worker imports, prisma schema for `migrate deploy`). Owned by the unprivileged
# `bun` user that ships with the base image.
COPY --from=builder --chown=bun:bun /app /app

USER bun
EXPOSE 3070

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3070/ >/dev/null 2>&1 || exit 1

# Default role = web server. The worker service overrides this in compose.
CMD ["bunx", "next", "start", "-H", "0.0.0.0", "-p", "3070"]
