import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError } from "@/lib/result";
import { removeObjects } from "@/lib/storage";
import { bustFileMeta } from "@/lib/file-meta";
import { queueThumbnail } from "@/lib/thumbnails";

/**
 * File version history (plan/phase-13).
 *
 * The `File` row always points at the live binary. Replacing or restoring
 * content snapshots the outgoing binary into a `FileVersion` row, so storage
 * objects are never overwritten in place and every prior state is recoverable
 * until pruned by `FILE_VERSION_LIMIT`.
 */

export interface FileVersionEntry {
  id: string;
  version: number;
  mimeType: string;
  /** Serialised BigInt. */
  size: string;
  uploadedBy: { id: string; name: string } | null;
  uploadedAt: string;
  supersededAt: string;
}

/** Drop the outdated thumbnail object and queue one for the new content. */
async function afterContentChange(
  oldThumbnailKey: string | null,
  file: { id: string; mimeType: string; size: bigint },
) {
  if (oldThumbnailKey) await removeObjects([oldThumbnailKey]).catch(() => {});
  await queueThumbnail(file).catch((err) =>
    console.error(`[versions] Failed to queue thumbnail for ${file.id}:`, err),
  );
}

/** Resolve a user id only if the account still exists (FK safety). */
async function existingUserId(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  return user?.id ?? null;
}

/**
 * Point a file at freshly uploaded content, moving the previous binary into
 * history. Uses an optimistic version check so concurrent replaces cannot
 * silently lose a snapshot.
 */
export async function replaceFileContent(input: {
  fileId: string;
  newObjectKey: string;
  mimeType: string;
  size: bigint;
  sha256?: string | null;
  actorId: string;
}): Promise<{ version: number }> {
  const file = await db.file.findUnique({ where: { id: input.fileId } });
  if (!file) throw AppError.notFound("File not found");

  const previousUploader = await existingUserId(file.contentUploadedById ?? file.ownerId);
  const keepHistory = env.FILE_VERSION_LIMIT > 0;

  const nextVersion = await db.$transaction(async (tx) => {
    const updated = await tx.file.updateMany({
      where: { id: file.id, version: file.version },
      data: {
        objectKey: input.newObjectKey,
        mimeType: input.mimeType,
        size: input.size,
        sha256: input.sha256 ?? null,
        version: file.version + 1,
        contentUploadedById: input.actorId,
        contentUpdatedAt: new Date(),
        thumbnailKey: null,
      },
    });
    if (updated.count !== 1) {
      throw AppError.conflict("The file was modified concurrently. Please retry.");
    }

    if (keepHistory) {
      await tx.fileVersion.create({
        data: {
          fileId: file.id,
          version: file.version,
          objectKey: file.objectKey,
          mimeType: file.mimeType,
          size: file.size,
          sha256: file.sha256,
          uploadedById: previousUploader,
          uploadedAt: file.contentUpdatedAt,
        },
      });
    }
    return file.version + 1;
  });

  if (!keepHistory) {
    await removeObjects([file.objectKey]).catch((err) =>
      console.error(`[versions] Failed to remove replaced object for ${file.id}:`, err),
    );
  }

  await afterContentChange(file.thumbnailKey, {
    id: file.id,
    mimeType: input.mimeType,
    size: input.size,
  });
  await bustFileMeta(file.id);
  await pruneVersions(file.id);
  return { version: nextVersion };
}

/**
 * Make a historical version the live content again. The current content is
 * snapshotted first, so restoring is itself undoable.
 */
export async function restoreFileVersion(versionId: string, actorId: string) {
  const target = await db.fileVersion.findUnique({ where: { id: versionId } });
  if (!target) throw AppError.notFound("Version not found");

  const file = await db.file.findUnique({ where: { id: target.fileId } });
  if (!file) throw AppError.notFound("File not found");

  const previousUploader = await existingUserId(file.contentUploadedById ?? file.ownerId);

  await db.$transaction(async (tx) => {
    // Release the target's object key before the File row takes it over.
    await tx.fileVersion.delete({ where: { id: target.id } });

    const updated = await tx.file.updateMany({
      where: { id: file.id, version: file.version },
      data: {
        objectKey: target.objectKey,
        mimeType: target.mimeType,
        size: target.size,
        sha256: target.sha256,
        version: file.version + 1,
        contentUploadedById: actorId,
        contentUpdatedAt: new Date(),
        thumbnailKey: null,
      },
    });
    if (updated.count !== 1) {
      throw AppError.conflict("The file was modified concurrently. Please retry.");
    }

    await tx.fileVersion.create({
      data: {
        fileId: file.id,
        version: file.version,
        objectKey: file.objectKey,
        mimeType: file.mimeType,
        size: file.size,
        sha256: file.sha256,
        uploadedById: previousUploader,
        uploadedAt: file.contentUpdatedAt,
      },
    });
  });

  await afterContentChange(file.thumbnailKey, {
    id: file.id,
    mimeType: target.mimeType,
    size: target.size,
  });
  await bustFileMeta(file.id);
  await pruneVersions(file.id);
  return { fileId: file.id, restoredVersion: target.version };
}

/** Delete a single historical version (row + binary). */
export async function deleteFileVersion(versionId: string) {
  const target = await db.fileVersion.findUnique({ where: { id: versionId } });
  if (!target) throw AppError.notFound("Version not found");

  await db.fileVersion.delete({ where: { id: target.id } });
  await removeObjects([target.objectKey]).catch((err) =>
    console.error(`[versions] Failed to remove object for version ${target.id}:`, err),
  );
  return { fileId: target.fileId, version: target.version };
}

/** Keep only the newest `FILE_VERSION_LIMIT` versions of a file. */
export async function pruneVersions(fileId: string): Promise<number> {
  const stale = await db.fileVersion.findMany({
    where: { fileId },
    orderBy: { version: "desc" },
    skip: env.FILE_VERSION_LIMIT,
    select: { id: true, objectKey: true },
  });
  if (stale.length === 0) return 0;

  await db.fileVersion.deleteMany({ where: { id: { in: stale.map((v) => v.id) } } });
  await removeObjects(stale.map((v) => v.objectKey)).catch((err) =>
    console.error(`[versions] Failed to prune objects for ${fileId}:`, err),
  );
  return stale.length;
}

/** All storage keys held in a file's history (for hard deletion). */
export async function versionObjectKeys(fileId: string): Promise<string[]> {
  const rows = await db.fileVersion.findMany({
    where: { fileId },
    select: { objectKey: true },
  });
  return rows.map((r) => r.objectKey);
}

/** History of a file, newest first. */
export async function listFileVersions(fileId: string): Promise<FileVersionEntry[]> {
  const rows = await db.fileVersion.findMany({
    where: { fileId },
    orderBy: { version: "desc" },
    include: { uploadedBy: { select: { id: true, name: true } } },
  });
  return rows.map((v) => ({
    id: v.id,
    version: v.version,
    mimeType: v.mimeType,
    size: v.size.toString(),
    uploadedBy: v.uploadedBy,
    uploadedAt: v.uploadedAt.toISOString(),
    supersededAt: v.createdAt.toISOString(),
  }));
}
