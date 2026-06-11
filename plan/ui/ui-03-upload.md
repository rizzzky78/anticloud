# UI-03 — Upload & Replace

**Goal:** A global upload dialog (drag-drop + picker) posting to `POST /api/files/upload` with progress, plus the binary-replace flow (`PUT /api/files/[id]/replace`) respecting read-only.

**Depends on:** ui-00, Phase 3. **Unlocks:** populates ui-02.

## Steps (agent actions)

### 03.1 — Upload dialog
- `components/upload-dialog.tsx` (Client): `ui/dialog` with a dropzone + file input. On submit, build `FormData` matching the upload handler's expected fields (file + metadata: `displayName`, `folderPath`, `visibility`, optional `guestAccess`). Validate client-side (size cap, required) with Zod before sending.
- Trigger from the sidebar/header "Upload" button and the empty-state CTA.
- **Accept:** selecting a file + submit creates the file; it appears in `/files` after `router.refresh()`.

### 03.2 — Progress & result
- Use `XMLHttpRequest`/`fetch` with progress → `ui/progress` bar per file. On success toast + close; on error toast the handler's safe message (no stack traces). Handle the upload rate-limit (429) explicitly.
- **Accept:** progress animates; success/failure are toasted; 429 shows a clear "slow down" message.

### 03.3 — Multi-file queue (optional, same dialog)
- Support queueing several files with individual progress rows (`ui/scroll-area` + `ui/progress`). Sequential or limited-parallel uploads.
- **Accept:** multiple files upload with per-file status.

### 03.4 — Replace binary
- `components/replace-file-dialog.tsx`: on a file detail/row "Replace" action, `PUT /api/files/[id]/replace` with the new binary. **Block when `isReadOnly`** (disabled + reason) unless the user can override (superadmin). Confirm via `ui/alert-dialog` (destructive).
- **Accept:** replace updates size/mime/updatedAt; read-only files reject with the reason surfaced.

### 03.5 — Folder target
- Let the dialog target the current `folderPath` (from browser context) or pick another; pass it in the FormData.
- **Accept:** uploaded file lands in the chosen folder and shows there.

## Components used
`ui/dialog`, `ui/alert-dialog`, `ui/progress`, `ui/input`, `ui/field`, `ui/select`, `ui/switch`, `ui/scroll-area`, `ui/button`, `ui/sonner`.

## Out of scope
Compression of uploaded files → [ui-11](ui-11-bulk.md) (Phase 9). Upload is never auto-compressed.
