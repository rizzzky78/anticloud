<div align="center">

![App Logo](public/app-logo.png)

# Anticloud

**A self-hosted, secure file management platform.**

Own your files. Run it on your own hardware or your own cloud — no third-party
service required, no vendor lock-in.

[Architecture](#️-architecture) · [Features](#-features) · [Screenshots](#-screenshots) · [Tech stack](#-tech-stack) · [Quick start](#-quick-start) · [Configuration](#-configuration) · [Deployment](#-deployment)

</div>

---

## 📖 Overview

**Anticloud** is an open-source, self-hosted file management platform — a
Nextcloud-style system rebuilt on a modern Next.js stack. It pairs a polished
interface with a hardened backend: two-level role-based access control,
full-text search, background processing, an append-only audit trail, and
S3-compatible object storage.

Every backing service is **cloud-or-local, your choice** — run everything on one
box with Docker, or wire each piece to a managed provider (Neon, Upstash,
Cloudflare R2, …). The application code is identical either way.

> **Why "Anticloud"?** Because the cloud is just someone else's computer. This is
> yours.

---

## 🎯 Purpose & intent

Anticloud was built as a from-scratch demonstration of what it takes to ship a
"boring" cloud-storage product properly: real RBAC instead of a single owner
flag, a permission model that survives account deletion, background job
processing with a dead-letter queue instead of fire-and-forget async work, and
an audit trail that can't be edited after the fact. It's a portfolio project
first — there's no commercial backing or SLA — but the backend concerns
(permissions, storage decoupling, observability) are treated with production
seriousness rather than mocked out.

---

## 🏛️ Architecture

Anticloud is built around three separations of concern — **identity & access**,
**file lifecycle**, and **metadata intelligence** — with each backing service
owning exactly one kind of truth:

| Service                 | Responsibility                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Better-Auth**         | The entry gate. Produces a verified identity that every downstream layer trusts without re-querying the database per request. |
| **PostgreSQL**          | All _relational_ truth — ownership, permissions, tags, notes, audit, metadata. Nothing binary ever touches it.                |
| **Object storage (S3)** | All _binary_ content. Objects are UUID-keyed; the user-visible name never appears in a storage key.                           |
| **Redis**               | Short-term memory — sessions, rate-limit counters, hot-data caches, tag-frequency sets, and the background job queue.         |

A few design rules fall out of this:

- **Renames, moves, and metadata edits never touch storage** — they're pure
  database operations. Only an actual binary replacement writes to the bucket.
- **Permission resolution is centralized and ordered**: superadmin bypass →
  explicit per-file grant → file visibility (public/private) → deny. Mention
  restrictions further _narrow_ access after RBAC. Handlers trust the resolved
  decision rather than re-checking inline.
- **The app fails fast** — every secret is validated at boot, so it never runs
  half-configured.

---

## ✨ Features

### Files & storage

- **Streamed upload, replace & download** — binaries flow client → handler →
  storage without ever hitting the app server's disk; no size cap by default.
- **Date-grouped browsing** — list views are bucketed server-side into _Today,
  Yesterday, This Week, This Month_, then by calendar month — computed in the
  query, not in memory.
- **Bulk download** — select many files and get a single ZIP. Each file's access
  is re-validated individually; excluded files are listed (with the reason) in a
  `manifest.txt` inside the archive. Large selections run as a background job and
  finish with a short-lived presigned link.
- **On-demand compression** — compress a file server-side into a **derived
  version** linked to the original. Non-destructive by default; you choose which
  copy is canonical.
- **Soft delete & recycle bin** — deletions enter a grace window before a TTL job
  hard-deletes them; superadmins can restore within the window.
- **File expiry (TTL)** — set an expiry timestamp; an automated cron job reclaims
  storage and the database row.
- **Folders & display names** fully decoupled from physical storage keys.

### Access control & sharing

- **Two-level RBAC** — system roles (`SUPERADMIN`, `ADMIN`, `VIEWER`, `GUEST`)
  plus per-file grants. A file owner can grant a specific user a specific role on
  a specific file; file-level permissions override system-level _downward_, never
  upward.
- **Visibility modes** — `PUBLIC` / `PRIVATE`, optional **guest access**,
  **read-only** locks (mutations rejected until lifted), and
  **mention-restricted** files (only mentioned users may access, regardless of
  role).
- **Unowned & orphaned files** — files can exist without an owner; when an owner
  account is deleted its files become _unowned_ (preserved per their visibility)
  rather than cascade-deleted.
- **Tokenized share links** — permanent, revocable URLs validated against the
  file's _current_ permission state on every request (a token, not a capability).

### Collaboration

- **Tags** with Redis-backed frequency autocomplete.
- **@mentions** that notify users in-app — and double as the access grant for
  mention-restricted files.
- **Versioned notes** — every edit is a new revision with authorship recorded;
  prior versions remain visible to the owner and admins.

### Search & discovery

- **Full-text search** powered by PostgreSQL `tsvector` + a GIN index, spanning
  file names, tags, and note content.
- **Permission-scoped results** — search never leaks names or metadata from files
  the requester can't see.
- **Advanced filters** — tag, date range, uploader, file type, and access level,
  composed into a single query.

### Operations & observability

- **Redis-backed job queue** with a dedicated worker for bulk archiving,
  compression, and TTL expiry. Failed jobs retry with backoff and land in a
  **dead-letter queue** flagged for superadmin review.
- **Append-only audit log** — who did what, to which file, when, and from which
  IP. No edit/delete path is exposed through the API.
- **Admin console** — manage users & roles, review the audit log, inspect jobs,
  and empty the recycle bin.
- **Prometheus metrics** — `/api/metrics` exposes request, error, cache, job, and
  queue-depth counters in standard exposition format (bearer-token secured).

### Security

- **Better-Auth** username + password authentication with rate-limited sign-in /
  sign-up and Redis-backed sessions (DB never hit for session validation).
- **Strict environment contract** — every secret comes from the environment and is
  validated at boot; the app refuses to start half-configured.
- **No SQL injection surface** — all data access goes through Prisma.

---

## 🧭 How it works

A new visitor lands on [Sign In](<app/(auth)/sign-in/README.md>) (or
[Sign Up](<app/(auth)/sign-up/README.md>) to register). Once authenticated,
`/` redirects straight into [Files](<app/(app)/files/README.md>), the
date-grouped file browser and home base of the app — upload, organize into
folders, and select files for bulk actions from here. Opening any file leads to
its [File Detail](<app/(app)/files/[id]/README.md>) page, where preview,
sharing, tags, mentions, and versioned notes all live. When the library grows,
[Search](<app/(app)/search/README.md>) finds files by name, tag, or type across
the whole account. [Notifications](<app/(app)/notifications/README.md>) surfaces
mentions and collaborator activity, and anything deleted passes through the
[Recycle Bin](<app/(app)/trash/README.md>) before it's gone for good.
[Settings](<app/(app)/settings/README.md>) covers profile, theme, and signing
out. Admins and superadmins get an additional console —
[Users & Roles](<app/(app)/admin/users/README.md>),
[Audit Logs](<app/(app)/admin/audit/README.md>),
[Background Jobs](<app/(app)/admin/jobs/README.md>), and a system-wide
[Recycle Bin](<app/(app)/admin/recycle-bin/README.md>) — visible only to those
roles.

## 🗺️ Pages

| Page                 | Route                  | Description                                                | Doc                                                            |
| -------------------- | ----------------------- | ------------------------------------------------------------ | --------------------------------------------------------------- |
| Sign In               | `/sign-in`              | Authenticate with email/username + password                  | [README](<app/(auth)/sign-in/README.md>)                        |
| Sign Up               | `/sign-up`              | Register a new account                                       | [README](<app/(auth)/sign-up/README.md>)                        |
| Files                 | `/files`                | Date-grouped file browser, upload, bulk actions               | [README](<app/(app)/files/README.md>)                           |
| File Detail           | `/files/[id]`           | Preview, sharing, tags, mentions, versioned notes             | [README](<app/(app)/files/[id]/README.md>)                      |
| Search                | `/search`               | Full-text search by name, tag, or file type                  | [README](<app/(app)/search/README.md>)                          |
| Notifications         | `/notifications`        | Mentions and collaborator activity feed                      | [README](<app/(app)/notifications/README.md>)                   |
| Recycle Bin           | `/trash`                | Restore your own soft-deleted files within 30 days            | [README](<app/(app)/trash/README.md>)                           |
| Settings & Account    | `/settings`             | Profile, theme, session, sign out                              | [README](<app/(app)/settings/README.md>)                        |
| Users & Roles (admin) | `/admin/users`          | Manage every user's system role                               | [README](<app/(app)/admin/users/README.md>)                     |
| Audit Logs (admin)    | `/admin/audit`          | Append-only security audit trail (superadmin-only)             | [README](<app/(app)/admin/audit/README.md>)                     |
| Background Jobs (admin) | `/admin/jobs`         | Queue health, job status, dead-letter queue (superadmin-only)  | [README](<app/(app)/admin/jobs/README.md>)                      |
| Recycle Bin (admin)   | `/admin/recycle-bin`    | System-wide soft-deleted file recovery (superadmin-only)        | [README](<app/(app)/admin/recycle-bin/README.md>)               |
| Dashboard *(unused)*  | `/dashboard`            | Leftover shadcn demo scaffold, not linked in navigation        | [README](app/dashboard/README.md)                               |
| Dashboard Search *(unused)* | `/dashboard/search` | Same Search component, reused under the unused scaffold        | [README](app/dashboard/search/README.md)                        |

---

## 📸 Screenshots

### Files & uploads

Date-grouped file browser with streamed uploads.

![File browser](public/app-screenshot/anticloud-page-files-v2.png)

|                                                               |                                                                                |
| :-----------------------------------------------------------: | :----------------------------------------------------------------------------: |
| ![Files list](public/app-screenshot/anticloud-page-files.png) | ![Upload dialog](public/app-screenshot/anticloud-page-files-upload-dialog.png) |
|                        **Files list**                         |                               **Upload dialog**                                |

### File detail & collaboration

Preview, versioned notes, tags, mentions, and tokenized sharing.

![File detail](public/app-screenshot/anticloud-page-file-detail.png)

|                                                                                 |                                                                                         |
| :-----------------------------------------------------------------------------: | :-------------------------------------------------------------------------------------: |
| ![Versioned notes](public/app-screenshot/anticloud-page-files-detail-notes.png) | ![Sharing & permissions](public/app-screenshot/anticloud-page-files-detail-sharing.png) |
|                               **Versioned notes**                               |                                **Sharing & permissions**                                |

### Search

Permission-scoped full-text search across names, tags, and notes.

![Search](public/app-screenshot/anticloud-page-search.png)

### Authentication

![Sign in](public/app-screenshot/anticloud-login-page.png)

### Admin console

|                                                                                    |                                                                            |
| :--------------------------------------------------------------------------------: | :------------------------------------------------------------------------: |
|   ![User management](public/app-screenshot/anticloud-page-users-management.png)    |  ![Audit log](public/app-screenshot/anticloud-page-admin-audit-logs.png)   |
|                             **User & role management**                             |                         **Append-only audit log**                          |
| ![Background jobs](public/app-screenshot/anticloud-page-admin-background-jobs.png) | ![Recycle bin](public/app-screenshot/anticloud-page-admin-recycle-bin.png) |
|                      **Background jobs & dead-letter queue**                       |                    **Recycle bin (soft-deleted files)**                    |

---

## 🧱 Tech stack

| Layer          | Choice                                                                          |
| -------------- | ------------------------------------------------------------------------------- |
| Framework      | [Next.js 16](https://nextjs.org) (App Router) + [React 19](https://react.dev)   |
| Language       | TypeScript                                                                      |
| Runtime        | [Bun](https://bun.sh)                                                           |
| Styling        | [Tailwind CSS v4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) |
| Auth           | [Better-Auth](https://better-auth.com)                                          |
| Database       | PostgreSQL via [Prisma 7](https://www.prisma.io) (driver adapter)               |
| Cache / queue  | Redis via [ioredis](https://github.com/redis/ioredis)                           |
| Object storage | S3-compatible via the [MinIO SDK](https://min.io) (MinIO, R2, AWS S3, …)        |
| Motion / UI    | GSAP, Recharts, dnd-kit, media-chrome                                           |

Each backing service can be **local or cloud**:

| Service        | Local              | Cloud                                  |
| -------------- | ------------------ | -------------------------------------- |
| PostgreSQL     | Postgres container | Neon, Supabase, RDS, …                 |
| Redis          | Redis container    | Upstash, … (`rediss://`)               |
| Object storage | MinIO container    | Cloudflare R2, AWS S3, Backblaze B2, … |

---

## 🚀 Quick start

### Prerequisites

- [Bun](https://bun.sh) `1.x`
- A **PostgreSQL** database (local or cloud)
- A **Redis** instance (local or cloud)
- An **S3-compatible bucket** (local MinIO or cloud R2/S3)

> Don't have Postgres/Redis/MinIO handy? The
> [Docker deployment](#-deployment) can spin them up for you as local containers.

### 1. Install dependencies

```bash
bun install
```

### 2. Configure the environment

```bash
cp .env.example .env
# edit .env — see the Configuration section below
```

Generate a session secret:

```bash
openssl rand -base64 32   # paste into BETTER_AUTH_SECRET
```

### 3. Set up the database

```bash
bunx prisma generate          # generate the Prisma client
bunx prisma migrate deploy    # apply migrations
bun run setup:fts             # create the full-text-search index/trigger
```

### 4. Create the first admin

```bash
bun run create:superadmin     # interactive; add --yes for non-interactive
```

### 5. Run

```bash
# Terminal 1 — the web app
bun run dev

# Terminal 2 — the background worker (bulk ZIP, compression, expiry)
bun run worker.ts
```

Open **http://localhost:3000** and sign in.

---

## ⚙️ Configuration

All configuration is environment variables, documented in
[`.env.example`](.env.example) and validated at boot by
[`lib/env.ts`](lib/env.ts). A missing or malformed value fails fast with a
readable error.

| Variable                                | Required | Description                                                              |
| --------------------------------------- | :------: | ------------------------------------------------------------------------ |
| `NODE_ENV`                              |    –     | `development` \| `test` \| `production`                                  |
| `DATABASE_URL`                          |    ✅    | PostgreSQL connection string. Cloud DBs usually need `?sslmode=require`. |
| `REDIS_URL`                             |    ✅    | Redis connection string. Use `rediss://` for TLS (e.g. Upstash).         |
| `MINIO_ENDPOINT`                        |    ✅    | Storage host (e.g. `localhost`, or `<id>.r2.cloudflarestorage.com`).     |
| `MINIO_PORT`                            |    ✅    | Storage port (`9000` for MinIO, `443` for cloud).                        |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` |    ✅    | Storage credentials.                                                     |
| `MINIO_BUCKET`                          |    ✅    | Bucket name (auto-created on boot if missing).                           |
| `MINIO_USE_SSL`                         |    ✅    | `true` for HTTPS storage, `false` for local HTTP.                        |
| `MINIO_REGION`                          |    –     | Cloud only — e.g. `auto` (R2) or `us-east-1` (AWS).                      |
| `MINIO_PATH_STYLE`                      |    –     | Override addressing style; leave unset to auto-detect.                   |
| `BETTER_AUTH_SECRET`                    |    ✅    | 32+ char random secret for signing sessions.                             |
| `BETTER_AUTH_URL`                       |    ✅    | Public base URL Better-Auth runs under (no trailing slash).              |
| `APP_URL`                               |    ✅    | Public base URL of the app.                                              |
| `CRON_SECRET`                           |    –     | Bearer token guarding the TTL-expiry cron endpoint.                      |
| `SUPERADMIN_*`                          |    –     | Optional non-interactive bootstrap for the first admin.                  |

### Switching a service between local and cloud

You only change the connection value — no code changes:

```bash
# Local Postgres → Neon
DATABASE_URL=postgresql://user:pass@ep-xyz.neon.tech/anticloud?sslmode=require

# Local Redis → Upstash (note the rediss:// TLS scheme)
REDIS_URL=rediss://default:pass@apex-12345.upstash.io:6379

# Local MinIO → Cloudflare R2
MINIO_ENDPOINT=<account_id>.r2.cloudflarestorage.com
MINIO_PORT=443
MINIO_USE_SSL=true
MINIO_REGION=auto
```

---

## 🐳 Deployment

Anticloud ships with a production Docker setup that runs the app + worker and can
**optionally** run local Postgres, Redis, MinIO, and nginx (HTTPS) as containers —
each toggled by a Compose profile. Use it for an all-in-one box, or point any
service at a managed provider.

```bash
cp .env.docker.example .env
# set COMPOSE_PROFILES and the per-service URLs in .env
docker compose build
docker compose run --rm app bunx prisma migrate deploy
docker compose up -d
```

**Full guide — including HTTPS via nginx (Let's Encrypt or self-signed), the
cloud-vs-local matrix, TLS for presigned download URLs, and the TTL cron — lives
in [`deploy/README.md`](deploy/README.md).**

---

## 📂 Project structure

```
app/                 Next.js App Router — routes, pages, API handlers
  (auth)/            sign-in / sign-up
  (app)/             authenticated app: files, search, settings, admin
  api/               REST endpoints (files, auth, cron, metrics, share links)
actions/             server actions (files, roles, tags, jobs, audit, …)
components/          UI components (shadcn/ui based)
lib/                 infrastructure: env, db, redis, storage, auth, permissions
prisma/              schema + migrations
scripts/             setup-fts, create-superadmin
deploy/              Dockerfile assets, nginx configs, deployment guide
worker.ts            background job consumer (bulk archive, compression, expiry)
instrumentation.ts   boot hook — ensures the storage bucket exists
```

---

## 🔒 Security

- Secrets are **environment-only** and validated at boot — never hardcoded.
- Authentication is handled by **Better-Auth**; sessions live in Redis.
- All database access goes through **Prisma** (no raw query string building).
- The audit log is **append-only** with no exposed mutation path.

Found a vulnerability? Please open a private security advisory rather than a
public issue.

---

## 🤝 Contributing

Issues and pull requests are welcome. Please keep changes focused, follow the
existing conventions (kebab-case files, PascalCase components, server actions in
`actions/`), and avoid introducing new runtime dependencies without discussion.

---

## 📄 License

No license file is included yet. Until a `LICENSE` is added, all rights are
reserved by the maintainers — add one (e.g. MIT, Apache-2.0) to make the intended
open-source terms explicit.

---

## 💼 Portfolio summary

Anticloud is a self-hosted, Nextcloud-style file management platform built on
Next.js 16, Prisma/PostgreSQL, Redis, and S3-compatible storage — every backing
service swappable between a local Docker container and a managed cloud
provider with no code changes. It implements two-level RBAC with per-file
grants and visibility modes, tokenized share links, tagging and @mentions,
versioned notes, full-text search, a Redis-backed background job queue with
dead-letter handling, and an append-only audit log, all behind a Better-Auth
session layer. The standout engineering is in the details normally skipped in
demo projects: permission resolution ordering, orphaned-file handling on
account deletion, non-destructive on-demand compression, and Prometheus
metrics for queue and cache health.
