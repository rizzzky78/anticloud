# Phase 11 — Security Hardening

**Goal:** Close the access-control and content-serving gaps found in the post-launch code review, and move deployment to plain HTTP (no reverse proxy).

**Depends on:** Phases 0–10. **Unlocks:** 12+

## Steps (agent actions)

### 11.1 — Role cannot be set by clients
- `lib/auth.ts`: `user.additionalFields.role.input = false` so sign-up / update-user bodies cannot set `role`.
- **Accept:** `POST /api/auth/sign-up/email` with `role: "SUPERADMIN"` creates a `VIEWER`.

### 11.2 — Single permission resolver
- `lib/permissions.ts`: `resolveAccess` is the only rule set (superadmin → owner → unowned+ADMIN → clamped grant / mention-gated visibility, max wins). Add `accessibleFilesSql(user)` and `accessibleFilesWhere(user)` mirroring it plus soft-delete/expiry filters; remove `getPermittedFiles`.
- Download route, file list, folder list, search, bulk ZIP (route + worker) use the resolver/predicates.
- `lib/file-access.ts` `assertWriteAccess` = resolver level ≥ ADMIN (global ADMINs no longer manage private files they cannot read).
- **Accept:** a mention-restricted PUBLIC file is not listed, searchable, downloadable or zippable by unmentioned users; soft-deleted/expired files never enter a ZIP.

### 11.3 — Safe content serving
- `lib/content-headers.ts` `safeContentHeaders()`: inline only for raster images, audio, video, PDF; text-like served as `text/plain`; SVG under script-blocking CSP; everything else `attachment`. Always `nosniff`; sandbox CSP except PDF. `?download=1` forces attachment.
- Used by `GET /api/files/[id]` and `GET /api/files/p/[token]`.
- **Accept:** an uploaded `text/html` file never renders as HTML on the app origin.

### 11.4 — Data minimization
- Search results drop `objectKey` and `permanentUrlToken` (`SearchResult` type). Detail page never sends `objectKey`; token only to managers.
- Search scope SQL is composed with `Prisma.sql` (no `$queryRawUnsafe`); cache keyed by a global epoch so permission changes invalidate every user's cached results.
- `searchUsers` requires ≥ 2 chars; `getFilePermissions` requires VIEWER.
- **Accept:** search payload contains no storage keys or tokens.

### 11.5 — Collaboration gates & audit
- `requireContributor()`: notes and tags need ADMIN level, an explicit grant, or a mention — not plain public visibility.
- Audit `note.save`, `tag.add/remove`, `mention.add/remove`. Grants validate target user / reject owner; revoke is idempotent.
- `CRON_SECRET` required (≥ 16 chars), no default.
- **Accept:** a random viewer of a public file cannot edit its note or tags.

### 11.6 — HTTP deployment
- Remove `nginx/` and the compose service; the app publishes `${APP_PORT:-3070}:3000` over HTTP. Update `.env.example`, `SETUP.md`, `README.md`.
- **Accept:** `docker compose up` serves the app on `http://<host>:3070`; uploads are no longer capped at 25 MB by a proxy.

## Deliverables
`lib/permissions.ts`, `lib/file-access.ts`, `lib/content-headers.ts`, `lib/search.ts`, hardened routes/actions, compose/env/docs without nginx.
