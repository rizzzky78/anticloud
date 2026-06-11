# Phase 10 — Audit & Observability

**Goal:** Append-only audit log for every significant action, a superadmin query surface, and a Prometheus-compatible metrics endpoint. Fill the audit "stubs" left across earlier phases.

**Depends on:** Phase 1 (and reads from all feature phases). **Unlocks:** —

## Steps (agent actions)

### 10.1 — Audit model & writer
- Add `AuditLog` to `prisma/schema.prisma`: `id`, `actorId`, `action`, `targetType`, `targetId`, `ip`, `metadata` (JSON), `createdAt`. **Append-only** — no update/delete path exposed through the app API. Index `actorId`, `targetId`, `action`, `createdAt`. Migrate.
- Create `lib/audit.ts` — `recordAudit({...})` writing one row. Capture actor, action, target, time, IP.
- **Accept:** a single helper writes immutable audit rows; no API path mutates them.

### 10.2 — Backfill audit stubs
- Replace the audit stubs left in earlier phases with real `recordAudit` calls: upload, download, permission/role change, grant/revoke, visibility change, config toggles (TTL/presigned/read-only/mention), delete/recover, compression, bulk download.
- **Accept:** each significant action writes a corresponding audit row with actor + IP.

### 10.3 — Audit query surface
- Superadmin-only `actions/audit.ts` + UI: query the log filtered by user, file/target, action type, and date range. Compose filters into a single Postgres query.
- **Accept:** superadmin filters the log; non-superadmins are denied.

### 10.4 — Metrics endpoint
- `app/api/metrics/route.ts` — Prometheus-scrape-compatible output exposing request counts, error rates, job-queue depth (from `lib/jobs.ts`), and cache hit rates (from `lib/cache.ts`). Protect/segregate per existing monitoring conventions.
- **Accept:** the endpoint returns valid Prometheus text; counters move under load.

### 10.5 — Wire counters
- Increment metric counters at the right seams: middleware (requests/errors), cache helpers (hits/misses), job worker (queue depth, failures).
- **Accept:** generating traffic + jobs visibly changes the exposed metrics.

## Deliverables
`AuditLog` model + migration, `lib/audit.ts`, backfilled audit calls across phases, `actions/audit.ts` + UI, `app/api/metrics/route.ts`, counter instrumentation.

## Out of scope
External dashboards/alerting — endpoint compatibility only.
