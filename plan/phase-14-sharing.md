# Phase 14 — Sharing v2 (people + links)

**Goal:** Make sharing the core intranet workflow: share a file with colleagues at a chosen level (optionally time-limited), see everything shared with you, and share outside accounts with controlled public links.

**Depends on:** Phase 13. **Unlocks:** 15, 21

## Steps (agent actions)

### 14.1 — Share tiers
- `Role` gains `EDITOR` (file-level only; rejected as a system role). Grant tiers: Viewer (`VIEWER`), Editor (`EDITOR`), Manager (`ADMIN`).
- Resolver: grants are no longer clamped to the recipient's system role (system `GUEST` stays read-only; no grant confers `SUPERADMIN`). Editors may upload new versions, restore versions, and edit notes/tags (`assertEditAccess`, `requireContributor` = EDITOR+ or mentioned). Deleting versions and all manage actions stay Manager+.
- **Accept:** a VIEWER-role user shared a file as Editor can replace it; shared as Viewer cannot.

### 14.2 — Expiring grants & notifications
- `FilePermission.expiresAt`; the resolver, SQL predicates, permission listing and "Shared with me" ignore expired grants; permission cache never outlives a grant; maintenance deletes expired grants.
- Granting or changing a level notifies the recipient (`SHARE` notification). Self-grants and owner grants are rejected.
- **Accept:** a 1-day share stops working after a day without manual revocation.

### 14.3 — Shared views
- `lib/shares.ts` + `/shared` page: "Shared with me" (level, sharer, expiry, leave share) and "Shared by me" (people and active link counts). Sidebar entry.
- `leaveShare` action lets a recipient drop a share.
- **Accept:** a newly shared file appears in the recipient's Shared tab.

### 14.4 — Public share links
- `ShareLink` model: token (192-bit), label, optional expiry, scrypt password hash, download cap, counters, revocation.
- `lib/share-links.ts` (resolve, password verify, HMAC unlock cookie, atomic download counting); actions `listShareLinks`, `createShareLink`, `revokeShareLink`, `unlockShareLink` (rate-limited).
- Public `/s/[token]` landing page (image preview, password form) and `/api/s/[token]` download route; proxy allows `/s/`. Mention-restricted files cannot be link-shared.
- **Accept:** a password-protected link with a 3-download cap serves exactly 3 downloads after unlocking.

### 14.5 — UI
- Sharing panel: Viewer/Editor/Manager picker, expiry picker, inline level change, share-link manager (`components/share-links-panel.tsx`). File detail: "Upload new version" for editors; tags editable by editors.
- **Accept:** managers share and manage links from the Sharing tab.

## Deliverables
Schema (`EDITOR`, `FilePermission.expiresAt`, `ShareLink`), resolver changes, `lib/shares.ts`, `lib/share-links.ts`, `actions/share-links.ts`, `/shared`, `/s/[token]`, `/api/s/[token]`, sharing UI.
