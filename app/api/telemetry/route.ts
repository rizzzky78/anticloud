import { type NextRequest } from "next/server";
import { redis } from "@/lib/redis";

export const runtime = "nodejs";

/**
 * POST /api/telemetry
 *
 * Internal helper to increment request and error counters in Redis.
 * This is used by the Edge middleware to bypass Edge Runtime's TCP driver limitation.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type } = body as { type: string };

    if (type === "request") {
      await redis.incr("metrics:http_requests_total");
    } else if (type === "error") {
      await redis.incr("metrics:http_errors_total");
    }

    return new Response(null, { status: 204 });
  } catch (err) {
    return new Response(null, { status: 500 });
  }
}
