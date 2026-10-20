# Phase 16 — Folders as Entities

**Goal:** Folders become real objects: they can be created empty, renamed, moved, deleted as a unit, owned, and shared so that everything inside inherits access — the "team folder" workflow of an intranet drive.

**Depends on:** Phase 15. **Unlocks:** 17

## Steps (agent actions)

### 16.1 — Schema
- `Folder` (`folder`: unique normalized `path`, `name`, `ownerId`) and `FolderPermission` (`folder_permission`: user XOR group, role, optional expiry, granter).
- Files keep `folderPath`; paths without any Folder row in their chain remain an open namespace (backward compatible).
- User runs `bunx prisma migrate dev` / `generate`.

### 16.2 — Inherited access
- `lib/folders.ts`: `folderGrantForPath()` — owner of any containing folder = ADMIN; folder shares (direct or group) cascade to the subtree; system guests capped at VIEWER. `getFolderAccess()` → `canUpload` (open namespace or EDITOR+) and `canManage` (ADMIN+, or sole owner of every file in a legacy folder).
- `getCachedAccess` and `accessibleFilesSql` include folder grants (`starts_with` prefix match). Bulk ZIP uses `filterAccessibleFileIds()` (the Prisma-only predicate was removed so every path honors folder grants).
- Upload and file move require `canUpload` on the target folder; moves flush the file's permission cache.
- **Accept:** sharing `/Finance` as Viewer lets a user list, open and download every file below it, including files added later.

### 16.3 — Folder operations
- `actions/folders.ts`: `getFolderInfo`, `createFolder`, `renameFolder`, `moveFolder` (prefix rewrite of folder rows and file paths in one transaction; conflicts rejected; not into itself), `deleteFolder` (files to recycle bin, rows removed). Caches flushed, all audited.
- **Accept:** renaming a folder moves its whole subtree; deleting it puts its files in the recycle bin.

### 16.4 — Folder sharing
- `listFolderShares`, `shareFolder` (user or group, level, expiry; notifies recipients), `revokeFolderShare`. Legacy folders get a Folder row on first share/rename.
- Folder listings include folder rows the user owns or can reach through a share; "Shared with me" lists shared folders. Maintenance removes expired folder grants.
- **Accept:** a group-shared folder appears in members' Shared tab and file browser.

### 16.5 — UI
- `components/folder-toolbar.tsx` on the Files page: New folder, Share folder, Rename, Move, Delete, owner badge. `components/folder-share-dialog.tsx` for people/group shares.
- **Accept:** all folder operations are reachable from the folder being viewed.

## Deliverables
Folder models, `lib/folders.ts`, resolver/predicate updates, `actions/folders.ts`, folder toolbar + share dialog, shared-folder listing.
