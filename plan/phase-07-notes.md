# Phase 7 — File Notes

**Goal:** Versioned, shared-per-file freeform notes with an authorship audit trail and Redis caching of the current note.

**Depends on:** Phase 4. **Unlocks:** search (8) indexes note content.

## Steps (agent actions)

### 7.1 — Note schema (versioned)
- Add `FileNote` to `prisma/schema.prisma`: `id`, `fileId`, `version`, `body`, `authorId`, `createdAt`. Each edit is a **new row**, never an overwrite. Current note = highest `version` for the file. Index `(fileId, version desc)`.
- Migrate.
- **Accept:** editing a note inserts a new version row; previous versions remain.

### 7.2 — Note read/write actions
- `actions/notes.ts`: `getCurrentNote(fileId)` (latest version), `saveNote(fileId, body)` (creates next version, records `authorId`). Permission-gated — any user with access to the file can read/write the shared note; respect read-only for writes.
- **Accept:** save creates a new version with the editor's identity; read returns the latest.

### 7.3 — Note cache
- Cache the current note for hot files in Redis (`filemeta:`-adjacent or dedicated `note:` key). Invalidate **immediately** on any note write — no stale reads during edits.
- **Accept:** repeated reads hit cache; a write busts it before returning.

### 7.4 — Version history (restricted)
- `actions/notes.ts`: `getNoteHistory(fileId)` returning all versions — accessible only to admins and the file owner.
- **Accept:** owner/admin can list versions with authors+timestamps; a plain viewer cannot.

### 7.5 — Notes UI
- Note editor + (owner/admin) history view using existing shadcn components and current color scheme.
- **Accept:** access-holders edit the shared note; owner/admin can browse history.

## Deliverables
`FileNote` model + migration, `actions/notes.ts` (current/save/history), note cache, notes UI.

## Out of scope
Full-text indexing of note bodies — Phase 8.
