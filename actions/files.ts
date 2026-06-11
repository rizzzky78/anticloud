"use server";

import { z } from "zod";
import { Visibility } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-context";
import { AppError } from "@/lib/result";
import { assertWriteAccess, assertNotReadOnly } from "@/lib/file-access";
import { bustFileMeta } from "@/lib/file-meta";
import { invalidatePermCache } from "@/lib/permissions";

// ─── Shared helpers ───────────────────────────────────────────────────────────

type SessionUser = NonNullable<
  Awaited<ReturnType<typeof getCurrentUser>>
>["user"];

// ─── renameFile ───────────────────────────────────────────────────────────────

const renameSchema = z.object({
  fileId: z.string().min(1),
  displayName: z.string().min(1).max(255).trim(),
});

/**
 * Rename a file's user-visible display name.
 * Pure DB write — MinIO is never touched.
 */
export async function renameFile(payload: unknown) {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const { fileId, displayName } = renameSchema.parse(payload);
  const file = await assertWriteAccess(session.user as SessionUser, fileId);
  assertNotReadOnly(file, session.user.role as string | undefined);

  await db.file.update({
    where: { id: fileId },
    data: { displayName },
  });

  await bustFileMeta(fileId);
  
  // Phase 8 Search refresh
  const { updateSearchVector, invalidateUserSearchCache } = await import("@/lib/search");
  await updateSearchVector(fileId);
  await invalidateUserSearchCache(session.user.id);
  
  // Phase-10 stub: audit("file.rename", fileId)
  return { fileId };
}

// ─── moveFile ─────────────────────────────────────────────────────────────────

const moveSchema = z.object({
  fileId: z.string().min(1),
  folderPath: z
    .string()
    .min(1)
    .max(1024)
    .regex(/^\//, "Folder path must start with /")
    .trim(),
});

/**
 * Move a file to a different virtual folder path.
 * Pure DB write — MinIO is never touched.
 */
export async function moveFile(payload: unknown) {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const { fileId, folderPath } = moveSchema.parse(payload);
  const file = await assertWriteAccess(session.user as SessionUser, fileId);
  assertNotReadOnly(file, session.user.role as string | undefined);

  await db.file.update({
    where: { id: fileId },
    data: { folderPath },
  });

  await bustFileMeta(fileId);
  // Phase-10 stub: audit("file.move", fileId)
  return { fileId };
}

// ─── setVisibility ────────────────────────────────────────────────────────────

const visibilitySchema = z.object({
  fileId: z.string().min(1),
  visibility: z.nativeEnum(Visibility),
  /**
   * Allow unauthenticated (guest) access when the file is PUBLIC.
   * Ignored for PRIVATE files.
   */
  guestAccess: z.boolean().optional(),
});

/**
 * Change a file's visibility (PUBLIC / PRIVATE) and optional guest-access flag.
 * Changing visibility invalidates the permission cache for the file so that
 * all cached decisions derived from the old visibility are evicted.
 */
export async function setVisibility(payload: unknown) {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const { fileId, visibility, guestAccess } = visibilitySchema.parse(payload);
  await assertWriteAccess(session.user as SessionUser, fileId);
  // setVisibility is not blocked by isReadOnly — visibility is an access control
  // setting, not file content. Only content mutations check isReadOnly.

  const newGuestAccess = visibility === "PRIVATE" ? false : (guestAccess ?? false);

  await db.file.update({
    where: { id: fileId },
    data: { visibility, guestAccess: newGuestAccess },
  });

  await bustFileMeta(fileId);
  // Visibility change invalidates ALL cached permission decisions for this file.
  await invalidatePermCache(null, fileId);

  // Phase-10 stub: audit("file.visibility", fileId)
  return { fileId };
}
