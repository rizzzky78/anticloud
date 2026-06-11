# UI-10 — Account & Settings

**Goal:** A `/settings` area for profile, appearance (theme), and session/sign-out — using the current session from `lib/auth-client.ts`.

**Depends on:** ui-00, Phase 1. **Unlocks:** —

## Steps (agent actions)

### 10.1 — Settings shell
- `app/(app)/settings/page.tsx` with `ui/tabs`: **Profile**, **Appearance**, **Account**.
- **Accept:** settings renders inside the app shell with tabbed sections.

### 10.2 — Profile
- Show name, username, email, role (read-only badges from session). If Better-Auth exposes profile updates (name/displayUsername), wire a form via `authClient`; otherwise render read-only and note the limitation.
- **Accept:** profile reflects the live session; editable fields persist if supported.

### 10.3 — Appearance
- Theme toggle (light/dark/system) via `next-themes`, mirrored in the user menu (ui-00). Persisted.
- **Accept:** theme change applies instantly and persists.

### 10.4 — Account / sessions
- Sign-out button (`signOut` → redirect to `/sign-in`). If Better-Auth multi-session APIs are available, list active sessions with revoke; otherwise just sign-out.
- **Accept:** sign-out clears the session (Redis) and redirects.

## Components used
`ui/tabs`, `ui/card`, `ui/field`, `ui/input`, `ui/badge`, `ui/switch`, `ui/button`, `ui/avatar`, `ui/sonner`.

## Out of scope
Password reset / email change flows (not in Phase 1 scope).
