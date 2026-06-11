# Phase 3 — File Storage Core

**Goal:** Stream uploads client → Route Handler → MinIO (never to app disk), with UUID object keys and all user-visible metadata in PostgreSQL. Download/serve with permission checks.

**Depends on:** Phase 2. **Unlocks:** metadata (4), lifecycle (5), tags/notes/search, jobs.

## Steps (agent actions)

### 3.1 — File model
- Add `File` to `prisma/schema.prisma`: `id` (UUID), `ownerId` (nullable → unowned), `displayName`, `objectKey`, `mimeType`, `size`, `visibility` (enum `public|private`), `isReadOnly`, `isMentionRestricted`, `expiresAt`, `deletedAt` (soft delete), `createdAt`, `updatedAt`. Index `ownerId`, `createdAt`, `deletedAt`.
- Migrate. Reconcile with `FilePermission` FK from Phase 2.
- **Accept:** file rows persist with a UUID id distinct from `objectKey`.

### 3.2 — Streaming upload handler
- `app/api/files/upload/route.ts` — accept a stream, generate UUID, derive `objectKey` via `lib/storage.buildObjectKey` (structured prefix, e.g. date/tenant), stream directly to MinIO. On success, write the File row in Postgres. Owner = current user (or unowned for token/superadmin context).
- Enforce upload rate limit (stricter category) + per-request size cap. Zod-validate metadata fields.
- **Rule:** nothing binary touches Postgres or app disk.
- **Accept:** uploaded object exists in MinIO; row exists in Postgres; `objectKey` ≠ `displayName`.

### 3.3 — Download / serve handler
- `app/api/files/[id]/route.ts` (GET) — load file, run permission middleware, stream from MinIO to the response. 404 (not 403-leaking) for no-access on private files.
- Write a download audit entry (Phase 10 stub).
- **Accept:** authorized user streams content; unauthorized gets a non-leaking 404; response is streamed, not buffered to disk.

### 3.4 — Binary replace
- `app/api/files/[id]/replace/route.ts` (PUT) — replace binary for an existing file (new MinIO write, update size/mime/updatedAt). Reject if `isReadOnly` (unless superadmin). This is the **only** metadata op that touches MinIO.
- Bust `filemeta:` + `perm:` cache for the file.
- **Accept:** replace updates the object + row; read-only files are rejected with a clear reason.

### 3.5 — Storage service hardening
- Ensure all MinIO calls route through `lib/storage.ts`. Add orphan-safety: if Postgres write fails after MinIO put, remove the just-written object (compensating cleanup).
- **Accept:** a forced post-upload DB failure leaves no orphaned MinIO object.

## Deliverables
`File` model + migration, upload/download/replace route handlers, storage hardening.

## Out of scope
Rename/move/visibility edits (Phase 4), TTL/presigned/read-only-config UX (Phase 5).
