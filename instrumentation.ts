/**
 * Next.js startup hook. `register` runs once per server instance before any
 * request is handled.
 *
 * We use it to guarantee the MinIO bucket exists. Without this, a fresh
 * environment has no bucket and every `putObject` throws `NoSuchBucket`, which
 * surfaces to the client as an opaque 500 on upload.
 */
export async function register() {
  // Storage uses the Node MinIO client; skip the Edge runtime entirely.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { ensureBucket } = await import("@/lib/storage");
    await ensureBucket();
  } catch (err) {
    // Don't crash the server on boot — log loudly so the misconfiguration is
    // visible. Uploads will still 500 until storage is reachable, but reads and
    // the rest of the app stay up.
    console.error("[instrumentation] Failed to ensure MinIO bucket exists:", err);
  }
}

/**
 * Called by Next.js for every uncaught server error (RSC render, route
 * handler, server action, proxy). Feeds the `http_errors_total` metric.
 */
export async function onRequestError() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { redis } = await import("@/lib/redis");
    await redis.incr("metrics:http_errors_total");
  } catch {
    // Metrics must never break error handling.
  }
}
