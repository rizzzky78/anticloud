import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/result";

/**
 * Folder access (plan/phase-16).
 *
 * Files live at `File.folderPath`. A `Folder` row for a path (or any ancestor)
 * adds an owner and folder shares that cascade to everything below it:
 *   - the owner of a containing folder manages every file inside (ADMIN);
 *   - a folder share (user or group) grants its level to the whole subtree.
 * Paths with no Folder row anywhere in their chain stay an open namespace, so
 * existing deployments keep working unchanged.
 */

const RANK: Record<Role, number> = { GUEST: 1, VIEWER: 2, EDITOR: 3, ADMIN: 4, SUPERADMIN: 5 };

function higher(a: Role | null, b: Role | null): Role | null {
  if (!a) return b;
  if (!b) return a;
  return RANK[a] >= RANK[b] ? a : b;
}

export function rankOf(role: Role): number {
  return RANK[role];
}

/** `/a/b/c` → [`/a`, `/a/b`, `/a/b/c`]. Root has no ancestors. */
export function ancestorPaths(path: string): string[] {
  const segments = path.split("/").filter(Boolean);
  const out: string[] = [];
  let running = "";
  for (const seg of segments) {
    running += "/" + seg;
    out.push(running);
  }
  return out;
}

export function folderName(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? "/";
}

export function parentPath(path: string): string {
  const segments = path.split("/").filter(Boolean);
  segments.pop();
  return "/" + segments.join("/");
}

export interface FolderGrant {
  /** Highest level granted through folder ownership or folder shares. */
  level: Role | null;
  /** Earliest expiry among the grants that apply (for cache TTL capping). */
  earliestExpiry: Date | null;
  /** True when at least one Folder row exists along the path. */
  governed: boolean;
}

/** Level a user holds on `folderPath` through folder ownership and shares. */
export async function folderGrantForPath(
  user: { id: string; role: Role },
  folderPath: string,
): Promise<FolderGrant> {
  const chain = ancestorPaths(folderPath);
  if (chain.length === 0) return { level: null, earliestExpiry: null, governed: false };

  const now = new Date();
  const folders = await db.folder.findMany({
    where: { path: { in: chain } },
    select: {
      ownerId: true,
      permissions: {
        where: {
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          AND: [
            {
              OR: [
                { userId: user.id },
                { group: { members: { some: { userId: user.id } } } },
              ],
            },
          ],
        },
        select: { role: true, expiresAt: true },
      },
    },
  });

  let level: Role | null = null;
  let earliestExpiry: Date | null = null;
  for (const folder of folders) {
    if (folder.ownerId === user.id) level = higher(level, "ADMIN");
    for (const grant of folder.permissions) {
      level = higher(level, grant.role === "SUPERADMIN" ? "ADMIN" : grant.role);
      if (grant.expiresAt && (!earliestExpiry || grant.expiresAt < earliestExpiry)) {
        earliestExpiry = grant.expiresAt;
      }
    }
  }
  // System guests stay read-only whatever the folder share says.
  if (user.role === "GUEST" && level && RANK[level] > RANK.VIEWER) level = "VIEWER";

  return { level, earliestExpiry, governed: folders.length > 0 };
}

export interface FolderAccess {
  path: string;
  /** A Folder row exists for exactly this path. */
  exists: boolean;
  ownerId: string | null;
  ownerName: string | null;
  level: Role | null;
  /** May upload files / create subfolders here. */
  canUpload: boolean;
  /** May rename, move, delete and share this folder. */
  canManage: boolean;
}

/** Resolve what a user may do with a folder path. */
export async function getFolderAccess(
  user: { id: string; role: Role },
  path: string,
): Promise<FolderAccess> {
  const folder =
    path === "/"
      ? null
      : await db.folder.findUnique({
          where: { path },
          select: { ownerId: true, owner: { select: { name: true } } },
        });

  const base = {
    path,
    exists: !!folder,
    ownerId: folder?.ownerId ?? null,
    ownerName: folder?.owner?.name ?? null,
  };

  if (user.role === "SUPERADMIN") {
    return { ...base, level: "SUPERADMIN", canUpload: true, canManage: path !== "/" };
  }

  const grant = await folderGrantForPath(user, path);
  const canUpload = !grant.governed || (!!grant.level && RANK[grant.level] >= RANK.EDITOR);

  let canManage = false;
  if (path !== "/") {
    if (grant.level && RANK[grant.level] >= RANK.ADMIN) {
      canManage = true;
    } else if (!grant.governed) {
      // Legacy folder (no Folder rows): manageable only by someone who owns
      // every live file inside it.
      canManage = await ownsWholeSubtree(user.id, path);
    }
  }

  return { ...base, level: grant.level, canUpload, canManage };
}

/** True when the subtree has files and every live one is owned by `userId`. */
async function ownsWholeSubtree(userId: string, path: string): Promise<boolean> {
  const rows = await db.$queryRaw<{ total: bigint; mine: bigint }[]>`
    SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE f."ownerId" = ${userId}) AS mine
    FROM "file" f
    WHERE f."deletedAt" IS NULL
      AND (f."folderPath" = ${path} OR starts_with(f."folderPath", ${path + "/"}))
  `;
  const { total, mine } = rows[0] ?? { total: BigInt(0), mine: BigInt(0) };
  return total > BigInt(0) && total === mine;
}

/** Throw unless the user may place files into `path`. */
export async function assertCanUpload(user: { id: string; role: Role }, path: string) {
  const access = await getFolderAccess(user, path);
  if (!access.canUpload) {
    throw AppError.forbidden("You do not have permission to add files to this folder");
  }
  return access;
}
