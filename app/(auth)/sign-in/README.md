---
page: Sign In
route: /sign-in
root: ../../../README.md
related:
  - ../sign-up/README.md
---

# Sign In

**Route / access:** `/sign-in`, reached by visiting the app while logged out (any protected page redirects here) or via the "Sign in" link on the sign-up page.
**Part of:** [Project root README](../../../README.md)

## Purpose

Lets a returning user authenticate to reach their files and account.

## What the user sees

A centered, glassy card over a full-screen photo carousel background, under the Anticloud logo and tagline. The card has a title ("Sign in"), a subtitle, an "Email or Username" field, a "Password" field, and a primary "Sign in" button. A footer credits the site's creator.

## What the user can do

- Enter an email address or a username plus a password and submit to sign in.
- Follow the "Sign up" link to create a new account instead.

## States & feedback

- Inline validation errors appear under a field if it's left empty.
- A destructive alert banner appears if sign-in attempts are rate-limited ("Too many attempts").
- A toast notification reports invalid credentials.
- The submit button shows a spinner and "Signing in…" while the request is in flight.

## Flow

Users land here from a redirect off any authenticated page, or from the header/sign-up link. On success they're taken to [Files](../../(app)/files/README.md).
