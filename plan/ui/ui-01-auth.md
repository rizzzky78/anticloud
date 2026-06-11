# UI-01 — Auth Screens

**Goal:** Polish the existing sign-in/sign-up pages — Zod validation, generic (non-enumerating) errors, rate-limit (429) feedback, and a clean shadcn card layout. Pages already exist and call `lib/auth-client.ts`.

**Depends on:** Phase 1. **Unlocks:** shell access.

## Steps (agent actions)

### 01.1 — Sign-in refinement
- `app/(auth)/sign-in/page.tsx`: keep the username-or-email detection. Wrap fields in `ui/field` + Zod client validation (min lengths, required). Disable submit while `loading`; show `ui/spinner` in the button.
- Errors: keep **generic** copy (no "user not found"); on `429` show the rate-limit toast + a `ui/alert` with retry guidance.
- **Accept:** valid creds → `router.push("/")`; invalid → generic toast; 429 → rate-limit alert.

### 01.2 — Sign-up refinement
- `app/(auth)/sign-up/page.tsx`: fields name + username + email + password (matches `signUp.email` payload). Zod validate (username pattern, password strength, email format). Confirm-password field.
- **Accept:** sign-up creates the user and redirects authenticated; validation errors render inline.

### 01.3 — Auth layout & branding
- Add `app/(auth)/layout.tsx`: centered `ui/card`, Anticloud brand, link toggling sign-in/sign-up. Reuse current color scheme.
- **Accept:** both pages share one consistent layout.

### 01.4 — Post-auth routing
- Authenticated users hitting `/sign-in` or `/sign-up` redirect to `/files`. Tie into `proxy.ts` optimistic check + server `getCurrentUser()`.
- **Accept:** logged-in user visiting auth routes is bounced to the app.

## Components used
`ui/card`, `ui/field`, `ui/input`, `ui/label`, `ui/button`, `ui/spinner`, `ui/alert`, `ui/sonner`.

## Out of scope
Password reset / email verification (not in scope of Phase 1 — username+password only).
