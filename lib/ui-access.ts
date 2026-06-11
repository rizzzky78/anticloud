import type { FileMetaRecord } from "@/lib/file-meta";

export function isAdminOrAbove(role: string): boolean {
  return role === "SUPERADMIN" || role === "ADMIN";
}

export function isSuperAdmin(role: string): boolean {
  return role === "SUPERADMIN";
}

/**
 * Display-only check for whether the current user can mutate a file.
 * The real enforcement lives in the server-side permission handlers.
 */
export function canManage(
  file: Pick<FileMetaRecord, "ownerId" | "isReadOnly">,
  userId: string,
  role: string
): boolean {
  if (isAdminOrAbove(role)) return true;
  if (file.isReadOnly) return false;
  return file.ownerId === userId;
}
