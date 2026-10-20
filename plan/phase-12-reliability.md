# Phase 12 — Reliability & Maintenance

**Goal:** Make background work crash-safe, actually run lifecycle cleanup, and fix broken/fragile flows found in review.

**Depends on:** Phase 11. **Unlocks:** 13+

## Steps (agent actions)

### 12.1 — Crash-safe job queue
- `lib/jobs.ts`: claim with `BLMOVE queue → processing` on a dedicated connection; remove from processing when done. Failed jobs go to a delayed ZSET with exponential backoff; `promoteDueJobs()` re-queues due ones. `recoverAbandonedJobs()` on boot drains the processing list and fails stale RUNNING rows. `retryJob()` + superadmin `retryDeadJob` action and console button.
- **Accept:** killing the worker mid-job re-runs the job on restart; dead-lettered jobs can be retried from `/admin/jobs`.

### 12.2 — Scheduled maintenance
- `lib/maintenance.ts`: `expireFiles` (TTL → recycle bin), `purgeTrash` (hard-delete after 30 days, objects + rows), `cleanupArchives` (ZIPs older than 24 h), `runMaintenance()` under a Redis lock. Worker runs it every 15 min; `/api/cron/expire` triggers the same pass.
- **Accept:** recycle-bin entries older than 30 days disappear and their objects are removed from storage.

### 12.3 — App-served bulk archives
- Worker stores `archiveKey`; `GET /api/jobs/[id]/download` streams the ZIP to the requester only. Job results never expose the key. ZIP entry names are sanitized and de-duplicated (`lib/zip-names.ts`).
- **Accept:** async bulk downloads work when storage is not reachable from the browser.

### 12.4 — Input normalization
- `lib/paths.ts`: `folderPathSchema`, `displayNameSchema`, `mimeTypeSchema`; used by upload and move. Upload headers are URI-encoded by the client so non-ASCII names survive.
- **Accept:** `//a/./b/` is stored as `/a/b`; `..` is rejected.

### 12.5 — Correctness fixes
- Settings saves username via `updateUser({ username })`. `getCurrentUser` bypasses the cookie cache so role changes apply immediately. Restoring an expired file clears its elapsed TTL. Compression refuses already-compressed types.
- Permanent delete from the recycle bin (owner trash + admin bin).
- **Accept:** username edits persist; demoted users lose admin pages on the next request.

### 12.6 — Cheaper telemetry
- `proxy.ts` increments Redis directly (Node runtime) instead of a loopback fetch per request; errors counted via `instrumentation.ts#onRequestError`; `/api/telemetry` removed.
- **Accept:** one request produces one counter increment and no extra HTTP call.

## Deliverables
`lib/jobs.ts`, `lib/maintenance.ts`, `lib/paths.ts`, `lib/zip-names.ts`, `app/api/jobs/[id]/download/route.ts`, worker schedulers, recycle-bin permanent delete, settings/auth/proxy fixes.
