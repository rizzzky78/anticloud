---
page: Files
route: /files
root: ../../../README.md
related:
  - ../files/[id]/README.md
  - ../search/README.md
  - ../trash/README.md
---

# Files

**Route / access:** `/files`, the default landing page after sign-in (and the app's root `/` redirects here). Reached via the "Anticloud" logo or "Files" link in the sidebar.
**Part of:** [Project root README](../../../README.md)

## Purpose

The main file browser — where a user views, uploads, organizes, and manages their files and folders.

## What the user sees

A breadcrumb trail at the top showing the current folder path, and below it a file listing built from date-grouped buckets (e.g. Today, Yesterday, This Week) with a toggle between list and grid view. Each row/card shows a file icon, name, and metadata. A persistent left sidebar shows the Anticloud logo, an "Upload File" button, main navigation (Files, Search, Notifications, Recycle Bin), an Admin section (for admins/superadmins), Settings, and the signed-in user's avatar/name. Pagination controls appear at the bottom when there are more files than fit on one page.

## What the user can do

- Upload new files via the sidebar "Upload File" button (opens an upload dialog).
- Navigate into subfolders and back up via breadcrumbs.
- Switch between list and grid view.
- Select one or more files with checkboxes to bulk-download them as a ZIP or bulk soft-delete them.
- Click into a file to open its [file detail page](../files/[id]/README.md).
- Move between pages of results with "Previous"/"Next" pagination.

## States & feedback

- Large bulk downloads are queued as a background job with a toast confirming it was enqueued; smaller ones download immediately with a "Download started!" toast.
- A confirmation dialog appears before bulk-deleting selected files.
- An empty state is shown when a folder has no files.

## Flow

This is the default post-login destination. From here users can jump to Search, Notifications, the Recycle Bin, Settings, or (for admins) the Admin console via the sidebar, or open a specific file's detail page.
