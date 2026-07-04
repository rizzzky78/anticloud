---
page: Recycle Bin (Admin)
route: /admin/recycle-bin
root: ../../../../README.md
related:
  - ../users/README.md
  - ../audit/README.md
  - ../jobs/README.md
  - ../../trash/README.md
---

# Recycle Bin (Admin)

**Route / access:** `/admin/recycle-bin`, reached via "Recycle Bin" in the sidebar's Admin section. Restricted strictly to `SUPERADMIN`; anyone else gets a not-found page.
**Part of:** [Project root README](../../../../README.md)

## Purpose

Gives a superadmin a system-wide view of every soft-deleted file (from any user), not just their own, so they can recover files on a user's behalf.

## What the user sees

A page titled "Recycle Bin" (with a "SUPERADMIN Console" description) with a search box and a table listing every deleted file across the system, its owner, size, deletion date, and time remaining in the 30-day grace window, with a restore action per row.

## What the user can do

Search deleted files by name and restore any user's deleted file.

## States & feedback

Time-remaining badges become more urgent as the grace window shrinks. A toast confirms a successful restore.

## Flow

Reached from the Admin section of the sidebar. This is the superadmin-scoped counterpart to the per-user [Recycle Bin](../../trash/README.md); it sits alongside [Users & Roles](../users/README.md), [Audit](../audit/README.md), and [Jobs](../jobs/README.md).
