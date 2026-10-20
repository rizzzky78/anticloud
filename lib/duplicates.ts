import { db } from "@/lib/db";
import { accessibleFilesSql } from "@/lib/permissions";

/**
 * Duplicate detection by content hash (plan/phase-23). Only files the user
 * can read are ever reported, so duplicates never leak other users' files.
 */

export interface DuplicateFile {
  id: string;
  displayName: string;
  folderPath: string;
  ownerName: string | null;
}

/** Readable live files with the given hash, excluding `excludeId`. */
export async function findDuplicates(
  user: { id: string; role: string },
  sha256: string,
  excludeId?: string,
  limit = 10,
): Promise<DuplicateFile[]> {
  const rows = await db.$queryRaw<
    { id: string; display_name: string; folder_path: string; owner_name: string | null }[]
  >`
    SELECT f.id, f."displayName" AS display_name, f."folderPath" AS folder_path, u.name AS owner_name
    FROM "file" f
    LEFT JOIN "user" u ON u.id = f."ownerId"
    WHERE f.sha256 = ${sha256}
      AND f.id <> ${excludeId ?? ""}
      AND ${accessibleFilesSql(user)}
    ORDER BY f."createdAt" ASC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    id: r.id,
    displayName: r.display_name,
    folderPath: r.folder_path,
    ownerName: r.owner_name,
  }));
}

export interface DuplicateGroup {
  sha256: string;
  /** Serialised BigInt — size of one copy. */
  size: string;
  /** Serialised BigInt — bytes reclaimable by keeping one copy. */
  wasted: string;
  files: { id: string; displayName: string; folderPath: string }[];
}

/** Groups of identical live files owned by `ownerId`, most wasteful first. */
export async function listOwnDuplicateGroups(ownerId: string, limit = 20): Promise<DuplicateGroup[]> {
  const groups = await db.$queryRaw<{ sha256: string; size: bigint; copies: bigint }[]>`
    SELECT f.sha256, MAX(f.size) AS size, COUNT(*) AS copies
    FROM "file" f
    WHERE f."ownerId" = ${ownerId} AND f."deletedAt" IS NULL
      AND f.sha256 IS NOT NULL AND f.sha256 <> ''
    GROUP BY f.sha256
    HAVING COUNT(*) > 1
    ORDER BY MAX(f.size) * (COUNT(*) - 1) DESC
    LIMIT ${limit}
  `;
  if (groups.length === 0) return [];

  const files = await db.file.findMany({
    where: {
      ownerId,
      deletedAt: null,
      sha256: { in: groups.map((g) => g.sha256) },
    },
    select: { id: true, displayName: true, folderPath: true, sha256: true },
    orderBy: { createdAt: "asc" },
  });

  return groups.map((g) => ({
    sha256: g.sha256,
    size: g.size.toString(),
    wasted: (g.size * (g.copies - BigInt(1))).toString(),
    files: files
      .filter((f) => f.sha256 === g.sha256)
      .map((f) => ({ id: f.id, displayName: f.displayName, folderPath: f.folderPath })),
  }));
}
