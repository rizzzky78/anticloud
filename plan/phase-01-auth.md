# Phase 1 — Authentication

**Goal:** Better-Auth email+password login (with the username plugin for username-based sign-in), sessions stored in Redis via Better-Auth secondary storage with sliding expiry, an optimistic `proxy.ts` redirect layer, server-side enforcement in the Data Access Layer, and Better-Auth's built-in Redis-backed login rate limiting.

**Depends on:** Phase 0. **Unlocks:** RBAC (2), every protected route.

> Read the Better-Auth "Next.js integration", "Email & Password", "Username plugin", "Database / secondary storage", and "Rate limit" docs, plus the Next.js 16 proxy docs, before coding. No OAuth, no magic links. Username login is via the **username plugin** on top of email+password — email is still stored at the account level (placeholder allowed).

## Steps (agent actions)

### 1.1 — Better-Auth core

- Add Better-Auth. Create `lib/auth.ts`: `emailAndPassword: { enabled: true }`, the `username()` plugin, Prisma adapter (`lib/db.ts`), secret/baseURL from `lib/env.ts`. Cookies are HTTP-only and Secure-in-production by default.
- Add a `role` field on user via `user.additionalFields` (default `viewer`) — used in Phase 2.

### 1.2 — Auth route handler

- Mount the handler at `app/api/auth/[...all]/route.ts` using `toNextJsHandler(auth)`.
- **Accept:** sign-up + sign-in via the endpoint create a user and set the session cookie. Sign-up payload includes email + name + password + username.

### 1.3 — Session in Redis (secondary storage + sliding expiry)

- Configure `secondaryStorage` (Redis `get`/`set`/`delete` with TTL). Better-Auth uses it for session data automatically.
- Set sliding expiry with `session.expiresIn` and `session.updateAge` (refreshes the session as users stay active). Optionally enable `session.cookieCache` to avoid a Redis read on every request.
- **Rule:** with secondaryStorage configured, session validation reads Redis, never the DB on the hot path. (Do **not** hand-roll a `session:` namespace — Better-Auth manages the keys.)
- **Accept:** session record appears in Redis on login; expiry extends on activity; deleting the Redis key forces re-auth.

### 1.4 — Proxy (optimistic) + DAL enforcement

- Create `proxy.ts` (root, Node runtime) doing an **optimistic** check only: `getSessionCookie(request)` → redirect to login if absent. This is a UX redirect, **not** the security boundary. Do not attach identity to request context (proxy may run at the CDN edge of your render code; handlers must re-resolve).
- Public matchers: auth endpoints, login page, guest-public file routes (added later).
- Create `lib/auth-context.ts` — `getCurrentUser()` calling `auth.api.getSession({ headers: await headers() })`. **This is the real gate**: every protected Server Action / route handler / RSC calls it and rejects if null.
- **Accept:** hitting a protected route without a cookie is redirected at the proxy; a forged/expired cookie that slips past the proxy is still rejected by `getCurrentUser()`; with a valid cookie, `getCurrentUser()` returns identity.

### 1.5 — Login rate limiting (built-in)

- Configure Better-Auth `rateLimit: { enabled: true, storage: "secondary-storage" }` with `customRules` for `/sign-in/email` (and `/sign-up/email`). Counters live in Redis via the same secondaryStorage. Keyed by IP (avoid keying on username — that leaks account existence).
- Rely on Better-Auth's enumeration protections (synthetic/constant-time sign-up responses) rather than per-username delays. If a delay-based throttle is truly required, implement it as a custom layer and document that it overrides the default 429+Retry-After behavior.
- **Accept:** repeated bad logins trip the limiter (429 + Retry-After); the lock auto-clears after the window.

### 1.6 — Login UI wiring

- Build/reconnect the login page using existing shadcn components + current color scheme (do not modify `components/ui/*`). Zod-validate client+server. Generic error messaging (no user enumeration) and surface the 429 / Retry-After state.
- **Accept:** valid creds → authenticated redirect; invalid → generic error; rate-limit reflected in UI.

## Deliverables

`lib/auth.ts`, `lib/auth-context.ts`, `app/api/auth/[...all]/route.ts`, `proxy.ts`, login page/form, auth Prisma models (user/session/account/verification + username fields + role) + migration. (No custom `lib/rate-limit.ts` — use Better-Auth's built-in limiter. Add one only if you need non-auth route limits later.)

## Out of scope

Role enforcement logic (Phase 2). This phase only _stores_ the role field.
