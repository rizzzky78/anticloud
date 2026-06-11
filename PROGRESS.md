# Progress

Legend: `[ ]` todo · `[~]` in progress · `[x]` done. Tick steps as you finish them. Plan: [`plan/`](plan/README.md).

## P0 — Foundation
- [x] 0.1 env contract  · 0.2 prisma · 0.3 redis · 0.4 minio · 0.5 errors · 0.6 lib layout

## P1 — Auth
- [x] 1.1 better-auth · 1.2 route · 1.3 redis session · 1.4 middleware · 1.5 rate-limit · 1.6 login UI

## P2 — RBAC
- [x] 2.1 models · 2.2 resolver · 2.3 perm cache · 2.4 perm middleware · 2.5 role mgmt

## P3 — Storage core
- [x] 3.1 file model · 3.2 upload · 3.3 download · 3.4 replace · 3.5 hardening

## P4 — File metadata
- [x] 4.1 mutations · 4.2 meta cache · 4.3 date grouping · 4.4 public/private · 4.5 unowned/orphan

## P5 — Lifecycle config
- [x] 5.1 ttl/soft-delete · 5.2 presigned · 5.3 read-only · 5.4 mention-gate · 5.5 config surface

## P6 — Tags & mentions
- [x] 6.1 tag schema · 6.2 tag write/freq · 6.3 autocomplete · 6.4 mention schema · 6.5 mention/notify · 6.6 notif UI

## P7 — Notes
- [x] 7.1 schema · 7.2 read/write · 7.3 cache · 7.4 history · 7.5 UI

## P8 — Search
- [x] 8.1 index · 8.2 scoped query · 8.3 cache · 8.4 filters · 8.5 UI

## P9 — Jobs · bulk · compression
- [x] 9.1 job infra · 9.2 expiry cron · 9.3 bulk sync · 9.4 bulk async · 9.5 compression

## P10 — Audit & observability
- [x] 10.1 audit model · 10.2 backfill · 10.3 query · 10.4 metrics · 10.5 counters

---

# UI Progress

Plan: [`plan/ui/`](plan/ui/README.md). `⛔` = blocked on backend Phase 10.

- [x] **UI0 Shell** — 00.1 layout · 00.2 sidebar · 00.3 header · 00.4 providers · 00.5 primitives · 00.6 access helper
- [x] **UI1 Auth** — 01.1 sign-in · 01.2 sign-up · 01.3 layout · 01.4 routing
- [x] **UI2 Browser** — 02.1 page · 02.2 row/bucket · 02.3 actions · 02.4 states · 02.5 paging/folders
- [x] **UI3 Upload** — 03.1 dialog · 03.2 progress · 03.3 queue · 03.4 replace · 03.5 folder target
- [x] **UI4 Detail** — 04.1 page · 04.2 preview/download · 04.3 edits · 04.4 config panel · 04.5 delete/recover
- [x] **UI5 Collab** — 05.1 tags · 05.2 mentions · 05.3 notes · 05.4 history
- [x] **UI6 Sharing** — 06.1 share dialog · 06.2 access summary · 06.3 gated entry
- [x] **UI7 Search** — 07.1 palette · 07.2 results page · 07.3 filters · 07.4 states
- [x] **UI8 Notifications** — 08.1 badge · 08.2 popover · 08.3 page
- [x] **UI9 Admin** — 09.1 guard · 09.2 roles · 09.3 recycle bin · 09.4 audit · 09.5 jobs (metrics)
- [x] **UI10 Settings** — 10.1 shell · 10.2 profile · 10.3 appearance · 10.4 account/sign-out
- [x] **UI11 Bulk** — 11.0 job-status read · 11.1 select · 11.2 bulk dl · 11.3 polling · 11.4 compress · 11.5 jobs drawer
