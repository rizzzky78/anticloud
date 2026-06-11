import { type File } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/result";

/** Minimal user shape required for access checks. */
export interface AccessUser {
  id: string;
  role?: string | null;
}

/**
 * Load a file and verify the caller has write-level access:
 *   SUPERADMIN → always allowed.
 *   Owner      → allowed.
 *   Explicit ADMIN or SUPERADMIN file-permission grant → allowed.
 *   Otherwise  → 403.
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

  const role = user.role ?? "";
  if (role === "SUPERADMIN") return file;
  if (file.ownerId === user.id) return file;

  const grant = await db.filePermission.findUnique({
    where: { fileId_userId: { fileId, userId: user.id } },
    select: { role: true },
  });
  if (grant?.role === "ADMIN" || grant?.role === "SUPERADMIN") return file;

  throw AppError.forbidden();
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
