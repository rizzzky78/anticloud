import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError } from "@/lib/result";

/**
 * Storage accounting and quotas (plan/phase-20).
 *
 * Usage = bytes of every file a user owns (live AND in the recycle bin, since
 * both occupy storage) plus the version history of those files. Quotas are
 * per user; a null quota falls back to `DEFAULT_STORAGE_QUOTA_MB`; 0 means
 * unlimited. Superadmins are never limited.
 */

export interface StorageUsage {
  /** Live files (bytes). */
  live: bigint;
  /** Recycle bin (bytes). */
  trash: bigint;
  /** Version history (bytes). */
  versions: bigint;
  total: bigint;
}

export interface QuotaStatus extends StorageUsage {
  /** Effective quota in bytes, or null when unlimited. */
  quota: bigint | null;
}

const MIB = BigInt(1024 * 1024);

export async function getStorageUsage(userId: string): Promise<StorageUsage> {
  const rows = await db.$queryRaw<{ live: bigint | null; trash: bigint | null; versions: bigint | null }[]>`
    SELECT
      (SELECT COALESCE(SUM(f.size), 0) FROM "file" f WHERE f."ownerId" = ${userId} AND f."deletedAt" IS NULL) AS live,
      (SELECT COALESCE(SUM(f.size), 0) FROM "file" f WHERE f."ownerId" = ${userId} AND f."deletedAt" IS NOT NULL) AS trash,
      (SELECT COALESCE(SUM(v.size), 0) FROM file_version v JOIN "file" f ON f.id = v."fileId" WHERE f."ownerId" = ${userId}) AS versions
  `;
  const live = BigInt(rows[0]?.live ?? 0);
  const trash = BigInt(rows[0]?.trash ?? 0);
  const versions = BigInt(rows[0]?.versions ?? 0);
  return { live, trash, versions, total: live + trash + versions };
}

/** Effective quota for a user (null = unlimited). */
export function effectiveQuota(user: { role: string; storageQuota: bigint | null }): bigint | null {
  if (user.role === "SUPERADMIN") return null;
  if (user.storageQuota !== null) return user.storageQuota === BigInt(0) ? null : user.storageQuota;
  return env.DEFAULT_STORAGE_QUOTA_MB > 0 ? BigInt(env.DEFAULT_STORAGE_QUOTA_MB) * MIB : null;
}

export async function getQuotaStatus(userId: string): Promise<QuotaStatus> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, storageQuota: true },
  });
  if (!user) throw AppError.notFound("User not found");
  const usage = await getStorageUsage(userId);
  return { ...usage, quota: effectiveQuota(user) };
}

function formatMiB(bytes: bigint): string {
  return `${(Number(bytes) / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Throw when adding `additionalBytes` to `ownerId`'s storage would exceed
 * their quota. Unowned files and unlimited users always pass.
 */
export async function assertWithinQuota(ownerId: string | null, additionalBytes: bigint) {
  if (!ownerId) return;
  const status = await getQuotaStatus(ownerId);
  if (status.quota === null) return;
  if (status.total + additionalBytes > status.quota) {
    const free = status.quota > status.total ? status.quota - status.total : BigInt(0);
    throw AppError.badRequest(
      `Storage quota exceeded: ${formatMiB(free)} free of ${formatMiB(status.quota)}. ` +
        "Delete files or empty your recycle bin to free space.",
    );
  }
}

export interface CategoryUsage {
  category: string;
  files: number;
  bytes: bigint;
}

/** Live storage by broad file category, for one owner or the whole system. */
export async function usageByCategory(ownerId: string | null): Promise<CategoryUsage[]> {
  const rows = await db.$queryRaw<{ category: string; files: bigint; bytes: bigint | null }[]>`
    SELECT
      CASE
        WHEN f."mimeType" LIKE 'image/%' THEN 'Images'
        WHEN f."mimeType" LIKE 'video/%' THEN 'Videos'
        WHEN f."mimeType" LIKE 'audio/%' THEN 'Audio'
        WHEN f."mimeType" = 'application/pdf'
          OR f."mimeType" LIKE 'text/%'
          OR f."mimeType" LIKE 'application/vnd.openxmlformats-officedocument%'
          OR f."mimeType" LIKE 'application/vnd.oasis.opendocument%'
          OR f."mimeType" IN ('application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint', 'application/rtf')
          THEN 'Documents'
        WHEN f."mimeType" IN ('application/zip', 'application/gzip', 'application/x-gzip', 'application/x-7z-compressed',
                              'application/x-rar-compressed', 'application/vnd.rar', 'application/x-tar', 'application/x-bzip2', 'application/x-xz')
          THEN 'Archives'
        ELSE 'Other'
      END AS category,
      COUNT(*) AS files,
      COALESCE(SUM(f.size), 0) AS bytes
    FROM "file" f
    WHERE f."deletedAt" IS NULL
      AND (${ownerId}::text IS NULL OR f."ownerId" = ${ownerId})
    GROUP BY 1
    ORDER BY bytes DESC
  `;
  return rows.map((r) => ({ category: r.category, files: Number(r.files), bytes: BigInt(r.bytes ?? 0) }));
}

/** Usage (live + trash + versions) per owner, for the admin console. */
export async function usageByOwner(): Promise<Map<string, bigint>> {
  const rows = await db.$queryRaw<{ owner_id: string; bytes: bigint | null }[]>`
    SELECT owner_id, SUM(bytes) AS bytes FROM (
      SELECT f."ownerId" AS owner_id, f.size AS bytes FROM "file" f WHERE f."ownerId" IS NOT NULL
      UNION ALL
      SELECT f."ownerId", v.size FROM file_version v JOIN "file" f ON f.id = v."fileId" WHERE f."ownerId" IS NOT NULL
    ) t
    GROUP BY owner_id
  `;
  return new Map(rows.map((r) => [r.owner_id, BigInt(r.bytes ?? 0)]));
}
