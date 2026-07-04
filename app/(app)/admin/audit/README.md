---
page: Security Audit Logs
route: /admin/audit
root: ../../../../README.md
related:
  - ../users/README.md
  - ../jobs/README.md
  - ../recycle-bin/README.md
---

# Security Audit Logs

**Route / access:** `/admin/audit`, reached via "Audit" in the sidebar's Admin section. Restricted strictly to `SUPERADMIN`; anyone else (including regular admins) gets a not-found page.
**Part of:** [Project root README](../../../../README.md)

## Purpose

Lets a superadmin review the append-only audit trail — who did what, to which file, when, and from which IP.

## What the user sees

A page titled "Security Audit Logs" with a search box, an action-type filter dropdown, and a date filter, above a paginated table of log entries showing the actor, action, target, timestamp, and IP address. Clicking a row (or an info icon) opens a dialog with the full entry detail, including raw metadata.

## What the user can do

Search, filter by action type or date, page through results, and open any entry to inspect its full metadata in a dialog.

## States & feedback

Pagination controls (previous/next) reflect total pages; there's no edit or delete path exposed, consistent with the log being append-only.

## Flow

Reached from the Admin section of the sidebar, alongside [Users & Roles](../users/README.md), [Jobs](../jobs/README.md), and [Recycle Bin](../recycle-bin/README.md).
