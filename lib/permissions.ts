import { Prisma, Role, File, User } from "@prisma/client";
import { AppError } from "@/lib/result";
import { redis, redisKey, NS } from "@/lib/redis";
import { db } from "@/lib/db";

export type AccessLevel = Role;

const RolePriority: Record<Role, number> = {
  SUPERADMIN: 5,
  ADMIN: 4,
  EDITOR: 3,
  VIEWER: 2,
  GUEST: 1,
};

export function hasMinimumLevel(level: AccessLevel, min: AccessLevel) {
  return RolePriority[level] >= RolePriority[min];
}

function maxLevel(a: AccessLevel | null, b: AccessLevel | null): AccessLevel | null {
  if (!a) return b;
  if (!b) return a;
  return RolePriority[a] >= RolePriority[b] ? a : b;
}

type FileForAccess = Pick<
  File,
  "ownerId" | "visibility" | "guestAccess" | "isMentionRestricted"
>;
type UserWithRole = Pick<User, "id" | "role">;

/**
 * Pure access resolver — the single source of truth for file access rules.
 * Every read path (detail page, download, list, search, bulk ZIP, share token)
 * must agree with this function; the SQL/Prisma predicates below mirror it.
 *
 * Order:
 *   1. SUPERADMIN bypass.
 *   2. Owner → ADMIN.
 *   3. Unowned file + global ADMIN → ADMIN (orphan management).
 *   4. Explicit per-file grant (VIEWER / EDITOR / ADMIN). Grants let a file
 *      owner share beyond the recipient's system role, except that system
 *      GUESTs stay read-only and no grant confers SUPERADMIN.
 *   5. Mention-restriction gate (applies only to visibility-derived access).
 *   6. PUBLIC visibility: global ADMIN → ADMIN (moderation), user → VIEWER,
 *      anonymous → GUEST when guest access is enabled.
 * The highest level from steps 4 and 6 wins.
 */
export function resolveAccess(
  user: UserWithRole | null,
  file: FileForAccess,
  explicitGrantLevel: Role | null,
  isMentioned: boolean,
): AccessLevel | null {
  if (user?.role === "SUPERADMIN") return "SUPERADMIN";
  if (user && file.ownerId === user.id) return "ADMIN";
  if (user && file.ownerId === null && user.role === "ADMIN") return "ADMIN";

  let grantLevel: AccessLevel | null = null;
  if (user && explicitGrantLevel) {
    grantLevel = explicitGrantLevel === "SUPERADMIN" ? "ADMIN" : explicitGrantLevel;
    if (user.role === "GUEST" && RolePriority[grantLevel] > RolePriority.VIEWER) {
      grantLevel = "VIEWER";
    }
  }

  let visibilityLevel: AccessLevel | null = null;
  const passesMentionGate = !file.isMentionRestricted || (!!user && isMentioned);
  if (file.visibility === "PUBLIC" && passesMentionGate) {
    if (user) {
      visibilityLevel = user.role === "ADMIN" ? "ADMIN" : "VIEWER";
    } else if (file.guestAccess) {
      visibilityLevel = "GUEST";
    }
  }

  return maxLevel(grantLevel, visibilityLevel);
}

const PERM_TTL_SECONDS = 60 * 5; // 5 minutes cache TTL

/**
 * Resolves and caches the access level for a user-file pair. Does not check
 * soft-delete/expiry — callers load the file with the lifecycle filter they
 * need (e.g. recovery flows legitimately operate on soft-deleted rows).
 */
export async function getCachedAccess(
  user: UserWithRole | null,
  fileId: string,
): Promise<AccessLevel | null> {
  const cacheKey = redisKey(NS.perm, user ? user.id : "guest", fileId);
  const cached = await redis.get(cacheKey);
  if (cached) {
    if (cached === "NONE") return null;
    return cached as AccessLevel;
  }

  const file = await db.file.findUnique({
    where: { id: fileId },
    select: { ownerId: true, visibility: true, guestAccess: true, isMentionRestricted: true },
  });
  if (!file) throw AppError.notFound("File not found");

  let explicitGrantLevel: Role | null = null;
  let isMentioned = false;
  let ttl = PERM_TTL_SECONDS;

  if (user && user.role !== "SUPERADMIN" && file.ownerId !== user.id) {
    const perm = await db.filePermission.findUnique({
      where: { fileId_userId: { fileId, userId: user.id } },
      select: { role: true, expiresAt: true },
    });
    if (perm && (!perm.expiresAt || perm.expiresAt.getTime() > Date.now())) {
      explicitGrantLevel = perm.role;
      // Never cache a time-limited grant past its expiry.
      if (perm.expiresAt) {
        const remaining = Math.ceil((perm.expiresAt.getTime() - Date.now()) / 1000);
        ttl = Math.max(1, Math.min(ttl, remaining));
      }
    }

    if (file.isMentionRestricted) {
      const mention = await db.fileMention.findUnique({
        where: { fileId_mentionedUserId: { fileId, mentionedUserId: user.id } },
        select: { id: true },
      });
      isMentioned = !!mention;
    }
  }

  const level = resolveAccess(user, file, explicitGrantLevel, isMentioned);
  await redis.set(cacheKey, level ?? "NONE", "EX", ttl);
  return level;
}

/**
 * Validates permission against a minimum level and throws 403 AppError if insufficient.
 */
export async function requireAccess(
  user: UserWithRole | null,
  fileId: string,
  min: AccessLevel,
): Promise<AccessLevel> {
  const level = await getCachedAccess(user, fileId);
  if (!level || !hasMinimumLevel(level, min)) {
    throw AppError.forbidden();
  }
  return level;
}

/**
 * Whether a user may contribute collaborative content (notes, tags) to a file.
 * Plain visibility-derived VIEWER access is NOT enough: only EDITOR+ (editors,
 * managers, owners) and mentioned users may contribute.
 */
export async function requireContributor(
  user: UserWithRole,
  fileId: string,
): Promise<AccessLevel> {
  const level = await getCachedAccess(user, fileId);
  if (!level) throw AppError.forbidden();
  if (hasMinimumLevel(level, "EDITOR")) return level;

  const mention = await db.fileMention.findUnique({
    where: { fileId_mentionedUserId: { fileId, mentionedUserId: user.id } },
    select: { id: true },
  });
  if (!mention) {
    throw AppError.forbidden("Only collaborators can contribute to this file");
  }
  return level;
}

/**
 * Invalidates the permission cache for a given user or file.
 * Passing null for a parameter treats it as a wildcard.
 */
export async function invalidatePermCache(userId: string | null, fileId: string | null) {
  const pattern = redisKey(NS.perm, userId || "*", fileId || "*");
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 200);
    cursor = next;
    if (keys.length > 0) await redis.unlink(...keys);
  } while (cursor !== "0");
}

type ListUser = { id: string; role: string } | null;

/**
 * Raw-SQL predicate (table alias `f`) selecting the live files a user can read.
 * Mirrors `resolveAccess` exactly, plus the soft-delete and expiry filters.
 */
export function accessibleFilesSql(user: ListUser): Prisma.Sql {
  const live = Prisma.sql`f."deletedAt" IS NULL AND (f."expiresAt" IS NULL OR f."expiresAt" > NOW())`;

  if (!user) {
    return Prisma.sql`${live} AND f.visibility = 'PUBLIC' AND f."guestAccess" = true AND f."isMentionRestricted" = false`;
  }
  if (user.role === "SUPERADMIN") return live;

  const unowned = user.role === "ADMIN" ? Prisma.sql`OR f."ownerId" IS NULL` : Prisma.empty;

  return Prisma.sql`${live} AND (
    f."ownerId" = ${user.id}
    ${unowned}
    OR EXISTS (
      SELECT 1 FROM file_permission fp
      WHERE fp."fileId" = f.id AND fp."userId" = ${user.id}
        AND (fp."expiresAt" IS NULL OR fp."expiresAt" > NOW())
    )
    OR (
      f.visibility = 'PUBLIC'
      AND (
        f."isMentionRestricted" = false
        OR EXISTS (SELECT 1 FROM file_mention fm WHERE fm."fileId" = f.id AND fm."mentionedUserId" = ${user.id})
      )
    )
  )`;
}

/** Prisma `where` equivalent of `accessibleFilesSql`. */
export function accessibleFilesWhere(user: ListUser): Prisma.FileWhereInput {
  const live: Prisma.FileWhereInput = {
    deletedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  };

  if (!user) {
    return {
      AND: [
        live,
        { visibility: "PUBLIC", guestAccess: true, isMentionRestricted: false },
      ],
    };
  }
  if (user.role === "SUPERADMIN") return live;

  const scope: Prisma.FileWhereInput[] = [
    { ownerId: user.id },
    {
      permissions: {
        some: {
          userId: user.id,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      },
    },
    {
      visibility: "PUBLIC",
      OR: [
        { isMentionRestricted: false },
        { mentions: { some: { mentionedUserId: user.id } } },
      ],
    },
  ];
  if (user.role === "ADMIN") scope.push({ ownerId: null });

  return { AND: [live, { OR: scope }] };
}
