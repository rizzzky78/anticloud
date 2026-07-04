---
page: Notifications
route: /notifications
root: ../../../README.md
---

# Notifications

**Route / access:** `/notifications`, reached via the bell icon / "Notifications" link in the sidebar.
**Part of:** [Project root README](../../../README.md)

## Purpose

Keeps the user informed of activity relevant to them — file shares, @mentions, and collaborator actions — in one place.

## What the user sees

A page titled "Notification Center" with a short description, and (when there are unread items) a "Mark all read" button. Below is a card with "All" and "Unread" tabs (the Unread tab shows a count badge). Each notification is a row with a message, an optional link to the related file, and a relative timestamp; unread items are highlighted with a dot and bolder text.

## What the user can do

- Switch between "All" and "Unread" tabs.
- Click a notification to mark it read and, if it references a file, jump to that [file's detail page](../files/[id]/README.md).
- Click "Mark all read" to clear all unread notifications at once.
- Load more notifications via a "Load more notifications" button at the bottom of the list (cursor-based pagination).

## States & feedback

- A skeleton loading state is shown while notifications load.
- An empty state ("No notifications found" / "You have no unread notifications right now") is shown when there's nothing to display.
- Toasts report failures to load, mark-as-read, or mark-all-read.

## Flow

Reached from the sidebar. Clicking a notification with an attached file navigates to that [file detail page](../files/[id]/README.md).
