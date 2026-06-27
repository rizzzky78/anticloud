<div align="center">

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

## 🏛️ Architecture

Anticloud is built around three separations of concern — **identity & access**,
**file lifecycle**, and **metadata intelligence** — with each backing service
owning exactly one kind of truth:

| Service | Responsibility |
|---------|----------------|
| **Better-Auth** | The entry gate. Produces a verified identity that every downstream layer trusts without re-querying the database per request. |
| **PostgreSQL** | All *relational* truth — ownership, permissions, tags, notes, audit, metadata. Nothing binary ever touches it. |
| **Object storage (S3)** | All *binary* content. Objects are UUID-keyed; the user-visible name never appears in a storage key. |
| **Redis** | Short-term memory — sessions, rate-limit counters, hot-data caches, tag-frequency sets, and the background job queue. |

A few design rules fall out of this:

- **Renames, moves, and metadata edits never touch storage** — they're pure
  database operations. Only an actual binary replacement writes to the bucket.
- **Permission resolution is centralized and ordered**: superadmin bypass →
  explicit per-file grant → file visibility (public/private) → deny. Mention
  restrictions further *narrow* access after RBAC. Handlers trust the resolved
  decision rather than re-checking inline.
- **The app fails fast** — every secret is validated at boot, so it never runs
  half-configured.

---

## ✨ Features

### Files & storage
- **Streamed upload, replace & download** — binaries flow client → handler →
  storage without ever hitting the app server's disk; no size cap by default.
- **Date-grouped browsing** — list views are bucketed server-side into *Today,
  Yesterday, This Week, This Month*, then by calendar month — computed in the
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
  a specific file; file-level permissions override system-level *downward*, never
  upward.
- **Visibility modes** — `PUBLIC` / `PRIVATE`, optional **guest access**,
  **read-only** locks (mutations rejected until lifted), and
  **mention-restricted** files (only mentioned users may access, regardless of
  role).
- **Unowned & orphaned files** — files can exist without an owner; when an owner
  account is deleted its files become *unowned* (preserved per their visibility)
  rather than cascade-deleted.
- **Tokenized share links** — permanent, revocable URLs validated against the
  file's *current* permission state on every request (a token, not a capability).

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

## 📸 Screenshots

> The images below are **placeholders**. Drop your own screenshots into
> [`docs/screenshots/`](docs/screenshots) (overwrite the files, or swap the paths
> for `.png`s) to make this section real.

|  |  |
|:--:|:--:|
| ![Dashboard](docs/screenshots/dashboard.svg) | ![Sign in](docs/screenshots/sign-in.svg) |
| **Dashboard** — file browser & activity | **Sign in** — animated auth experience |
| ![File detail](docs/screenshots/file-detail.svg) | ![Search](docs/screenshots/search.svg) |
| **File detail** — preview, notes, sharing | **Search** — full-text across files & tags |

<div align="center">

![Admin console](docs/screenshots/admin.svg)

**Admin console** — roles, audit log, jobs & recycle bin

</div>

---

## 🧱 Tech stack

| Layer | Choice |
|-------|--------|
| Framework | [Next.js 16](https://nextjs.org) (App Router) + [React 19](https://react.dev) |
| Language | TypeScript |
| Runtime | [Bun](https://bun.sh) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) |
| Auth | [Better-Auth](https://better-auth.com) |
| Database | PostgreSQL via [Prisma 7](https://www.prisma.io) (driver adapter) |
| Cache / queue | Redis via [ioredis](https://github.com/redis/ioredis) |
| Object storage | S3-compatible via the [MinIO SDK](https://min.io) (MinIO, R2, AWS S3, …) |
| Motion / UI | GSAP, Recharts, dnd-kit, media-chrome |

Each backing service can be **local or cloud**:

| Service | Local | Cloud |
|---------|-------|-------|
| PostgreSQL | Postgres container | Neon, Supabase, RDS, … |
| Redis | Redis container | Upstash, … (`rediss://`) |
| Object storage | MinIO container | Cloudflare R2, AWS S3, Backblaze B2, … |

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

| Variable | Required | Description |
|----------|:--------:|-------------|
| `NODE_ENV` | – | `development` \| `test` \| `production` |
| `DATABASE_URL` | ✅ | PostgreSQL connection string. Cloud DBs usually need `?sslmode=require`. |
| `REDIS_URL` | ✅ | Redis connection string. Use `rediss://` for TLS (e.g. Upstash). |
| `MINIO_ENDPOINT` | ✅ | Storage host (e.g. `localhost`, or `<id>.r2.cloudflarestorage.com`). |
| `MINIO_PORT` | ✅ | Storage port (`9000` for MinIO, `443` for cloud). |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | ✅ | Storage credentials. |
| `MINIO_BUCKET` | ✅ | Bucket name (auto-created on boot if missing). |
| `MINIO_USE_SSL` | ✅ | `true` for HTTPS storage, `false` for local HTTP. |
| `MINIO_REGION` | – | Cloud only — e.g. `auto` (R2) or `us-east-1` (AWS). |
| `MINIO_PATH_STYLE` | – | Override addressing style; leave unset to auto-detect. |
| `BETTER_AUTH_SECRET` | ✅ | 32+ char random secret for signing sessions. |
| `BETTER_AUTH_URL` | ✅ | Public base URL Better-Auth runs under (no trailing slash). |
| `APP_URL` | ✅ | Public base URL of the app. |
| `CRON_SECRET` | – | Bearer token guarding the TTL-expiry cron endpoint. |
| `SUPERADMIN_*` | – | Optional non-interactive bootstrap for the first admin. |

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
