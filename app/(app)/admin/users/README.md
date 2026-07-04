---
page: User Role Management
route: /admin/users
root: ../../../../README.md
related:
  - ../audit/README.md
  - ../jobs/README.md
  - ../recycle-bin/README.md
---

# User Role Management

**Route / access:** `/admin/users`, reached via "Users & Roles" in the sidebar's Admin section. Visible to `ADMIN` and `SUPERADMIN` roles; anyone else gets a not-found page.
**Part of:** [Project root README](../../../../README.md)

## Purpose

Gives administrators a place to see every registered user and change their system-wide access role.

## What the user sees

A page titled "User Role Management" with a search box and a table listing every user: avatar, name, email/username, current role (as a badge), and join date, with a role selector per row.

## What the user can do

Search users by name/email, and change a user's role via a dropdown (e.g. promote to Admin or Superadmin, or demote to Viewer/Guest).

## States & feedback

A confirmation dialog appears before a role change is applied. A spinner shows while the change is in progress, and a toast confirms success or reports failure.

## Flow

Reached from the Admin section of the sidebar. Related admin tools ([Audit](../audit/README.md), [Jobs](../jobs/README.md), [Recycle Bin](../recycle-bin/README.md)) sit alongside it in the same sidebar section.
