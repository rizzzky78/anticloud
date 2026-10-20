import { auth } from "@/lib/auth";

/**
 * Server-side account administration helpers built on Better-Auth's internal
 * adapter (plan/phase-22). Sessions live in Redis secondary storage and carry
 * a snapshot of the user record, so any direct change to user fields that
 * authorization reads (role, disabled state, image) must refresh or revoke
 * the cached sessions.
 */

/** Re-snapshot the user into every active session (after role/profile edits). */
export async function refreshUserSessions(userId: string): Promise<void> {
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.findUserById(userId);
  if (user) await ctx.internalAdapter.refreshUserSessions(user);
}

/** Sign a user out everywhere. */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  const ctx = await auth.$context;
  await ctx.internalAdapter.deleteUserSessions(userId);
}

/** Hash a password with the same algorithm Better-Auth verifies against. */
export async function hashPassword(password: string): Promise<string> {
  const ctx = await auth.$context;
  return ctx.password.hash(password);
}
