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

## P11 — Security hardening
- [x] 11.1 role input · 11.2 single resolver · 11.3 safe content · 11.4 data minimization · 11.5 collab gates · 11.6 HTTP deploy

## P12 — Reliability & maintenance
- [x] 12.1 job queue · 12.2 maintenance · 12.3 archive serving · 12.4 input normalization · 12.5 fixes · 12.6 telemetry

## P13 — File versions
- [x] 13.1 schema · 13.2 versioned replace · 13.3 restore/delete/download · 13.4 UI

## P14 — Sharing v2
- [x] 14.1 share tiers · 14.2 expiring grants + notify · 14.3 shared views · 14.4 share links · 14.5 UI

## P15 — Groups
- [x] 15.1 schema · 15.2 resolver · 15.3 group management · 15.4 group sharing

## P16 — Folders as entities
- [x] 16.1 schema · 16.2 inherited access · 16.3 folder operations · 16.4 folder sharing · 16.5 UI

## P17 — Personal views & browser UX
- [x] 17.1 starred · 17.2 recent · 17.3 sorting · 17.4 folder upload · 17.5 navigation

## P18 — Thumbnails
- [x] 18.1 schema + sharp · 18.2 generation · 18.3 serving

## P19 — Account security
- [x] 19.1 two-factor · 19.2 password change · 19.3 sessions · 19.4 profile picture

## P20 — Storage quota & usage
- [x] 20.1 quota model · 20.2 admin quota · 20.3 storage page

## P21 — Notifications v2
- [x] 21.1 notify helper · 21.2 real-time stream · 21.3 new events

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
