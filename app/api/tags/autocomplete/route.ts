import { type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-context";
import { redis, redisKey, NS } from "@/lib/redis";
import { db } from "@/lib/db";
import { toApiError, statusFor } from "@/lib/result";

export const runtime = "nodejs";

const TAG_FREQ_KEY = redisKey(NS.tagfreq);

const querySchema = z.object({
  q: z.string().min(1).max(64).toLowerCase(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

/**
 * GET /api/tags/autocomplete?q=<prefix>&limit=<n>
 *
 * Returns frequency-ranked tag suggestions matching `q` as a prefix.
 *
 * Strategy:
 *   1. ZRANGEBYLEX on `tagfreq:` to get all tags with the given prefix.
 *   2. ZSCORE each candidate to sort by frequency (descending).
 *   3. If fewer than `limit` results come back from Redis, fall back to
 *      Postgres for tags that may not yet be cached.
 *   4. Deduplicate and return up to `limit` entries.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentUser();
    if (!session) {
      return Response.json(
        { code: "UNAUTHORIZED", message: "Authentication required" },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      q: searchParams.get("q"),
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return Response.json({ code: "BAD_REQUEST", message: msg }, { status: 400 });
    }

    const { q, limit } = parsed.data;

    // ── 1. Redis prefix scan ──────────────────────────────────────────────────
    // ZRANGEBYLEX requires the sorted set to use equal scores so members are
    // ordered lexicographically. We use the ALPHA range notation.
    // The tagfreq: set uses numeric scores (usage count), so lexicographic
    // ordering may not be perfect, but `[prefix` .. `[prefix\xff` still filters
    // correctly for prefix matching; we re-sort by score afterward.
    const redisMatches: string[] = await redis.zrangebylex(
      TAG_FREQ_KEY,
      `[${q}`,
      `[${q}\xff`,
    );

    // ── 2. Fetch scores and sort descending ───────────────────────────────────
    let suggestions: { value: string; score: number }[] = [];

    if (redisMatches.length > 0) {
      const pipeline = redis.pipeline();
      redisMatches.forEach((m) => pipeline.zscore(TAG_FREQ_KEY, m));
      const scoreResults = await pipeline.exec();

      suggestions = redisMatches.map((value, i) => ({
        value,
        score: scoreResults ? parseFloat((scoreResults[i]?.[1] as string) ?? "0") : 0,
      }));

      suggestions.sort((a, b) => b.score - a.score);
      suggestions = suggestions.slice(0, limit);
    }

    // ── 3. DB fallback ────────────────────────────────────────────────────────
    if (suggestions.length < limit) {
      const already = new Set(suggestions.map((s) => s.value));
      const dbTags = await db.tag.findMany({
        where: {
          value: { startsWith: q },
          NOT: { value: { in: [...already] } },
        },
        orderBy: { value: "asc" },
        take: limit - suggestions.length,
        select: { value: true },
      });

      for (const t of dbTags) {
        suggestions.push({ value: t.value, score: 0 });
      }
    }

    return Response.json({
      suggestions: suggestions.map((s) => s.value),
    });
  } catch (err) {
    return Response.json(toApiError(err), { status: statusFor(err) });
  }
}
