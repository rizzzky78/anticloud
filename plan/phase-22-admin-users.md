# Phase 22 — Admin User Lifecycle

**Goal:** Administrators manage the full account lifecycle on an intranet without email: create accounts, reset passwords, sign users out, disable leavers, and delete accounts while keeping their files.

**Depends on:** Phase 19. **Unlocks:** —

## Steps (agent actions)

### 22.1 — Disabled accounts
- `User.disabledAt`, `User.disabledReason` (exposed to Better-Auth as an input-less additional field). User runs `bunx prisma migrate dev` / `generate`.
- Better-Auth `databaseHooks.session.create.before` rejects sign-in for disabled users (403 with message); `getCurrentUser` ignores sessions of disabled users.
- **Accept:** a disabled user is signed out at once and sees "account disabled" when signing in.

### 22.2 — Session-cache correctness
- `lib/auth-admin.ts`: `refreshUserSessions` (re-snapshot the user into Redis-cached sessions), `revokeAllUserSessions`, `hashPassword` via Better-Auth's context. Role changes and avatar changes refresh sessions so they apply immediately.

### 22.3 — Lifecycle actions
- `actions/admin-users.ts`: `createUserAccount` (initial password, role; superadmins only for superadmin), `setUserDisabled`, `signOutUserEverywhere`, `resetUserPassword`, `deleteUserAccount` (optional transfer of files and folders, otherwise unowned). Self-actions blocked; superadmin targets need a superadmin; all audited.
- `ALLOW_SIGNUP` env (default true) toggles public self-registration; minimum password length 8.
- **Accept:** deleting a user with transfer moves every file they owned to the chosen colleague.

### 22.4 — UI
- Users table: "Add user" dialog, Disabled / 2FA badges, per-user actions menu (reset password, sign out everywhere, disable/enable, delete with transfer). Page renamed "Users & Accounts".

## Deliverables
Schema fields, auth hooks, `lib/auth-admin.ts`, `actions/admin-users.ts`, admin dialogs, signup toggle.
