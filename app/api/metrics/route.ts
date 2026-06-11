import { type NextRequest } from "next/server";
import { redis, redisKey, NS } from "@/lib/redis";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * GET /api/metrics
 *
 * Exposes Prometheus-scrape-compatible metrics.
 * Secured via Bearer token matching env.CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  // Validate token
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const queueKey = redisKey(NS.job, "queue");

    // Fetch metrics from Redis
    const [
      requestsRaw,
      errorsRaw,
      cacheHitsRaw,
      cacheMissesRaw,
      jobFailuresRaw,
      queueDepth,
    ] = await Promise.all([
      redis.get("metrics:http_requests_total"),
      redis.get("metrics:http_errors_total"),
      redis.get("metrics:cache_hits_total"),
      redis.get("metrics:cache_misses_total"),
      redis.get("metrics:job_failures_total"),
      redis.llen(queueKey),
    ]);

    const requests = parseInt(requestsRaw || "0", 10);
    const errors = parseInt(errorsRaw || "0", 10);
    const cacheHits = parseInt(cacheHitsRaw || "0", 10);
    const cacheMisses = parseInt(cacheMissesRaw || "0", 10);
    const jobFailures = parseInt(jobFailuresRaw || "0", 10);

    // Format into standard Prometheus exposition format
    const output = [
      `# HELP anticloud_http_requests_total Total number of HTTP requests processed`,
      `# TYPE anticloud_http_requests_total counter`,
      `anticloud_http_requests_total ${requests}`,
      ``,
      `# HELP anticloud_http_errors_total Total number of HTTP errors (status >= 400)`,
      `# TYPE anticloud_http_errors_total counter`,
      `anticloud_http_errors_total ${errors}`,
      ``,
      `# HELP anticloud_cache_hits_total Total number of cache hits`,
      `# TYPE anticloud_cache_hits_total counter`,
      `anticloud_cache_hits_total ${cacheHits}`,
      ``,
      `# HELP anticloud_cache_misses_total Total number of cache misses`,
      `# TYPE anticloud_cache_misses_total counter`,
      `anticloud_cache_misses_total ${cacheMisses}`,
      ``,
      `# HELP anticloud_job_failures_total Total number of background job execution failures`,
      `# TYPE anticloud_job_failures_total counter`,
      `anticloud_job_failures_total ${jobFailures}`,
      ``,
      `# HELP anticloud_job_queue_depth Current number of jobs in the Redis queue`,
      `# TYPE anticloud_job_queue_depth gauge`,
      `anticloud_job_queue_depth ${queueDepth}`,
    ].join("\n") + "\n";

    return new Response(output, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    });
  } catch (err: any) {
    console.error("Failed to generate metrics:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
