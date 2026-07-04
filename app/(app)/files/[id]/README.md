---
page: File Detail
route: /files/[id]
root: ../../../../README.md
related:
  - ../README.md
---

# File Detail

**Route / access:** `/files/[id]`, reached by clicking a file from [Files](../README.md) or [Search](../../search/README.md) results, or from a notification.
**Part of:** [Project root README](../../../../README.md)

## Purpose

A dedicated workspace for a single file — preview it, edit its metadata, manage sharing and access, and see its version/derivative history.

## What the user sees

A header with a back button, the file icon, name, and quick actions menu. Depending on file type, an inline preview (image viewer, video/audio player, or text preview) is shown. Below or alongside it are panels for file info (owner, size, dates, visibility), tags, @mentions, versioned notes (with a "view history" option), and a sharing panel for tokenized share links. If the file has derived versions (e.g. a compressed copy) or is itself derived from another file, that relationship is shown.

## What the user can do

- Rename the file, move it to another folder, or change its visibility (public/private, guest access, read-only, mention-restricted).
- Replace the file's binary content with a new upload.
- Compress the file into a new derived version, or promote a derivative to become the canonical file.
- Add/remove tags and @mention other users.
- Write and edit notes, and view prior note revisions.
- Generate/manage a tokenized share link.
- Soft-delete the file (moves it to the Recycle Bin) or recover it if already deleted.
- Download the file.

## States & feedback

- Mutating actions are disabled if the file is read-only (unless the viewer is a superadmin).
- A banner or badge indicates a soft-deleted file, with an option to recover it.
- Compression and other long-running actions run as background jobs tracked in a jobs context, with toast feedback.
- Access is permission-gated: users without sufficient rights are shown a "not found" rather than a permission error, to avoid leaking file existence.

## Flow

Arrived at from [Files](../README.md), [Search](../../search/README.md), or a notification link. Navigating back returns to the file list.
