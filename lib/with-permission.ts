import { getCurrentUser } from "@/lib/auth-context";
import { requireAccess, AccessLevel } from "@/lib/permissions";

/**
 * Middleware wrapper used by all file-mutation handlers/actions.
 * Loads file + user, resolves access, and rejects via AppError(403) before handler logic.
 * 
 * @example
 * const { user, level } = await withPermission(fileId, "ADMIN");
 * // Do secure things
 */
export async function withPermission(fileId: string, minLevel: AccessLevel) {
  const session = await getCurrentUser();
  const user = session?.user || null;
  const level = await requireAccess(user as any, fileId, minLevel);
  return { user, level };
}
