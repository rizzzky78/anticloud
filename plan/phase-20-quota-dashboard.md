# Phase 20 — Storage Quota & Usage

**Goal:** Users see what their storage is spent on; admins can cap per-user storage and see system-wide usage. The leftover demo dashboard is removed.

**Depends on:** Phase 13 (version sizes count). **Unlocks:** —

## Steps (agent actions)

### 20.1 — Quota model
- `User.storageQuota` (bytes; null = `DEFAULT_STORAGE_QUOTA_MB` env, default 0 = unlimited; 0 = unlimited). Superadmins are never limited. User runs `bunx prisma migrate dev` / `generate`.
- `lib/quota.ts`: usage = owned live files + recycle bin + version history; `assertWithinQuota`, `usageByCategory`, `usageByOwner`.
- Upload and replace reject before streaming when the owner would exceed the quota.
- **Accept:** a user with a 100 MB quota cannot upload past it; emptying the recycle bin frees space.

### 20.2 — Admin quota management
- `getUsers` returns usage and quota; `setUserQuota` (admins; superadmin-only for superadmins; audited). Users table "Storage" column with quota dialog (default / unlimited / custom MB).
- **Accept:** an admin sets a custom quota and it applies on the next upload.

### 20.3 — Storage page
- `/storage`: usage vs quota, split into files / recycle bin / versions, breakdown by type, ten largest files; admins also see totals, top users and system breakdown. Sidebar entry.
- Remove `app/dashboard` and its demo-only components (`chart-area-interactive`, `data-table`, `section-cards`, `nav-documents`, `search-ui`).
- **Accept:** the Storage page numbers match the sum of the user's files.

## Deliverables
Quota schema/env, `lib/quota.ts`, enforcement, admin quota UI, `/storage`, demo scaffold removed.
