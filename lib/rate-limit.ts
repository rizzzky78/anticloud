import { randomUUID } from "node:crypto";
import { redis, redisKey, NS } from "@/lib/redis";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number;
}

/**
 * Sliding-window rate limiter backed by a Redis sorted set.
 * Each request adds a unique member scored by timestamp; old members outside
 * the window are pruned atomically before counting.
 *
 * @param key       logical identifier (e.g. `upload:userId`)
 * @param max       maximum requests allowed in the window
 * @param windowSeconds  window duration in seconds
 */
export async function checkRateLimit(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const rKey = redisKey(NS.ratelimit, key);
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;
  const member = `${now}:${randomUUID()}`;

  const tx = redis.multi();
  tx.zremrangebyscore(rKey, "-inf", windowStart);
  tx.zadd(rKey, now, member);
  tx.zcard(rKey);
  tx.pexpire(rKey, windowSeconds * 2 * 1000);

  const results = await tx.exec();
  const count = (results?.[2]?.[1] as number) ?? 0;

  return {
    allowed: count <= max,
    remaining: Math.max(0, max - count),
    resetIn: windowSeconds,
  };
}
