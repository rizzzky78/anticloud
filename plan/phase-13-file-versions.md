# Phase 13 — File Versions

**Goal:** Replacing a file never destroys data. Every prior binary is kept as a version that can be downloaded, restored, or deleted.

**Depends on:** Phase 12. **Unlocks:** 20, 23

## Steps (agent actions)

### 13.1 — Schema
- `FileVersion` (`file_version`): `fileId`, `version`, `objectKey` (unique), `mimeType`, `size`, `uploadedById`, `uploadedAt`, `createdAt` (superseded at); unique `(fileId, version)`.
- `File`: `version` (current number), `contentUploadedById`, `contentUpdatedAt`.
- User runs `bunx prisma migrate dev` / `generate`.
- **Accept:** schema migrates; existing files start at version 1.

### 13.2 — Versioned replace
- `lib/versions.ts` `replaceFileContent()`: optimistic swap of the File row to a NEW object key and snapshot of the outgoing binary in one transaction; `pruneVersions()` keeps `FILE_VERSION_LIMIT` (env, default 20; 0 disables history).
- `PUT /api/files/[id]/replace` writes to a new key, uses the central resolver, rate-limits, cleans up the new object on failure.
- **Accept:** replacing twice leaves versions 1 and 2 in history and version 3 live.

### 13.3 — Restore / delete / download
- `restoreFileVersion()` (current content snapshotted first), `deleteFileVersion()`; actions `getFileVersions`, `restoreVersion`, `deleteVersion` (managers, read-only respected, audited).
- `GET /api/files/[id]/versions/[versionId]` streams a version to anyone who can read the file.
- Hard deletion (maintenance purge + permanent delete) removes version objects.
- **Accept:** restoring v1 makes it live and keeps the replaced content as a new history entry.

### 13.4 — UI
- `components/file-versions-panel.tsx` in a new "Versions" tab on file detail; replace dialog explains that old content is kept.
- **Accept:** users can download any version; managers can restore/delete with confirmation.

## Deliverables
Schema changes, `lib/versions.ts`, `actions/versions.ts`, version route, rewritten replace route, versions panel.
