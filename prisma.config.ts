import { defineConfig } from "prisma/config";

/**
 * Prisma CLI configuration (Prisma 7).
 *
 * Prisma 7 no longer auto-loads `.env`, so we load it here for CLI commands
 * (migrate/introspect/studio). This is CLI tooling, not application runtime —
 * application code still reads config exclusively through `lib/env.ts`.
 * `process.loadEnvFile` is a no-op-on-miss: if `.env` is absent we fall back to
 * the ambient environment (e.g. CI secrets), which keeps `prisma generate`
 * working without a database.
 */
try {
  process.loadEnvFile();
} catch {
  // No `.env` file present — rely on the ambient environment.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
});
