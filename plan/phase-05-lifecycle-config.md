# Phase 5 — File Lifecycle & Configuration

**Goal:** The per-file configuration envelope — TTL/expiry with soft-delete + grace window, permanent (token-validated) presigned URLs, read-only mode, and mention-restricted access.

**Depends on:** Phase 4. **Unlocks:** expiry cron (Phase 9), completes the permission order (Phase 2 step 3).

## Steps (agent actions)

### 5.1 — TTL & soft-delete
- Add config fields already on `File` (`expiresAt`, `deletedAt`) wiring: server action to set/clear TTL. **Soft-delete first** (set `deletedAt`), keep the row; hard delete only after a grace window. Superadmins can recover within grace.
- The actual scan/cleanup job is Phase 9 — here, define the contract (what "expired", "soft-deleted", "grace window" mean) and the recover action.
- **Accept:** setting TTL persists; soft-deleted files are hidden from normal lists but recoverable by superadmin within grace.

### 5.2 — Permanent presigned URL (token, not capability)
- Server action to generate a long-lived presigned-style URL stored on the File row as a **token**. Public access route validates the token **and** the file's current permission/visibility state before serving via `lib/storage`. Changing visibility or revoking access invalidates the URL even though the token is unchanged.
- **Accept:** revoking access / flipping to private makes a previously working permanent URL stop serving.

### 5.3 — Read-only mode
- Server action to set/lift `isReadOnly`. Application-layer soft lock: upload-replace, delete, and destructive metadata ops are rejected on read-only files with a clear reason. Superadmin can override. (Replace already honors this from Phase 3 — extend to delete + relevant edits.)
- **Accept:** mutations on a read-only file are rejected for non-superadmins; lifting the flag re-enables them.

### 5.4 — Mention-restricted access
- Add the mention relation contract (full table lands in Phase 6) but implement the **gate**: when `isMentionRestricted`, permission resolution (Phase 2 order, step 3) denies users not in the file's mention list, narrowing below normal RBAC. Additive restriction only.
- Bust `perm:` cache when restriction or mention list changes.
- **Accept:** with restriction on, a user who would otherwise have viewer access via public visibility is denied unless mentioned.

### 5.5 — Config surface
- Single `actions/file-config.ts` exposing TTL, presigned, read-only, and mention-restriction toggles, each permission-gated and audited (Phase 10 stub). Bust `filemeta:`/`perm:` as appropriate.
- **Accept:** all four config toggles work through one audited, permission-gated surface.

## Deliverables
TTL/soft-delete + recover actions, presigned-token route + generator, read-only enforcement extension, mention-restriction gate, `actions/file-config.ts`.

## Out of scope
The expiry **cron worker** (Phase 9); mention **table + notifications** (Phase 6).
