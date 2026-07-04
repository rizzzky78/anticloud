---
page: Recycle Bin
route: /trash
root: ../../../README.md
related:
  - ../files/README.md
---

# Recycle Bin

**Route / access:** `/trash`, reached via the "Recycle Bin" link in the sidebar.
**Part of:** [Project root README](../../../README.md)

## Purpose

Gives a user a safety net for deleted files — soft-deleted files sit here for a grace period before being permanently removed, and the owner can restore them.

## What the user sees

A page titled "Recycle Bin" explaining that deleted files are kept for 30 days, a search box to filter by file name, and a table listing each deleted file's name/folder, size, deletion date, and time remaining before permanent removal (color-coded as it runs low), with a restore action per row.

## What the user can do

Search deleted files by name, and click "Restore" on any file to move it back out of the recycle bin.

## States & feedback

- An empty state shows "Recycle bin is empty" (or "No matching deleted files" when a search yields nothing).
- Time-remaining badges turn more urgent (destructive color) as the 30-day window shrinks below a week or an hour.
- A spinner shows on the restore button while the action is processing; a toast confirms success or reports failure.

## Flow

Reached from the sidebar. Restoring a file makes it reappear in [Files](../files/README.md).
