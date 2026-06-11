# UI-06 — Sharing & File-Level Permissions

**Goal:** A per-file share dialog where owners/admins grant and revoke file-level roles, surfaced from the detail **Sharing** tab and the row action menu.

**Depends on:** ui-04, Phase 2. **Unlocks:** —

## Steps (agent actions)

### 06.1 — Share dialog
- `components/file-share-dialog.tsx` (Client): list current grants (user + role `ui/badge` + granted-by). Add a grant: user picker (`ui/command`) + role `ui/select` (`VIEWER`/`ADMIN`) → `grantFileRole`. Revoke per row → `revokeFileRole` (`ui/alert-dialog` confirm).
- Enforce the downward-only rule in the UI: don't offer roles above the actor's level; handler still gates.
- **Accept:** granting/revoking persists, busts the perm cache (server-side), and the list updates.

### 06.2 — Visibility + guest summary
- Top of the dialog summarizes effective access: visibility (`public`/`private`), `guestAccess`, mention-restricted — with quick links to the config panel (ui-04) to change them. Read-only display of the resolution outcome.
- **Accept:** the summary matches the file's actual visibility/restriction flags.

### 06.3 — Permission-gated entry
- Show the Share action only when `canManage(file)` (owner/admin/superadmin). Others see a read-only "who has access" view if appropriate.
- **Accept:** non-managers cannot open the grant controls.

## Components used
`ui/dialog`, `ui/command`, `ui/select`, `ui/badge`, `ui/avatar`, `ui/alert-dialog`, `ui/button`, `ui/separator`, `ui/sonner`.

## Out of scope
System-wide role management (`setSystemRole`) → [ui-09](ui-09-admin.md).
