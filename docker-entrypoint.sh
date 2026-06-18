#!/bin/sh
# =============================================================================
# docker-entrypoint.sh — web server startup wrapper
#
# When RUN_MIGRATIONS=true (the docker-compose default) this applies any
# pending Prisma migrations before the Next.js server accepts traffic, so the
# database schema is always in sync on deploy. Set RUN_MIGRATIONS=false to skip
# (e.g. when migrations are applied out-of-band).
# =============================================================================
set -e

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  echo "[entrypoint] Applying database migrations (prisma migrate deploy)..."
  bunx prisma migrate deploy
  echo "[entrypoint] Migrations applied."
fi

echo "[entrypoint] Starting: $*"
exec "$@"
