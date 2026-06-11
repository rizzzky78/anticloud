# Phase 1 — Authentication

**Goal:** Better-Auth username/password login, sessions backed by Redis with sliding TTL, middleware that resolves identity from the cookie, and Redis-based login rate limiting.

**Depends on:** Phase 0. **Unlocks:** RBAC (2), every protected route.

> Read the Better-Auth + Next.js 16 middleware docs before coding. Username/password **only** — no OAuth, no magic links.

## Steps (agent actions)

### 1.1 — Better-Auth core
- Add Better-Auth. Create `lib/auth.ts` configuring username+password, Prisma adapter (`lib/db.ts`), secret/URL from `lib/env.ts`. HTTP-only secure cookie session.
- Add the auth models to `prisma/schema.prisma` (user, session, account per Better-Auth schema). Add a `role` field on user (default `viewer`) — used in Phase 2.
- Run migration.
- **Accept:** `bun prisma migrate` applies; auth tables exist.

### 1.2 — Auth route handler
- Mount Better-Auth handler at `app/api/auth/[...all]/route.ts`.
- **Accept:** sign-up + sign-in via the endpoint create a user and set the session cookie.

### 1.3 — Session in Redis (sliding TTL)
- Configure session storage/secondary cache in Redis (`session:` namespace) with a TTL. On each authenticated request, refresh TTL for active users. Expired sessions silently force re-auth.
- **Rule:** session validation reads Redis, **never** the DB on the hot path.
- **Accept:** session key appears in Redis on login; TTL extends on activity; removing the key forces re-auth.

### 1.4 — Identity middleware
- Create `middleware.ts` (root) that resolves session from cookie, attaches identity to request context, and rejects unauthenticated requests to protected matchers before any handler runs. Public matchers: auth endpoints, login page, guest-public file routes (added later).
- Create `lib/auth-context.ts` — server helper `getCurrentUser()` for Server Actions/handlers reading the resolved session.
- **Accept:** hitting a protected route without a cookie is rejected at middleware; with a valid cookie, `getCurrentUser()` returns identity.

### 1.5 — Login rate limiting
- Create `lib/rate-limit.ts` — Redis counter helper (`ratelimit:` namespace) keyed by `ip+username`. On the login path: after N failures in a window, temporarily lock and **delay** further attempts (not instant-reject) to avoid timing enumeration.
- **Accept:** repeated bad logins trip the limiter; lock auto-clears after the window.

### 1.6 — Login UI wiring
- Build/reconnect the login page using existing shadcn components + current color scheme (do not modify `components/ui/*`). Zod-validate the form client+server. Graceful, generic error messaging (no user enumeration).
- **Accept:** valid creds → authenticated redirect; invalid → generic error; rate-limit reflected in UI.

## Deliverables
`lib/auth.ts`, `lib/auth-context.ts`, `lib/rate-limit.ts`, `app/api/auth/[...all]/route.ts`, `middleware.ts`, login page/form, auth Prisma models + migration.

## Out of scope
Role enforcement logic (Phase 2). This phase only *stores* the role field.
