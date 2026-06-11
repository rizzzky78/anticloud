import { redis } from "@/lib/redis";

/**
 * Small JSON cache helpers over the shared Redis client so phases don't
 * hand-roll serialization. Keys should be built via `redisKey()` (see
 * `lib/redis.ts`) to respect the namespace convention.
 */

/** Read and parse a JSON value. Returns `null` on miss or unparseable data. */
export async function getJSON<T>(key: string): Promise<T | null> {
  const raw = await redis.get(key);
  if (raw === null) {
    await redis.incr("metrics:cache_misses_total").catch(() => {});
    return null;
  }
  await redis.incr("metrics:cache_hits_total").catch(() => {});
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Serialize and store a JSON value, optionally with a TTL in seconds. */
export async function setJSON(
  key: string,
  value: unknown,
  ttlSeconds?: number,
): Promise<void> {
  const raw = JSON.stringify(value);
  if (ttlSeconds && ttlSeconds > 0) {
    await redis.set(key, raw, "EX", ttlSeconds);
  } else {
    await redis.set(key, raw);
  }
}

/** Delete one or more exact keys. Returns the number of keys removed. */
export async function del(...keys: string[]): Promise<number> {
  if (keys.length === 0) return 0;
  return redis.del(...keys);
}

/**
 * Delete every key matching `prefix*` using a non-blocking SCAN cursor.
 * Use for namespace invalidation (e.g. `delByPrefix("search:" + userId)`).
 * Returns the number of keys removed.
 */
export async function delByPrefix(prefix: string): Promise<number> {
  let cursor = "0";
  let removed = 0;
  do {
    const [next, keys] = await redis.scan(
      cursor,
      "MATCH",
      `${prefix}*`,
      "COUNT",
      100,
    );
    cursor = next;
    if (keys.length > 0) {
      removed += await redis.unlink(...keys);
    }
  } while (cursor !== "0");
  return removed;
}
