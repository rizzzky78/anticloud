# Self-hosted deployment (Docker + nginx)

Runs anticloud on **Ubuntu Server 24+** alongside your existing nginx and the
already-running **Postgres**, **Dragonfly** and **MinIO** containers. Intranet
users reach it at **`https://10.54.204.59:3070`** — nginx terminates TLS on port
3070 and proxies to the app container, which is published on the host loopback at
`127.0.0.1:3071`.

## Layout

| File | Purpose |
|------|---------|
| [`../Dockerfile`](../Dockerfile) | Bun/Alpine production image (app + worker share it) |
| [`../docker-compose.yml`](../docker-compose.yml) | `app` + `worker` services |
| [`../.env.docker.example`](../.env.docker.example) | Runtime env contract — copy to `.env.docker` |
| [`nginx/anticloud.conf`](nginx/anticloud.conf) | Non-conflicting HTTPS reverse-proxy vhost |

## Architecture

```
   intranet browser
   https://10.54.204.59:3070
          │  (TLS)
        nginx  :3070 ssl ──►  127.0.0.1:3071   anticloud-app    (next start, :3070 in-container)
          │
          │  presigned downloads → http://10.54.204.59:9000 (MinIO)   anticloud-worker (job queue)
          │
   host-published ports: Postgres 5432 · Dragonfly 6379 · MinIO 9000
```

Both containers run from the **same image**; the worker just overrides the
command to `bun run worker.ts`. Neither is exposed publicly — only nginx is.

## 1. Configure env

```bash
cp .env.docker.example .env.docker
# edit .env.docker — see the notes in that file, especially MINIO_ENDPOINT
openssl rand -base64 32   # for BETTER_AUTH_SECRET
```

### Reaching the existing services (choose one)

- **Option A — host-gateway (default).** The existing containers already publish
  `5432 / 6379 / 9000` on the host. The compose file maps
  `host.docker.internal → host-gateway`, so the URLs in `.env.docker` use
  `host.docker.internal`. Nothing else to do.
- **Option B — shared Docker network.** Uncomment the `networks` blocks in
  `docker-compose.yml`, set `name:` to your existing network (`docker network ls`),
  and change the hostnames in `.env.docker` to the **container names**
  (e.g. `postgres`, `dragonfly`, `minio`).

> **MinIO note:** presigned bulk-download URLs are generated from `MINIO_ENDPOINT`
> and opened by the user's browser, so it must be reachable from the intranet
> (e.g. `10.54.204.59:9000`), **not** an internal-only / container-only name.
> See `.env.docker.example`.

## 2. Build & run migrations

```bash
docker compose build

# Apply the schema to the existing Postgres (run once, and after each schema change):
docker compose run --rm app bunx prisma migrate deploy
```

## 3. Start

```bash
docker compose up -d
docker compose ps
docker compose logs -f app worker
```

The MinIO bucket is created automatically on first boot (`instrumentation.ts`).

## 4. Wire up nginx (HTTPS on :3070)

nginx listens on a **dedicated port (3070)**, so it does not conflict with your
existing sites on 80/443.

### TLS for an intranet IP

Let's Encrypt cannot issue certificates for a bare IP, so use a self-signed cert
(or one from your internal CA). Generate a self-signed cert with the IP in the
SAN field (browsers require SAN, not just CN):

```bash
sudo mkdir -p /etc/nginx/ssl
sudo openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/anticloud.key \
  -out    /etc/nginx/ssl/anticloud.crt \
  -subj   "/CN=10.54.204.59" \
  -addext "subjectAltName=IP:10.54.204.59"
```

Users will see a browser trust warning unless you distribute this cert (or your
internal CA root) to client machines. For zero warnings, issue the cert from an
internal CA that clients already trust.

### Enable the site

```bash
sudo cp deploy/nginx/anticloud.conf /etc/nginx/sites-available/anticloud.conf
sudo ln -s /etc/nginx/sites-available/anticloud.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

`client_max_body_size 0` and disabled buffering are tuned for large file
up/downloads — set a cap in the conf if you want a hard limit.

> **Firewall:** make sure port 3070 is open on the host for the intranet, e.g.
> `sudo ufw allow 3070/tcp`.

## Updating

```bash
git pull
docker compose build
docker compose run --rm app bunx prisma migrate deploy   # if schema changed
docker compose up -d
```

## TTL expiry cron (optional)

`app/api/cron/expire` hard-deletes expired files and is guarded by `CRON_SECRET`.
Trigger it from the host crontab:

```cron
*/15 * * * * curl -fsSk -H "Authorization: Bearer YOUR_CRON_SECRET" https://10.54.204.59:3070/api/cron/expire >/dev/null
```

(`-k` skips cert verification for the self-signed cert.)

## Troubleshooting

- **Container exits immediately with an env error** — `.env.docker` is missing a
  required value; the message lists exactly which one (`lib/env.ts`).
- **Uploads 500 with `NoSuchBucket`** — MinIO isn't reachable; check
  `MINIO_*` and that the bucket boot in the logs succeeded.
- **Bulk-download links 404/can't connect in the browser** — `MINIO_ENDPOINT`
  is set to an internal-only host; point it at your public S3 domain.
- **Login redirect loops / wrong URLs** — `BETTER_AUTH_URL` / `APP_URL` must be
  exactly `https://10.54.204.59:3070` (include the port) and match how the
  browser addresses the app.
