# Phase 19 — Account Security

**Goal:** Users can protect and manage their own accounts: change password, use two-factor authentication, see and end sessions, and set a profile picture.

**Depends on:** Phase 11. **Unlocks:** 22

## Steps (agent actions)

### 19.1 — Two-factor authentication
- Better-Auth `twoFactor` plugin (TOTP + backup codes, issuer "Anticloud"); `twoFactorClient` on the client. Schema: `User.twoFactorEnabled`, `TwoFactor` (`two_factor`). User runs `bunx prisma migrate dev` / `generate`.
- Sign-in detects `twoFactorRedirect` and routes to `/two-factor` (OTP input, backup-code fallback, trust device 30 days). Proxy treats `/two-factor` as an auth page.
- Settings: enable (password → QR code via `qrcode` + manual key → verify code → backup codes), disable, regenerate backup codes.
- **Accept:** with 2FA on, signing in requires a valid TOTP or backup code.

### 19.2 — Password change
- `authClient.changePassword` with optional "sign out of all other devices".
- **Accept:** the old password stops working; other sessions end when chosen.

### 19.3 — Active sessions
- `listSessions` / `revokeSession` / `revokeOtherSessions` with device/browser/IP and "This device" marker.
- **Accept:** revoking a session signs that device out on its next request.

### 19.4 — Profile picture
- `POST/DELETE /api/account/avatar` (≤ 5 MB raster image, re-encoded to 256×256 WebP, rate-limited, audited); `GET /api/avatars/[userId]` for signed-in users. `User.avatarKey` tracks the object; `image` holds the versioned URL. `components/avatar-uploader.tsx` in Settings.
- **Accept:** a new picture appears in Settings and the sidebar after upload.

## Deliverables
Auth config + schema, `/two-factor`, `components/account-security.tsx`, avatar routes + uploader.
