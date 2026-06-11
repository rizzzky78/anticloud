# Phase 4 — File Metadata & Organization

**Goal:** Pure-DB metadata operations (rename, move, visibility), server-side date grouping for list views, and the public/private + owned/unowned model.

**Depends on:** Phase 3. **Unlocks:** tags (6), notes (7), search (8).

## Steps (agent actions)

### 4.1 — Metadata mutations (DB-only)
- `actions/files.ts` (or route handlers): `renameFile`, `moveFile` (path/folder field if foldering is modeled), `setVisibility`. All are pure Postgres writes — **MinIO untouched**. Pass through permission middleware; respect `isReadOnly`.
- Bust `filemeta:` cache on write.
- **Accept:** rename/move/visibility change updates the row only; no MinIO call occurs.

### 4.2 — File metadata cache
- Cache hot file records in Redis (`filemeta:` namespace), invalidated on any write to that file's metadata.
- **Accept:** repeated reads hit cache; any metadata write busts it.

### 4.3 — Date-grouped listing
- Server-side data fetcher `lib/file-list.ts` — query files ordered by `createdAt`, group into buckets **in SQL** (Postgres date_trunc) into: Today, Yesterday, This Week, This Month, then by calendar month for older. Return pre-grouped shape; client renders without recompute.
- Scope strictly to files the requesting user may see (reuse `lib/permissions.ts`).
- **Accept:** large result sets group efficiently in-query; response carries buckets; no private leakage.

### 4.4 — Public / private + guest
- Enforce visibility in listing/serve: `private` → owner + grants only; `public` → any authenticated; `public + guestEnabled` → guests via guest-public route.
- **Accept:** a guest can fetch a guest-enabled public file and nothing else.

### 4.5 — Unowned & orphan handling
- Support `ownerId = null` (unowned) created via token/superadmin context. Private unowned → admins/superadmins only; public unowned → same as public owned.
- On user deletion: convert their files to **unowned** (do not delete), preserving availability per visibility.
- **Accept:** deleting a user reassigns their files to unowned with intact visibility.

## Deliverables
Metadata mutation actions, `lib/file-list.ts`, visibility enforcement, unowned/orphan conversion logic + migration if needed.

## Out of scope
TTL/presigned/read-only/mention-restricted config — Phase 5.
