---
page: Sign Up
route: /sign-up
root: ../../../README.md
related:
  - ../sign-in/README.md
---

# Sign Up

**Route / access:** `/sign-up`, reached via the "Sign up" link on the sign-in page.
**Part of:** [Project root README](../../../README.md)

## Purpose

Lets a new user create an account to start storing and managing files.

## What the user sees

The same centered, glassy card layout as Sign In (over the photo carousel), titled "Create account." The form has two-column rows for Full Name / Username, a full-width Email field, and two-column Password / Confirm Password fields, followed by a "Create account" button.

## What the user can do

Fill in name, username, email, and a password (confirmed twice) and submit to register. A link at the bottom leads back to Sign In for existing users.

## States & feedback

- Inline errors per field: minimum name length, username format (letters/numbers/underscore/hyphen only), valid email, password complexity (8+ characters, one uppercase letter, one number), and matching passwords.
- A destructive alert appears if sign-up attempts are rate-limited.
- A toast reports a generic failure if registration doesn't succeed.
- The submit button shows a spinner and "Creating account…" while submitting.

## Flow

Users arrive from the sign-in page's "Sign up" link. On success they're signed in and redirected to [Files](../../(app)/files/README.md).
