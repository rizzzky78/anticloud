---
page: Search
route: /search
root: ../../../README.md
related:
  - ../files/README.md
---

# Search

**Route / access:** `/search`, reached via the "Search" link in the sidebar.
**Part of:** [Project root README](../../../README.md)

## Purpose

Lets a user find files across their entire library by name, tag, mention, or type, instead of browsing folder by folder.

## What the user sees

A page titled "Search" with a card containing a search input and "Search" button, plus two additional filter fields — "Tags (comma separated)" and "File Type" (e.g. `image/png`). Below the form, matching files are displayed using the same file-list component as the main [Files](../files/README.md) page.

## What the user can do

Type a search term and optionally narrow results by tags or MIME type, then submit to see matching files. Clicking a result opens its [file detail page](../files/[id]/README.md).

## States & feedback

- While a search is running, the button shows a loading spinner.
- If a query returns no matches, a "No files found matching your search" message is shown.
- Results only ever include files the current user is permitted to see.

## Flow

Reached from the sidebar. Selecting a result leads to that file's detail page; there's no dedicated "back" — the user returns to Search via the sidebar link.
