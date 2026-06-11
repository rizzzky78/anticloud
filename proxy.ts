import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function getSessionCookie(request: NextRequest) {
  // Better-Auth typically uses these cookie names. 
  // In production it might use __Secure- prefix.
  return request.cookies.get("better-auth.session_token") || 
         request.cookies.get("__Secure-better-auth.session_token");
}

export function proxy(request: NextRequest) {
  const sessionToken = getSessionCookie(request);

  if (!sessionToken) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Optimistic check for all paths except api routes, auth pages, static files, etc.
    '/((?!api|_next/static|_next/image|favicon.ico|sign-in|sign-up).*)',
  ],
}
