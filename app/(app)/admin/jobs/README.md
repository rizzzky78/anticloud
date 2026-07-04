---
page: Background Jobs Console
route: /admin/jobs
root: ../../../../README.md
related:
  - ../users/README.md
  - ../audit/README.md
  - ../recycle-bin/README.md
---

# Background Jobs Console

**Route / access:** `/admin/jobs`, reached via "Jobs" in the sidebar's Admin section. Restricted strictly to `SUPERADMIN`; anyone else gets a not-found page.
**Part of:** [Project root README](../../../../README.md)

## Purpose

Gives a superadmin visibility into the background job queue (bulk downloads, compression, TTL expiry) and its health.

## What the user sees

A page titled "Background Jobs Console" with summary metrics (queue depth, cache hit rate, running/failed/dead-letter counts) and a search box, above a tabbed table (All / Pending / Running / Completed / Failed) listing jobs with type, status, attempt count, and timestamps. Clicking a job opens a side sheet with its full payload, result, and error detail.

## What the user can do

Filter jobs by status tab, search, and inspect a specific job's full detail (including any error message) in a slide-out panel.

## States & feedback

A dedicated count highlights jobs that landed in the dead-letter queue (repeated failures) so they can be flagged for review.

## Flow

Reached from the Admin section of the sidebar, alongside [Users & Roles](../users/README.md), [Audit](../audit/README.md), and [Recycle Bin](../recycle-bin/README.md).
