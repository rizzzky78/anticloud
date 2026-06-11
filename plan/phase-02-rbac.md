# Phase 2 — RBAC & Permission Resolution

**Goal:** Two-level RBAC (system + file) with a single, cached, ordered permission-resolution function and a permission middleware that all file-mutation routes pass through.

**Depends on:** Phase 1. **Unlocks:** all file features (3+).

## Roles
`superadmin` · `admin` · `viewer` · `guest` (guest = unauthenticated).

## Permission resolution order (canonical — implement exactly)
1. `superadmin` → allow (bypass everything).
2. File-level explicit grant for this user → use that grant's level.
3. Mention-restriction gate (Phase 5): if file is mention-restricted and user not mentioned → deny, regardless of below.
4. File visibility: `public` (authenticated, + guest if guest-enabled) → viewer-level; `private` → continue.
5. Otherwise → deny.
> File-level grants override system level **downward, never upward**: a system `guest` cannot exceed `viewer` at file level.

## Steps (agent actions)

### 2.1 — Permission models
- Add to `prisma/schema.prisma`: `FilePermission` (fileId, userId, role, grantedBy, timestamps; unique on fileId+userId). Reference the (Phase 3) file table — coordinate so models compose. Add enum `Role`.
- Migrate.
- **Accept:** grants can be written/read for a user-file pair.

### 2.2 — Resolver
- Create `lib/permissions.ts` — `resolveAccess(user, file): AccessLevel` implementing the order above as a pure function over already-loaded data, plus `requireAccess(user, file, min)` that throws `AppError(403)` when insufficient.
- **Accept:** unit-style checks cover superadmin bypass, explicit grant, public/private, downward-only clamp.

### 2.3 — Permission cache
- Cache resolved decisions in Redis (`perm:` namespace, key `perm:{userId}:{fileId}`) with TTL. Invalidate on: file permission change, file visibility change, user role change.
- **Accept:** second resolution for the same pair is a cache hit; relevant mutation busts the key.

### 2.4 — Permission middleware
- Create `lib/with-permission.ts` (or middleware wrapper) used by **all** file-mutation handlers/actions: loads file + user, resolves access, attaches level, rejects before handler logic. Handlers trust it and **never re-check**.
- **Accept:** a mutation route without sufficient level is rejected centrally; handler body is not reached.

### 2.5 — Role management surface
- `actions/` server action for superadmin/admin to set user system roles and for owners/admins to grant/revoke file-level roles. Zod-validate; write audit entries (Phase 10 contract — stub now, fill later). Bust perm cache on change.
- **Accept:** role/grant changes persist and invalidate caches.

## Deliverables
`lib/permissions.ts`, `lib/with-permission.ts`, permission Prisma models + migration, role/grant server actions.

## Out of scope
Mention-restriction *configuration* (Phase 5) — only leave the hook (step 3 of the order) ready.
