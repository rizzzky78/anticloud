# Phase 23 — Checksums & Duplicates

**Goal:** Every stored binary has a verifiable SHA-256, uploads are integrity-checked, and duplicate copies are surfaced so users can reclaim space.

**Depends on:** Phase 13 (versions), 20 (storage page). **Unlocks:** —

## Steps (agent actions)

### 23.1 — Schema
- `File.sha256` (indexed) and `FileVersion.sha256`. User runs `bunx prisma migrate dev` / `generate`.

### 23.2 — Streaming hash & integrity
- `lib/checksum.ts` `hashStream()` — a pass-through Transform between the request body and storage (single pass, no buffering); byte count must equal `Content-Length`, otherwise the object is removed and the upload rejected.
- Upload and replace store the hash; version snapshots and restores carry it.
- `scripts/backfill-checksums.ts` (`bun run backfill:checksums`) hashes existing files and versions (unreadable objects are marked so the run terminates).
- **Accept:** the stored hash equals `sha256sum` of the original file.

### 23.3 — Duplicate detection
- `lib/duplicates.ts`: `findDuplicates()` (readable files only, via the central predicate) and `listOwnDuplicateGroups()` (own files, ordered by reclaimable bytes).
- Upload response lists up to 3 identical files → toast in the upload dialog. File detail shows SHA-256 (copy) and identical files (`components/file-integrity.tsx`, `getFileIntegrity`). Storage page lists duplicate groups with reclaimable space.
- **Accept:** uploading the same file twice shows "identical to …" and a duplicate group on the Storage page.

### 23.4 — Documentation
- README features, pages and configuration updated for phases 11–23; SETUP documents the backfill scripts.

## Deliverables
Schema fields, `lib/checksum.ts`, `lib/duplicates.ts`, `actions/duplicates.ts`, integrity card, Storage duplicates, backfill script, docs.
