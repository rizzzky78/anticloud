# Phase 17 — Personal Views & Browser UX

**Goal:** Faster everyday navigation: star favourites, jump back to recent work, sort the browser, and upload whole folder trees.

**Depends on:** Phase 16. **Unlocks:** —

## Steps (agent actions)

### 17.1 — Starred files
- `FileStar` (`file_star`, PK `(userId, fileId)`). `actions/stars.ts` `setStarred` (requires read access) / `isStarred`.
- Listings return a per-user `starred` flag; `components/star-button.tsx` in file rows (hover reveal) and the detail header. `/starred` page.
- **Accept:** starring a file adds it to Starred; losing access hides it there.

### 17.2 — Recent files
- `listRecentFiles()` derives the last 30 days of the user's file activity (upload, open, replace, rename, move, version restore, notes, tags) from the audit trail, filtered by current access. `/recent` page.
- **Accept:** opening a file puts it at the top of Recent.

### 17.3 — Sorting
- `listFilesGrouped` accepts `sort` (`date` | `name` | `size`) and `dir`; name/size return a single flat list. `components/sort-select.tsx` stores the choice in the URL; pagination keeps it.
- **Accept:** "Largest first" orders the folder by size.

### 17.4 — Folder upload
- Upload dialog "Upload a whole folder" (`webkitdirectory`): each file keeps its relative directory and is uploaded under the target folder, recreating the tree. Upload rate limit raised to 300/min for many-file uploads.
- **Accept:** uploading `Reports/2024/q1.pdf` from a folder pick lands at `<target>/Reports/2024`.

### 17.5 — Navigation
- Sidebar: Recent, Starred (plus Shared and Groups from earlier phases).

## Deliverables
`FileStar` model, `actions/stars.ts`, star button, `/starred`, `/recent`, sort control, folder upload.
