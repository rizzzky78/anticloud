# UI-09 — Admin: Roles, Recycle Bin (+ deferred Audit/Jobs)

**Goal:** Admin/superadmin console — system role management, the soft-delete recycle bin, and placeholders for audit/jobs/metrics that unlock with Phases 9–10.

**Depends on:** ui-00, Phases 2 & 5. Audit/jobs steps **⛔ blocked** on Phases 9–10. **Unlocks:** —

## Steps (agent actions)

### 09.1 — Admin route guard
- `app/(app)/admin/layout.tsx`: server-guard to admin/superadmin via `getCurrentUser()`; redirect/404 otherwise. Admin nav group already gated in ui-00.
- **Accept:** non-admins cannot reach `/admin/*`.

### 09.2 — User role management
- `app/(app)/admin/users/page.tsx`: list users (RSC) with current `role` `ui/badge`. Change role via `ui/select` → `setSystemRole` (superadmin-only for elevating to admin/superadmin; handler gates). Confirm sensitive changes with `ui/alert-dialog`.
- **Accept:** role changes persist and bust the perm cache; UI reflects the new role.

### 09.3 — Recycle bin
- `app/(app)/admin/recycle-bin/page.tsx`: list soft-deleted files (within grace) — bind a listing scoped to `deletedAt != null` (use the files data layer with a deleted filter). Restore → `recoverFile`; show grace-window countdown.
- **Accept:** soft-deleted files appear here and restore via `recoverFile` within grace.

### 09.4 — ⛔ Audit log viewer (Phase 10)
- **Blocked on:** Phase 10 `actions/audit.ts`. Plan: `app/(app)/admin/audit/page.tsx` with filters (user, target, action, date range) → single-query results table.
- **Accept (when unblocked):** superadmin filters the append-only log; non-superadmin denied.

### 09.5 — Jobs & DLQ review (metrics card ⛔ Phase 10)
- `lib/jobs.ts` exists (`getJobStatus`, `consumeJobs`, statuses incl. `DEAD_LETTER`). Build `app/(app)/admin/jobs/page.tsx` listing recent/failed/DLQ jobs (status badges, payload/error, retry context) for superadmin review — reuse the jobs drawer from [ui-11](ui-11-bulk.md). The **metrics summary card** (queue depth, cache hit rates) is **⛔ blocked on Phase 10 `/api/metrics`**.
- **Accept:** failed/DLQ jobs are listed for superadmin review; metrics card lands when `/api/metrics` exists.

## Components used
`ui/table`, `ui/select`, `ui/badge`, `ui/alert-dialog`, `ui/tabs`, `ui/card`, `ui/empty`, `ui/skeleton`, `ui/sonner`; scaffold `data-table`, `section-cards`, `chart-area-interactive` (for metrics).

## Out of scope
Building the audit/jobs/metrics handlers — those are backend Phases 9–10.
