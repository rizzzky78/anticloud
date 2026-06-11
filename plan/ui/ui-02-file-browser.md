# UI-02 — File Browser (Date-Grouped)

**Goal:** The primary `/files` screen — date-grouped file list rendered from `listFilesGrouped()`, with file-type icons, status badges, per-row actions, pagination, and folder navigation.

**Depends on:** ui-00, Phases 3–5. **Unlocks:** detail (ui-04), upload entry (ui-03).

## Steps (agent actions)

### 02.1 — Files page (RSC)
- `app/(app)/files/page.tsx` (Server Component): call `listFilesGrouped(user, { folderPath, pageSize, offset })` and render `FileBucket[]`. Read `folderPath`/page from `searchParams`. Use the pre-computed `bucket.label` as section headings — **do not regroup**.
- **Accept:** files appear under Today / Yesterday / This Week / This Month / month buckets exactly as returned.

### 02.2 — File row + bucket section
- `components/file-list.tsx` + `components/file-row.tsx`: each row shows type icon (by `mimeType`), `displayName`, `formatBytes(size)`, `formatRelativeDate(createdAt)`, and badges: visibility (`public`/`private`), `guestAccess`, `isReadOnly`, mention-restricted, TTL (`expiresAt`). Row click → `/files/[id]`.
- Render buckets with `ui/separator` headings; use `ui/table` or a card list (pick one, consistent with scaffold `data-table`).
- **Accept:** badges reflect the record; clicking a row opens detail.

### 02.3 — Row actions menu
- Per-row `ui/dropdown-menu`: Download (`GET /api/files/[id]`), Rename, Move, Change visibility, Configure, Share, Delete. Gate destructive/config items by `canManage(file)` (`lib/ui-access.ts`); disable mutations when `isReadOnly` with a tooltip reason.
- Wire Rename/Move/Visibility to the dialogs in [ui-04](ui-04-file-detail.md) (shared components).
- **Accept:** actions appear per permission; download streams the file; read-only rows disable mutate actions.

### 02.4 — Empty / loading / error
- Use `components/loading-rows.tsx` (Suspense fallback), `components/empty-state.tsx` ("No files yet — upload your first file" with an upload CTA), and toast on fetch error.
- **Accept:** a fresh account shows the empty state with a working upload CTA.

### 02.5 — Pagination & folders
- `ui/pagination` driven by `pageSize`/`offset` via `searchParams`. Folder context via `ui/breadcrumb` in the header (`folderPath`); navigating sets `?folderPath=`.
- **Accept:** paging and folder filtering update the list via URL state (RSC re-fetch).

## Components used
`ui/table`, `ui/card`, `ui/badge`, `ui/dropdown-menu`, `ui/separator`, `ui/breadcrumb`, `ui/pagination`, `ui/tooltip`, `ui/skeleton`, `ui/empty`; scaffold `data-table` patterns; `lib/format.ts`.

## Out of scope
Multi-select/bulk toolbar → [ui-11](ui-11-bulk.md) (blocked on Phase 9).
