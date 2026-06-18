# anticloud — Self-Hosted Deployment (Docker)

Step-by-step guide to run **anticloud** on a Linux server (Ubuntu Server) behind
nginx over HTTPS on the intranet.

Target deployment: **https://10.54.204.59:3070**

---

## 1. Architecture

```
                         host:3070 (HTTPS)
                              │
                         ┌────▼─────┐
                         │  nginx   │   TLS termination (self-signed cert)
                         └────┬─────┘
                              │ http     private docker network: anticloud-net
                         ┌────▼─────────────────┐
                         │ anticloud-production │   Next.js web server :3000
                         └────┬─────────────────┘
                              │     anticloud-worker  (job queue consumer)
                              │ host.docker.internal
        ┌─────────────────────┼──────────────────────────┐
    Postgres :5432       Dragonfly :6379            MinIO :9000
 (existing containers already running on this host)
```

Three containers are created by this compose project:

| Container               | Role                                                   | Ports            |
| ----------------------- | ------------------------------------------------------ | ---------------- |
| `anticloud-nginx`       | HTTPS reverse proxy, terminates TLS                    | `3070` → host    |
| `anticloud-production`  | Next.js 16 web server (standalone), runs DB migrations | internal `3000`  |
| `anticloud-worker`      | Background worker — compression & bulk-archive jobs    | none             |

PostgreSQL, DragonflyDB, and MinIO are **not** managed here — they are expected
to already be running on the host with their default ports published.

---

## 2. Prerequisites

- Docker Engine + Compose V2 plugin (`docker compose version`).
- Postgres, DragonflyDB, and MinIO running on the host with ports published
  (`5432`, `6379`, `9000`).
- A database and MinIO bucket (or credentials allowed to create the bucket — the
  app auto-creates the bucket on boot via `instrumentation.ts`).

> **Important — host networking:** the app containers reach the backing services
> through `host.docker.internal`, which resolves to the docker bridge gateway.
> The backing services must therefore listen on the host gateway interface
> (bind to `0.0.0.0`, not only `127.0.0.1`). If Postgres/Dragonfly/MinIO only
> listen on `127.0.0.1`, the containers will not be able to connect.

---

## 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set real values. At minimum:

- `BETTER_AUTH_SECRET` — at least 32 chars: `openssl rand -base64 48`
- `CRON_SECRET` — `openssl rand -hex 32`
- `DATABASE_URL` — Postgres user/password/db
- `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` / `MINIO_BUCKET`
- `APP_URL` and `BETTER_AUTH_URL` — must match the URL the browser uses,
  including scheme + port (`https://10.54.204.59:3070`).
- `HTTPS_PORT` — host port nginx publishes (default `3070`).

The full contract and inline notes live in [`.env.example`](.env.example).

---

## 4. Generate the TLS certificate

A self-signed certificate is used for the intranet. Pass the server IP (and any
DNS names) so the cert includes them as SANs:

```bash
bash nginx/generate-cert.sh 10.54.204.59
```

This writes `nginx/certs/anticloud.crt` and `nginx/certs/anticloud.key`, which
nginx mounts read-only. Browsers will show a one-time trust warning (expected for
self-signed certs — accept the exception, or distribute the cert to clients).

---

## 5. Build and start

```bash
docker compose --env-file .env up -d --build
```

This builds both images (web + worker) and starts all three containers.
On first boot the web container applies database migrations
(`prisma migrate deploy`, controlled by `RUN_MIGRATIONS=true`).

Check status and logs:

```bash
docker compose ps
docker compose logs -f anticloud-production
docker compose logs -f anticloud-worker
```

All three containers should report `healthy` / `running`.

---

## 6. Create the first superadmin

After the stack is up and migrations have applied, create an initial admin
account by running the provisioning script in a one-off worker container:

```bash
docker compose run --rm anticloud-worker bun run scripts/create-superadmin.ts
```

If your deployment relies on full-text search indexes, initialize them too:

```bash
docker compose run --rm anticloud-worker bun run scripts/setup-fts.ts
```

---

## 7. Verify

Open **https://10.54.204.59:3070** in a browser (accept the self-signed
certificate), sign in with the superadmin account, and confirm uploads work
(this exercises MinIO) and that a compression/bulk-download job completes (this
exercises the worker + Redis).

---

## 8. Operations

**Update to a new build:**

```bash
git pull
docker compose --env-file .env up -d --build
```

**Restart / stop:**

```bash
docker compose restart
docker compose down            # stop & remove containers (data lives in the
                               # external Postgres/MinIO, so nothing is lost)
```

**Apply migrations manually** (if you set `RUN_MIGRATIONS=false`):

```bash
docker compose run --rm anticloud-production bunx prisma migrate deploy
```

**Rotate the certificate** — re-run step 4, then:

```bash
docker compose restart anticloud-nginx
```

---

## 9. Troubleshooting

| Symptom                                   | Likely cause / fix                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| Container exits with env validation error | A variable in `.env` is missing/invalid — the log lists exactly which one.          |
| `ECONNREFUSED` to Postgres/Redis/MinIO    | Backing service not listening on the host gateway. Bind it to `0.0.0.0`, not `127.0.0.1`. |
| Uploads return 500 (`NoSuchBucket`)       | MinIO credentials can't create/access `MINIO_BUCKET`; check keys & bucket policy.   |
| Jobs stay `PENDING` forever               | `anticloud-worker` is down or can't reach Redis — check `docker compose logs anticloud-worker`. |
| Browser cert warning                      | Expected for self-signed certs; accept the exception or distribute the cert.         |
| Login redirect loop / wrong URLs          | `APP_URL` / `BETTER_AUTH_URL` don't match the browser URL (scheme + port).           |
