import Redis from "ioredis";
import { env } from "@/lib/env";

/**
 * Redis (Dragonfly) client singleton.
 *
 * `lazyConnect` defers the TCP connection to the first command, so importing this
 * module never connects eagerly. A single instance is cached on `globalThis` to
 * survive Next.js hot-reload in development without leaking connections.
 */
const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function createRedisClient(): Redis {
  return new Redis(env.REDIS_URL, {
    lazyConnect: true,
    // Fail fast instead of buffering commands forever when Redis is unreachable.
    maxRetriesPerRequest: 3,
  });
}

export const redis: Redis = globalForRedis.redis ?? createRedisClient();

if (env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

/**
 * Key-namespace convention. Every Redis key MUST start with one of these
 * prefixes so ownership and invalidation stay predictable across phases.
 * Build keys with `redisKey(NS.session, userId)` rather than hand-concatenating.
 *
 *  - session:    Better-Auth session state (Phase 1)
 *  - perm:       resolved user↔file permission decisions (Phase 2)
 *  - filemeta:   hot file metadata records (Phase 4)
 *  - search:     per-user recent search results (Phase 8)
 *  - tagfreq:    tag-usage sorted set for autocomplete (Phase 6)
 *  - job:        background job state for polling (Phase 9)
 *  - ratelimit:  request/login rate-limit counters (Phase 1/13)
 */
export const NS = {
  session: "session",
  perm: "perm",
  filemeta: "filemeta",
  search: "search",
  tagfreq: "tagfreq",
  job: "job",
  ratelimit: "ratelimit",
} as const;

export type Namespace = (typeof NS)[keyof typeof NS];

/** Join a namespace and id parts into a colon-delimited key: `perm:user:file`. */
export function redisKey(ns: Namespace, ...parts: (string | number)[]): string {
  return [ns, ...parts].join(":");
}
