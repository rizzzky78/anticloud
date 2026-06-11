# UI-05 — Collaboration: Tags, Mentions & Notes

**Goal:** The file-scoped collaboration surfaces — tag editor with Redis autocomplete, mention management, and the versioned notes panel (reuse the existing `file-note-panel`).

**Depends on:** ui-04, Phases 6–7. **Unlocks:** richer search (ui-07).

## Steps (agent actions)

### 05.1 — Tag editor
- `components/file-tags.tsx`: render current tags as removable `ui/badge`s. Add via `ui/combobox`/`ui/command` backed by `GET /api/tags/autocomplete` (prefix → frequency-ranked). Apply `addTag`, remove `removeTag`. Respect read-only + `canManage`.
- **Accept:** typing a prefix suggests tags; adding/removing persists and updates instantly.

### 05.2 — Mentions manager
- `components/file-mentions.tsx`: list mentioned users (`ui/avatar` + name); add via a user picker (`ui/command`) → `addMention`; remove → `removeMention`. Note inline that mentions notify the user and (if mention-restricted) grant access.
- **Accept:** mentioning a user persists, triggers their notification, and (when restricted) grants access; un-mention reverses it.

### 05.3 — Notes panel (reuse)
- Mount `components/file-note-panel.tsx` in the detail **Notes** tab. Ensure it binds `getCurrentNote` (read) + `saveNote` (write, creates a new version). Show author + timestamp of the current version. Disable editing on read-only / no-access.
- **Accept:** any user with access edits the shared note; save creates a new version recorded against them.

### 05.4 — Note history (owner/admin)
- `components/note-history.tsx`: a `ui/sheet`/`ui/dialog` listing `getNoteHistory(fileId)` versions (author, timestamp, body diff/preview). Visible only to owner/admin (handler already gates; hide the entry otherwise).
- **Accept:** owner/admin browse versions; a plain viewer never sees the history entry or data.

## Components used
`ui/badge`, `ui/combobox`, `ui/command`, `ui/avatar`, `ui/sheet`, `ui/dialog`, `ui/textarea`, `ui/scroll-area`, `ui/button`, `ui/tooltip`, `ui/sonner`; scaffold `file-note-panel`.

## Out of scope
The global search index that consumes tags/notes/mentions → [ui-07](ui-07-search.md).
