# Phase 0 — Foundation & Infrastructure

**Goal:** Stand up the service clients (Postgres/Prisma, Redis, MinIO), env validation, and the base lib layout that every later phase imports. No features yet — just reliable, typed connections.

**Depends on:** none. **Unlocks:** all phases.

> Containers already run on the host: Postgres, Dragonfly (Redis-compatible), MinIO. Connect to them; do not provision new infra.

## Steps (agent actions)

### 0.1 — Environment contract
- Create `.env.example` documenting every variable: `DATABASE_URL`, `REDIS_URL`, `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, `MINIO_USE_SSL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `APP_URL`.
- Create `lib/env.ts` — parse + validate `process.env` with Zod at module load; throw a clear error listing missing/invalid keys. Export a typed `env` object. **No other module reads `process.env` directly.**
- **Accept:** importing `lib/env.ts` with a missing var fails fast with a readable message.

### 0.2 — Prisma bootstrap
- Add `prisma`, `@prisma/client` (dev + runtime). Create `prisma/schema.prisma` with PostgreSQL datasource from `env.DATABASE_URL` and a generator. Leave models empty (phases own their models).
- Create `lib/db.ts` exporting a singleton `PrismaClient` (guard against hot-reload re-instantiation via `globalThis`).
- **Accept:** `bun prisma generate` succeeds; `lib/db.ts` imports without connecting eagerly.

### 0.3 — Redis (Dragonfly) client
- Add a Redis client lib (`ioredis`). Create `lib/redis.ts` — singleton client from `env.REDIS_URL`, hot-reload-safe, with a documented **key-namespace convention**: `session:`, `perm:`, `filemeta:`, `search:`, `tagfreq:`, `job:`, `ratelimit:`.
- Add a tiny `lib/cache.ts` helper: `getJSON`, `setJSON(key, val, ttlSeconds)`, `del(prefix*)` so phases don't hand-roll serialization.
- **Accept:** a throwaway ping script connects and returns `PONG`.

### 0.4 — MinIO storage client
- Add `minio`. Create `lib/storage.ts` — the **only** module that talks to MinIO. Export a singleton client + helpers: `putObject`, `getObjectStream`, `removeObject`, `statObject`, `presignedGetUrl(key, ttl)`, and `buildObjectKey({ ... })` that maps internal UUID + prefix → object key.
- On boot helper: ensure `env.MINIO_BUCKET` exists (create if missing).
- **Rule:** no other file constructs or parses MinIO keys. Application code passes UUIDs/metadata; this module owns the mapping.
- **Accept:** a throwaway script can put + stat + remove a small object.

### 0.5 — Result & error primitives
- Create `lib/result.ts` (or `lib/errors.ts`): a typed `AppError` with safe `code`/`message` + HTTP status, and a `toApiError()` that strips internals. Centralize so handlers never leak stack traces.
- **Accept:** thrown `AppError` serializes to `{ code, message }` only.

### 0.6 — Lib layout & conventions doc
- Create `lib/README.md` (1 screen) listing the lib modules and their single responsibilities. Confirm directory skeleton: `lib/`, `actions/`, `app/api/`.
- **Accept:** layout matches CLAUDE.md naming rules.

## Deliverables
`lib/env.ts`, `lib/db.ts`, `lib/redis.ts`, `lib/cache.ts`, `lib/storage.ts`, `lib/result.ts`, `prisma/schema.prisma`, `.env.example`, `lib/README.md`.

## Out of scope
Models, auth, any route handler logic. Those land in later phases.
