# Phase 18 — Thumbnails

**Goal:** File lists show real image previews without downloading full-size originals for every visible row.

**Depends on:** Phase 12 (job queue), 13 (versions). **Unlocks:** —

## Steps (agent actions)

### 18.1 — Schema & dependency
- `File.thumbnailKey` (unique, nullable); `JobType.THUMBNAIL`; storage prefix `thumbs/`. `sharp` added with Bun.
- User runs `bunx prisma migrate dev` / `generate`.

### 18.2 — Generation
- `lib/thumbnails.ts`: `supportsThumbnail` (raster images ≤ 80 MB; SVG excluded), `queueThumbnail`, `generateThumbnail` (sharp: EXIF-rotate, fit inside 320 px, WebP q72; pixel limit guard). The new thumbnail is attached only if the file still has the rendered content; the previous thumbnail object is removed.
- Queued on upload, versioned replace and version restore (old thumbnail cleared immediately); promote-derivative clears it. Hard deletion removes the thumbnail object. Worker handles `THUMBNAIL`.
- `scripts/backfill-thumbnails.ts` (`bun run backfill:thumbnails`) queues jobs for existing images.
- **Accept:** uploading a 20 MB JPEG produces a ~20 KB WebP thumbnail shortly after.

### 18.3 — Serving
- `GET /api/files/[id]?preview=1` serves the thumbnail (cacheable, sandboxed) for images; without one, originals above 3 MB return 404 so the UI falls back to the type icon.
- **Accept:** a grid of large photos loads thumbnails, not originals.

## Deliverables
Schema changes, `lib/thumbnails.ts`, worker handler, preview serving, backfill script, setup docs.
