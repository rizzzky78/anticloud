# UI-04 — File Detail & Lifecycle Configuration

**Goal:** The `/files/[id]` screen — metadata overview, preview/download, the pure-DB edits (rename/move/visibility), and the full configuration envelope (TTL/soft-delete, permanent link, read-only, mention-restricted).

**Depends on:** ui-02, Phases 3–5. **Unlocks:** collaboration (ui-05), sharing (ui-06).

## Steps (agent actions)

### 04.1 — Detail page (RSC)
- `app/(app)/files/[id]/page.tsx`: fetch `getFileMeta(id)` → `FileMetaRecord`; 404 via `not-found` when null/soft-deleted (no leak). Layout: header (name + badges + actions), a `ui/tabs` body — **Overview** / **Notes** / **Sharing** (latter two from ui-05/ui-06).
- Show owner (or "Unowned"), size, type, timestamps, visibility, lifecycle badges.
- **Accept:** detail renders real metadata; inaccessible/missing files 404 cleanly.

### 04.2 — Preview & download
- Overview shows an inline preview for previewable types (image/pdf/text via `GET /api/files/[id]`) and a Download button for all. Fallback to a type icon + "no preview".
- **Accept:** images/pdf preview inline; download streams; unknown types show fallback.

### 04.3 — Metadata edits (shared dialogs)
- `components/file-rename-dialog.tsx` → `renameFile`; `components/file-move-dialog.tsx` → `moveFile`; `components/file-visibility-dialog.tsx` → `setVisibility` (+ `guestAccess` switch). Each Zod-shaped to the action, optimistic, toast + refresh. Reused by ui-02 row menu.
- Respect `isReadOnly` (disable + reason). Gate by `canManage`.
- **Accept:** each edit persists via its action and reflects immediately; MinIO untouched.

### 04.4 — Lifecycle config panel
- `components/file-config-panel.tsx` (`ui/sheet` or a settings card) binding `actions/file-config.ts`:
  - **TTL**: `ui/calendar`/date picker → `setTTL`; clear → `setTTL(null)`. Show countdown badge.
  - **Read-only**: `ui/switch` → `setReadOnly`.
  - **Mention-restricted**: `ui/switch` → `setMentionRestricted` (explain it narrows access to mentioned users).
  - **Permanent link**: generate (`generatePermanentToken`) → show `/api/files/p/[token]` URL with copy button; revoke (`revokePermanentToken`).
- **Accept:** each toggle calls its action, busts caches server-side, and the panel reflects new state.

### 04.5 — Soft-delete & recover
- Delete action → `softDeleteFile` with `ui/alert-dialog` confirm; on success route back to `/files` + toast "Moved to recycle bin". Recover (`recoverFile`) surfaced in the admin recycle bin (ui-09) and, within grace, on detail for superadmin.
- **Accept:** delete soft-deletes (row leaves list, recoverable); recover restores within grace.

## Components used
`ui/tabs`, `ui/sheet`, `ui/card`, `ui/badge`, `ui/dialog`, `ui/alert-dialog`, `ui/calendar`, `ui/switch`, `ui/input`, `ui/select`, `ui/button`, `ui/tooltip`, `ui/sonner`; `lib/format.ts`.

## Out of scope
Tags/mentions/notes tabs → [ui-05](ui-05-collaboration.md); permission grants → [ui-06](ui-06-sharing.md); compression/derived versions → [ui-11](ui-11-bulk.md).
