import { type File, type Role } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/result";
import { requireAccess } from "@/lib/permissions";

/** Minimal user shape required for access checks. */
export interface AccessUser {
  id: string;
  role?: string | null;
}

/**
 * Load a file and verify the caller has manage-level (ADMIN) access, as
 * resolved by the central permission resolver (`lib/permissions.ts`):
 *   SUPERADMIN                         → always allowed.
 *   Owner                              → allowed.
 *   Global ADMIN on public/unowned files (subject to mention restriction).
 *   Explicit ADMIN grant (clamped to the caller's system role).
 *   Otherwise                          → 403.
 *
 * Global ADMINs cannot manage other users' private files they cannot read.
 *
 * @param allowSoftDeleted - set true when the caller legitimately needs to
 *   operate on a soft-deleted file (e.g. recovery). Default false.
 */
export async function assertWriteAccess(
  user: AccessUser,
  fileId: string,
  { allowSoftDeleted = false } = {},
): Promise<File> {
  const file = await db.file.findFirst({
    where: allowSoftDeleted ? { id: fileId } : { id: fileId, deletedAt: null },
  });
  if (!file) throw AppError.notFound("File not found");

  await requireAccess(
    { id: user.id, role: (user.role ?? "GUEST") as Role },
    fileId,
    "ADMIN",
  );
  return file;
}

/**
 * Throw AppError.readOnly when the file has the read-only flag set and the
 * caller is not SUPERADMIN.
 */
export function assertNotReadOnly(
  file: Pick<File, "isReadOnly">,
  userRole?: string | null,
): void {
  if (file.isReadOnly && userRole !== "SUPERADMIN") {
    throw AppError.readOnly("This file is read-only");
  }
}

/**
 * Load a live file and verify the caller may change its CONTENT (upload a new
 * version, restore a version): EDITOR level or higher.
 */
export async function assertEditAccess(user: AccessUser, fileId: string): Promise<File> {
  const file = await db.file.findFirst({ where: { id: fileId, deletedAt: null } });
  if (!file) throw AppError.notFound("File not found");

  await requireAccess(
    { id: user.id, role: (user.role ?? "GUEST") as Role },
    fileId,
    "EDITOR",
  );
  return file;
}
