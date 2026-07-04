---
page: Settings & Account
route: /settings
root: ../../../README.md
---

# Settings & Account

**Route / access:** `/settings`, reached via the "Settings" link at the bottom of the sidebar.
**Part of:** [Project root README](../../../README.md)

## Purpose

Lets a user manage their profile details, appearance preference, and active session, and sign out.

## What the user sees

A page titled "Settings & Account" with a two-column layout. The larger left card shows the user's avatar, name, email, and role badge, with an editable profile form (Full Name, Username) and read-only fields (Email, Security Role). The right column has an "Appearance" card with Light/Dark/System theme buttons, and a "Session" card showing session status, role, member-since date, and user ID, with a "Sign Out" button.

## What the user can do

- Edit their display name and username and save changes.
- Switch the app's color theme between Light, Dark, and System.
- Sign out of their account.

## States & feedback

- The "Save Changes" button is disabled until a field is actually changed, and shows a spinner labeled "Saving…" while submitting.
- A toast confirms a successful profile update or reports an error.
- "Sign Out" shows a spinner and disables while processing, then redirects to Sign In.
- Email and Security Role fields are always read-only ("Cannot be changed" / "Managed by administrators").

## Flow

Reached from the sidebar. Signing out redirects to [Sign In](../../(auth)/sign-in/README.md).
