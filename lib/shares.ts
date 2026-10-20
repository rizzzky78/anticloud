import { db } from "@/lib/db";

/** A file someone shared with the current user. */
export interface SharedWithMeEntry {
  fileId: string;
  displayName: string;
  mimeType: string;
  /** Serialised BigInt. */
  size: string;
  role: string;
  expiresAt: string | null;
  sharedAt: string;
  sharedBy: string | null;
  owner: string | null;
  /** Group name when the access comes from a group share. */
  viaGroup: string | null;
}

/** A file the current user owns that is shared with people or by link. */
export interface SharedByMeEntry {
  fileId: string;
  displayName: string;
  mimeType: string;
  size: string;
  people: number;
  groups: number;
  activeLinks: number;
  updatedAt: string;
}

const liveFile = (now: Date) => ({
  deletedAt: null,
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
});

const activeGrant = (now: Date) => ({
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
});

const RANK: Record<string, number> = { GUEST: 1, VIEWER: 2, EDITOR: 3, ADMIN: 4, SUPERADMIN: 5 };

/**
 * Live, unexpired grants to `userId` — direct or through a group — newest
 * first. A file reachable several ways is listed once at its highest level.
 */
export async function listSharedWithMe(userId: string): Promise<SharedWithMeEntry[]> {
  const now = new Date();
  const fileSelect = {
    select: {
      id: true,
      displayName: true,
      mimeType: true,
      size: true,
      ownerId: true,
      owner: { select: { name: true } },
    },
  } as const;

  const groupGrants = await db.fileGroupPermission.findMany({
    where: {
      ...activeGrant(now),
      group: { members: { some: { userId } } },
      file: { ...liveFile(now), NOT: { ownerId: userId } },
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
    include: {
      grantedBy: { select: { name: true } },
      group: { select: { name: true } },
      file: fileSelect,
    },
  });

  const grants = await db.filePermission.findMany({
    where: { userId, ...activeGrant(now), file: liveFile(now) },
    orderBy: { updatedAt: "desc" },
    take: 500,
    include: {
      grantedBy: { select: { name: true } },
      file: {
        select: {
          id: true,
          displayName: true,
          mimeType: true,
          size: true,
          owner: { select: { name: true } },
        },
      },
    },
  });

  const byFile = new Map<string, SharedWithMeEntry>();
  const consider = (entry: SharedWithMeEntry) => {
    const current = byFile.get(entry.fileId);
    if (!current || RANK[entry.role] > RANK[current.role]) byFile.set(entry.fileId, entry);
  };

  for (const g of grants) {
    consider({
      fileId: g.file.id,
      displayName: g.file.displayName,
      mimeType: g.file.mimeType,
      size: g.file.size.toString(),
      role: g.role,
      expiresAt: g.expiresAt?.toISOString() ?? null,
      sharedAt: g.updatedAt.toISOString(),
      sharedBy: g.grantedBy?.name ?? null,
      owner: g.file.owner?.name ?? null,
      viaGroup: null,
    });
  }
  for (const g of groupGrants) {
    consider({
      fileId: g.file.id,
      displayName: g.file.displayName,
      mimeType: g.file.mimeType,
      size: g.file.size.toString(),
      role: g.role,
      expiresAt: g.expiresAt?.toISOString() ?? null,
      sharedAt: g.updatedAt.toISOString(),
      sharedBy: g.grantedBy?.name ?? null,
      owner: g.file.owner?.name ?? null,
      viaGroup: g.group.name,
    });
  }

  return Array.from(byFile.values()).sort((a, b) => b.sharedAt.localeCompare(a.sharedAt));
}

/** Files owned by `userId` that have active grants or active share links. */
export async function listSharedByMe(userId: string): Promise<SharedByMeEntry[]> {
  const now = new Date();
  const activeLink = {
    revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };

  const files = await db.file.findMany({
    where: {
      ownerId: userId,
      ...liveFile(now),
      AND: [
        {
          OR: [
            { permissions: { some: activeGrant(now) } },
            { groupPermissions: { some: activeGrant(now) } },
            { shareLinks: { some: activeLink } },
          ],
        },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
    select: {
      id: true,
      displayName: true,
      mimeType: true,
      size: true,
      updatedAt: true,
      _count: {
        select: {
          permissions: { where: activeGrant(now) },
          groupPermissions: { where: activeGrant(now) },
          shareLinks: { where: activeLink },
        },
      },
    },
  });

  return files.map((f) => ({
    fileId: f.id,
    displayName: f.displayName,
    mimeType: f.mimeType,
    size: f.size.toString(),
    people: f._count.permissions,
    groups: f._count.groupPermissions,
    activeLinks: f._count.shareLinks,
    updatedAt: f.updatedAt.toISOString(),
  }));
}
