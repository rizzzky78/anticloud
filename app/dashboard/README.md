---
page: Dashboard (unused scaffold)
route: /dashboard
root: ../../README.md
---

# Dashboard (unused scaffold)

**Route / access:** `/dashboard`, not linked from anywhere in the app's navigation.
**Part of:** [Project root README](../../README.md)

## Purpose

Appears to be leftover shadcn/ui "dashboard-01" block scaffolding (metric cards, an interactive area chart, and a data table backed by a static `data.json` file) rather than a feature of the product.

## What the user sees

A sidebar and header shell (built from the same primitives as the real app shell) surrounding a row of summary cards, an interactive chart, and a data table — all populated from static demo data rather than the user's real files or account.

## What the user can do

The chart and table support the generic interactions of the shadcn demo block (e.g. toggling chart range, sorting/paging the table), but none of it reads or writes real application data.

## Notes

This route is not reachable from the [Files](../(app)/files/README.md) sidebar, [`/dashboard`](page.tsx) doesn't sit under the authenticated `(app)` route group, and it isn't gated by the sign-in redirect the rest of the app enforces — it's likely unused boilerplate left over from scaffolding rather than an intentional page. A companion `/dashboard/search` route reuses the same [Search](../(app)/search/README.md) component. Consider removing both if they're not intended for production use.
