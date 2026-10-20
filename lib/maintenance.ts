import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { listObjects, removeObjects, KeyPrefix } from "@/lib/storage";
import { bustFileMeta } from "@/lib/file-meta";
import { invalidatePermCache } from "@/lib/permissions";
import { invalidateUserSearchCache } from "@/lib/search";
import { versionObjectKeys } from "@/lib/versions";

/** Soft-deleted files stay restorable from the recycle bin for this long. */
export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
/** Bulk-download archives are removed from storage after this long. */
const ARCHIVE_RETENTION_MS = 24 * 60 * 60 * 1000;
const PURGE_BATCH = 200;
const LOCK_KEY = "maintenance:lock";
const LOCK_TTL_SECONDS = 15 * 60;

/**
 * Permanently delete one file: the live binary and every historical version
 * object, then the row. Child rows (tags, notes, mentions, grants, versions…)
 * cascade in Postgres.
 */
export async function hardDeleteFile(fileId: string): Promise<void> {
  const file = await db.file.findUnique({
    where: { id: fileId },
    select: { id: true, objectKey: true },
  });
  if (!file) return;

  const historyKeys = await versionObjectKeys(fileId);
  await removeObjects([file.objectKey, ...historyKeys]);
  await db.file.delete({ where: { id: fileId } });
  await bustFileMeta(fileId);
  await invalidatePermCache(null, fileId);
}

/** Expired files (TTL reached) move to the recycle bin. */
export async function expireFiles(now = new Date()): Promise<number> {
  const { count } = await db.file.updateMany({
    where: { expiresAt: { lte: now }, deletedAt: null },
    data: { deletedAt: now },
  });
  return count;
}

/** Drop time-limited grants past their expiry, and long-dead share links. */
export async function cleanupShares(now = new Date()): Promise<number> {
  const grants = await db.filePermission.deleteMany({ where: { expiresAt: { lte: now } } });
  const cutoff = new Date(now.getTime() - TRASH_RETENTION_MS);
  const links = await db.shareLink.deleteMany({
    where: {
      OR: [{ revokedAt: { lt: cutoff } }, { expiresAt: { lt: cutoff } }],
    },
  });
  return grants.count + links.count;
}

/** Hard-delete recycle-bin entries older than the retention window. */
export async function purgeTrash(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - TRASH_RETENTION_MS);
  let purged = 0;

  for (;;) {
    const batch = await db.file.findMany({
      where: { deletedAt: { lt: cutoff } },
      select: { id: true },
      take: PURGE_BATCH,
    });
    if (batch.length === 0) break;

    for (const { id } of batch) {
      try {
        await hardDeleteFile(id);
        purged++;
      } catch (err) {
        console.error(`[maintenance] Failed to purge file ${id}:`, err);
      }
    }
    if (batch.length < PURGE_BATCH) break;
  }
  return purged;
}

/** Remove bulk-download ZIPs older than the retention window. */
export async function cleanupArchives(now = new Date()): Promise<number> {
  const cutoff = now.getTime() - ARCHIVE_RETENTION_MS;
  const stale: string[] = [];
  for await (const obj of listObjects(`${KeyPrefix.archive}/`)) {
    if (obj.lastModified.getTime() < cutoff) stale.push(obj.name);
  }
  for (let i = 0; i < stale.length; i += 500) {
    await removeObjects(stale.slice(i, i + 500));
  }
  return stale.length;
}

export interface MaintenanceReport {
  ran: boolean;
  expired: number;
  purged: number;
  archivesRemoved: number;
  sharesRemoved: number;
}

/**
 * Run every maintenance task once. Guarded by a Redis lock so concurrent
 * callers (several workers, or the cron route) never overlap.
 */
export async function runMaintenance(): Promise<MaintenanceReport> {
  const token = randomUUID();
  const acquired = await redis.set(LOCK_KEY, token, "EX", LOCK_TTL_SECONDS, "NX");
  if (!acquired) {
    return { ran: false, expired: 0, purged: 0, archivesRemoved: 0, sharesRemoved: 0 };
  }

  try {
    const now = new Date();
    const expired = await expireFiles(now);
    const purged = await purgeTrash(now);
    const archivesRemoved = await cleanupArchives(now).catch((err) => {
      console.error("[maintenance] Archive cleanup failed:", err);
      return 0;
    });
    const sharesRemoved = await cleanupShares(now);
    if (expired > 0 || purged > 0 || sharesRemoved > 0) await invalidateUserSearchCache();
    return { ran: true, expired, purged, archivesRemoved, sharesRemoved };
  } finally {
    // Release only our own lock.
    if ((await redis.get(LOCK_KEY)) === token) await redis.del(LOCK_KEY);
  }
}
