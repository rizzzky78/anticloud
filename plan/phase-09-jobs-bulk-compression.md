# Phase 9 — Jobs · Bulk Download · Compression

**Goal:** A Redis-backed job system (queue, worker, retries, DLQ, cron) powering TTL expiry cleanup, streamed bulk-download archives, and non-destructive server-side compression.

**Depends on:** Phases 3 & 5. **Unlocks:** —

## Steps (agent actions)

### 9.1 — Job infrastructure
- Add `Job` model (type, status, payload, attempts, result, error, timestamps) to Postgres. Build `lib/jobs.ts` — Redis list-based queue (`job:` namespace): `enqueue`, worker `consume` loop, status read for polling. Exponential backoff retries up to a limit; permanently-failed → **dead-letter queue** + flagged in Postgres for superadmin review.
- Worker = a long-running Node process / scheduled function (document how it runs alongside the containers).
- **Accept:** enqueued job runs; transient failure retries with backoff; exhausted job lands in DLQ + flagged row.

### 9.2 — TTL expiry cron
- Cron-triggered route (`app/api/cron/expire/route.ts`, secret-protected) periodically scans for files past `expiresAt`: soft-delete (Phase 5), then hard-delete from MinIO + mark deleted after the grace window. Superadmin recovery honored within grace.
- **Accept:** an expired file is soft-deleted then hard-removed from MinIO after grace; pre-grace recovery works.

### 9.3 — Bulk download (small selections, sync)
- `app/api/files/bulk-download/route.ts` — validate access to **each** selected file individually; stream each from MinIO through a compression/zip stream directly to the response (no disk). Excluded (no-access) files are omitted but listed in an in-archive `manifest.txt` with reasons.
- **Accept:** archive streams to client; inaccessible files are excluded + explained in the manifest.

### 9.4 — Bulk download (large selections, async)
- For large selections, enqueue an archive job (9.1). Client gets a `jobId`, polls a status endpoint (Redis-backed `job:` state). On completion, return a short-lived presigned URL to a temp MinIO archive; the temp archive is deleted after its TTL.
- **Accept:** large request returns a jobId; polling yields a presigned URL; temp archive expires.

### 9.5 — Server-side compression (non-destructive)
- `actions/compress.ts` + job: pull file from MinIO, compress by file-type-appropriate algorithm, store as a **new** MinIO object linked in Postgres as a derived version of the original. Original preserved unless the user explicitly replaces it. Status tracked in Postgres; in-progress state in Redis (`job:`); completion busts relevant caches.
- **Accept:** compression yields a derived version; original remains; user can choose canonical; status is pollable.

## Deliverables
`Job` model + migration, `lib/jobs.ts` (queue/worker/retry/DLQ), expiry cron route, bulk-download (sync + async) routes, `actions/compress.ts`, worker run docs.

## Out of scope
Audit/metrics surfacing — Phase 10.
