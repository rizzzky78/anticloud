import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Root middleware to count requests and response errors.
 * Uses fire-and-forget internal fetches to /api/telemetry to increment Redis counters,
 * avoiding Edge Runtime TCP / ioredis connection issues.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Quick check to ignore obvious static/system files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const origin = request.nextUrl.origin;

  // Asynchronously increment request metric
  fetch(`${origin}/api/telemetry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "request" }),
  }).catch(() => {});

  const response = await NextResponse.next();

  if (response.status >= 400) {
    // Asynchronously increment error metric
    fetch(`${origin}/api/telemetry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "error" }),
    }).catch(() => {});
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api/auth (Better-Auth routes)
     * - api/telemetry (Self-loop telemetry helper)
     * - api/metrics (Scraped metrics endpoint)
     * - _next/static, _next/image, favicon.ico (Next.js assets)
     */
    "/((?!api/auth|api/telemetry|api/metrics|_next/static|_next/image|favicon.ico).*)",
  ],
};
