import { auth } from "@/lib/auth";
import { headers } from "next/headers";

/**
 * The real security gate. Every protected Server Action / route handler / RSC calls this.
 *
 * The signed cookie cache is bypassed so authorization always sees the current
 * role and session state (a demoted or signed-out-elsewhere user loses access
 * immediately). Session lookups still hit Redis secondary storage, not Postgres.
 */
export async function getCurrentUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  });
  // Belt and braces: disabling revokes sessions, but never honor a session
  // whose cached user record says the account is disabled.
  if (session?.user && (session.user as { disabledAt?: Date | string | null }).disabledAt) {
    return null;
  }
  return session;
}
