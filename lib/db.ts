import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@/lib/env";

/**
 * Prisma client singleton.
 *
 * Uses the Postgres driver adapter (Prisma 7). The adapter is a lazy factory and
 * `PrismaClient` does not open a connection on construction — the pool connects
 * on first query. A single instance is cached on `globalThis` so Next.js
 * hot-reload in development does not exhaust connections by re-instantiating.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg(env.DATABASE_URL);
  return new PrismaClient({ adapter });
}

export const db: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
