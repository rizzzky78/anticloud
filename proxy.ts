import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { redis } from '@/lib/redis';

function getSessionCookie(request: NextRequest) {
  // Better-Auth uses the __Secure- prefix only when served over HTTPS.
  return request.cookies.get("better-auth.session_token") ||
         request.cookies.get("__Secure-better-auth.session_token");
}

/**
 * Root proxy: optimistic auth redirect for pages and request counting.
 *
 * Next.js 16 runs the proxy on the Node.js runtime, so the shared Redis client
 * is used directly (fire-and-forget) instead of a loopback HTTP call per
 * request. Errors are counted in `instrumentation.ts#onRequestError`.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isNextAsset = pathname.startsWith('/_next') || pathname.startsWith('/static') || pathname.includes('.');
  const isMetrics = pathname === '/api/metrics';
  const isApiAuth = pathname.startsWith('/api/auth');
  const isAuthPage = pathname === '/sign-in' || pathname === '/sign-up';
  // Public share-link landing pages need no session.
  const isPublicPage = pathname.startsWith('/s/');
  const isApi = pathname.startsWith('/api/');

  if (!isNextAsset && !isMetrics && !isApiAuth) {
    redis.incr("metrics:http_requests_total").catch(() => {});
  }

  if (!isApi && !isAuthPage && !isPublicPage && !isNextAsset && !getSessionCookie(request)) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
