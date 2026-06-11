# Anticloud — Implementation Plan (Index)

A Nextcloud-style file platform on **Next.js 16 (App Router) · TypeScript · PostgreSQL · Redis · MinIO · Prisma · Better-Auth · shadcn/ui**.

This plan is split into **phases**. Each phase is a self-contained file with ordered, agent-executable steps, deliverables, and acceptance criteria. Work phases **in order** — later phases assume the contracts built earlier.

> Source of truth for *what* to build: [`../DESCRIPTION_PLAN.md`](../DESCRIPTION_PLAN.md).
> These phase files define *how* and *in what order*.

## Phase Map

| # | Phase | File | Depends on | DESCRIPTION_PLAN § |
|---|-------|------|-----------|--------------------|
| 0 | Foundation & Infrastructure | [phase-00-foundation.md](phase-00-foundation.md) | — | 3, 12, 13 |
| 1 | Authentication | [phase-01-auth.md](phase-01-auth.md) | 0 | 1, 13 |
| 2 | RBAC & Permission Resolution | [phase-02-rbac.md](phase-02-rbac.md) | 1 | 2, 12, 13 |
| 3 | File Storage Core | [phase-03-storage-core.md](phase-03-storage-core.md) | 2 | 3, 9 |
| 4 | File Metadata & Organization | [phase-04-file-metadata.md](phase-04-file-metadata.md) | 3 | 4, 5, 9 |
| 5 | File Lifecycle & Configuration | [phase-05-lifecycle-config.md](phase-05-lifecycle-config.md) | 4 | 4 |
| 6 | Tags & Mentions | [phase-06-tags-mentions.md](phase-06-tags-mentions.md) | 4 | 7 |
| 7 | File Notes | [phase-07-notes.md](phase-07-notes.md) | 4 | 8 |
| 8 | Search | [phase-08-search.md](phase-08-search.md) | 6, 7 | 6 |
| 9 | Jobs · Bulk Download · Compression | [phase-09-jobs-bulk-compression.md](phase-09-jobs-bulk-compression.md) | 3, 5 | 10, 11, 14 |
| 10 | Audit & Observability | [phase-10-audit-observability.md](phase-10-audit-observability.md) | 1 | 15 |

## UI Plan

Frontend is planned separately in [`plan/ui/`](ui/README.md) — phased screens (`ui-00`…`ui-11`) bound to the handlers above, built only from existing shadcn/ui components.

## Architecture Pillars (hold across all phases)

1. **Identity & access** — Better-Auth at the gate; Redis answers session/permission questions, not the DB.
2. **File lifecycle** — MinIO owns binary; PostgreSQL owns relational truth (names, paths, tags, perms). Metadata ops never touch MinIO.
3. **Metadata intelligence** — tags, notes, mentions, search, audit all live in PostgreSQL; Redis caches the hot path.

## Hard Rules (every phase)

- **Secrets**: `process.env` only — never hardcode. Validate env at boot (Phase 0).
- **Auth**: Better-Auth only. No custom auth.
- **DB**: Prisma only. No raw string-built SQL.
- **Inputs**: validate with Zod at every server boundary (client + server).
- **Errors**: graceful; never leak stack traces or private metadata.
- **Next.js 16**: APIs differ from training data. **Read `node_modules/next/dist/docs/` for the relevant guide before writing code.**
- **UI**: use existing shadcn/ui components + current color scheme. Do not modify `components/ui/*`.
- **Naming**: files `kebab-case`, components `PascalCase`, server actions in `actions/`, utils in `lib/`, API in `app/api/`.

## Working Agreement (per agent action)

Each numbered step in a phase is one agent unit of work. When you complete a step:
1. Implement only that step's deliverables.
2. Verify against the step's acceptance criteria.
3. Tick the matching line in [`../PROGRESS.md`](../PROGRESS.md).

Do not start a phase whose dependencies are unchecked in PROGRESS.md.
