# Phase 15 — Groups

**Goal:** Share with teams and departments in one step. A group share gives every member access; membership changes take effect immediately.

**Depends on:** Phase 14. **Unlocks:** 16

## Steps (agent actions)

### 15.1 — Schema
- `Group` (`group`: unique name, description, creator), `GroupMember` (`group_member`: `isManager`), `FileGroupPermission` (`file_group_permission`: role, optional expiry, granter; unique `(fileId, groupId)`).
- User runs `bunx prisma migrate dev` / `generate`.

### 15.2 — Resolver
- `getCachedAccess` takes the highest of the direct grant and all unexpired group grants of groups the user belongs to; cache TTL never outlives the earliest expiry.
- `accessibleFilesSql` / `accessibleFilesWhere` include group grants, so listings, search and bulk ZIP see group-shared files.
- Membership changes flush that user's permission cache; group share changes flush the file's cache; maintenance removes expired group grants.
- **Accept:** adding a user to a group with an Editor share lets them replace the file immediately; removing them revokes it.

### 15.3 — Group management
- `actions/groups.ts`: list/get groups; create/delete (system admins); rename, add/remove members, toggle manager (admins + group managers); members may leave. Additions notify the member (`GROUP`). All audited.
- `/groups` page: group list with filter, member management, create/edit/delete dialogs. Sidebar entry.
- **Accept:** an admin creates "Finance", adds members, and makes one a manager who can then add others.

### 15.4 — Group sharing
- `grantGroupRole` / `revokeGroupRole` / `getFileGroupPermissions`; sharing notifies members (`SHARE`).
- `components/group-shares-panel.tsx` in the Sharing tab (group picker, level, expiry, inline level change, revoke).
- "Shared with me" includes group shares (deduplicated to the highest level, shows the group); "Shared by me" counts groups.
- **Accept:** a file shared with a group shows up in every member's Shared tab.

## Deliverables
Group models, resolver and predicate changes, `actions/groups.ts`, `/groups`, group sharing panel, shared view updates.
