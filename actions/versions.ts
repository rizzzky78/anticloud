"use server";

import { z } from "zod";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-context";
import { AppError } from "@/lib/result";
import { requireAccess } from "@/lib/permissions";
import { assertNotReadOnly, assertWriteAccess } from "@/lib/file-access";
import { recordAudit } from "@/lib/audit";
import { invalidateUserSearchCache } from "@/lib/search";
import {
  deleteFileVersion,
  listFileVersions,
  restoreFileVersion,
  type FileVersionEntry,
} from "@/lib/versions";

const fileIdSchema = z.object({ fileId: z.string().min(1) });
const versionIdSchema = z.object({ versionId: z.string().min(1) });

/** Version history of a file, newest first. Requires read access. */
export async function getFileVersions(payload: unknown): Promise<FileVersionEntry[]> {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const { fileId } = fileIdSchema.parse(payload);
  await requireAccess({ id: session.user.id, role: session.user.role as Role }, fileId, "VIEWER");
  return listFileVersions(fileId);
}

async function loadVersionForWrite(versionId: string) {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const version = await db.fileVersion.findUnique({
    where: { id: versionId },
    select: { id: true, fileId: true, version: true },
  });
  if (!version) throw AppError.notFound("Version not found");

  const file = await assertWriteAccess(session.user, version.fileId);
  assertNotReadOnly(file, session.user.role as string | undefined);
  return { session, version };
}

/**
 * Restore a historical version as the live content. The current content is
 * kept in history, so a restore can itself be undone.
 */
export async function restoreVersion(payload: unknown) {
  const { versionId } = versionIdSchema.parse(payload);
  const { session, version } = await loadVersionForWrite(versionId);

  const result = await restoreFileVersion(versionId, session.user.id);
  await invalidateUserSearchCache();
  await recordAudit({
    actorId: session.user.id,
    action: "file.version_restore",
    targetType: "file",
    targetId: version.fileId,
    metadata: { restoredVersion: version.version },
  });
  return result;
}

/** Permanently delete one historical version. */
export async function deleteVersion(payload: unknown) {
  const { versionId } = versionIdSchema.parse(payload);
  const { session, version } = await loadVersionForWrite(versionId);

  const result = await deleteFileVersion(versionId);
  await recordAudit({
    actorId: session.user.id,
    action: "file.version_delete",
    targetType: "file",
    targetId: version.fileId,
    metadata: { version: version.version },
  });
  return result;
}
