import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function getSessionCookie(request: NextRequest) {
  // Better-Auth typically uses these cookie names. 
  // In production it might use __Secure- prefix.
  return request.cookies.get("better-auth.session_token") || 
         request.cookies.get("__Secure-better-auth.session_token");
}

/**
 * Root proxy to handle authentication, and count requests and response errors.
 * Uses fire-and-forget internal fetches to /api/telemetry to increment Redis counters,
 * avoiding Edge Runtime TCP / ioredis connection issues.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isNextAsset = pathname.startsWith('/_next') || pathname.startsWith('/static') || pathname.includes('.');
  const isApiTelemetry = pathname === '/api/telemetry' || pathname === '/api/metrics';
  const isApiAuth = pathname.startsWith('/api/auth');
  const isAuthPage = pathname === '/sign-in' || pathname === '/sign-up';
  const isApi = pathname.startsWith('/api/');

  const shouldRunTelemetry = !isNextAsset && !isApiTelemetry && !isApiAuth;
  const shouldRunAuth = !isApi && !isAuthPage && !isNextAsset;

  if (shouldRunTelemetry) {
    const origin = request.nextUrl.origin;
    // Asynchronously increment request metric
    fetch(`${origin}/api/telemetry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "request" }),
    }).catch(() => {});
  }

  if (shouldRunAuth) {
    const sessionToken = getSessionCookie(request);

    if (!sessionToken) {
      return NextResponse.redirect(new URL('/sign-in', request.url));
    }
  }

  const response = await NextResponse.next();

  if (response.status >= 400 && shouldRunTelemetry) {
    const origin = request.nextUrl.origin;
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
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
