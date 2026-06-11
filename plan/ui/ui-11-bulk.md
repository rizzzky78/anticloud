# UI-11 — Bulk Download & Compression

**Goal:** Multi-select on the file browser driving bulk download (sync stream + async job polling) and on-demand non-destructive server-side compression with derived-version display.

**Depends on:** ui-02, Phase 9 (handlers exist: `POST /api/files/bulk-download`, `actions/compress.ts` → `compress`, `lib/jobs.ts` → `enqueueJob`/`getJobStatus`).

> **One small UI-side prerequisite (11.0):** there is no HTTP endpoint to read job status — only `getJobStatus(jobId)` in `lib/jobs.ts`. Add a thin read surface for polling: a server action `getJob(jobId)` (wrapping `getJobStatus`) **or** `app/api/jobs/[id]/route.ts` (GET). Permission-check the caller owns the job. Do this first; the polling steps below depend on it.

## Steps (agent actions)

### 11.1 — Selection mode
- Add row checkboxes (`ui/checkbox`) + a selection toolbar on `/files` (count, clear, actions). Selection state in a client store or URL.
- **Accept:** users multi-select files and see a contextual toolbar.

### 11.2 — Bulk download (sync + async)
- Toolbar "Download" → `POST /api/files/bulk-download` with JSON `{ fileIds }`. The handler streams an archive for small selections **or** returns `{ jobId }` for large ones — branch on the response (stream vs JSON). Surface the in-archive manifest note (excluded/no-access files).
- **Accept:** small selections download immediately; large selections hand back a `jobId` (→ 11.3).

### 11.3 — Async job polling
- On a `{ jobId }` response, poll `getJob`/`GET /api/jobs/[id]` (from 11.0). Show progress in a jobs `ui/drawer` + toast; on `COMPLETED`, offer the short-lived presigned download URL from the job `result`; reflect `FAILED`/`DEAD_LETTER`.
- **Accept:** large jobs show live status and resolve to a working, expiring download link.

### 11.4 — Compression (non-destructive)
- File detail action "Compress" → `compress({ fileId, ... })` (`actions/compress.ts`), which enqueues a job. Poll via 11.0. On completion, show original + derived version using `File.derivedFrom`/`derivatives`; let the user pick the canonical one.
- **Accept:** compression yields a derived version, original preserved, canonical selectable; status is pollable.

### 11.5 — Jobs drawer (shared)
- Global `ui/drawer` listing the user's active/recent jobs (download/compression) with status badges + result links, fed by polling. Reused by the admin jobs view (ui-09).
- **Accept:** in-progress jobs are visible and update to completion.

## Components used
`ui/checkbox`, `ui/drawer`, `ui/progress`, `ui/badge`, `ui/button`, `ui/tooltip`, `ui/sonner`; reuse `components/file-list.tsx`.

## Out of scope
The job infrastructure + archive/compression logic — backend Phase 9 (already built).
