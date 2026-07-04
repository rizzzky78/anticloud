---
page: Dashboard Search (unused scaffold)
route: /dashboard/search
root: ../../../README.md
related:
  - ../README.md
  - ../../(app)/search/README.md
---

# Dashboard Search (unused scaffold)

**Route / access:** `/dashboard/search`, not linked from anywhere in the app's navigation.
**Part of:** [Project root README](../../../README.md)

## Purpose

Renders the same file-search experience as the main [Search](../../(app)/search/README.md) page, but under the unused `/dashboard` scaffold rather than the authenticated app shell.

## What the user sees

Identical to the main Search page: a search box with tag and file-type filters, and matching results below.

## Notes

Like its parent [`/dashboard`](../README.md), this route isn't reachable from the app's sidebar and isn't behind the sign-in redirect the rest of the app enforces. It appears to exist only because it sits next to the `/dashboard` scaffold, not as an intentional second search page.
