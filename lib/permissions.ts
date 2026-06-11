import { Role, Visibility, File, FilePermission, User } from "@prisma/client";
import { AppError } from "@/lib/result";
import { redis, redisKey, NS } from "@/lib/redis";
import { db } from "@/lib/db";

export type AccessLevel = Role;

const RolePriority: Record<Role, number> = {
  SUPERADMIN: 4,
  ADMIN: 3,
  VIEWER: 2,
  GUEST: 1,
};

export function hasMinimumLevel(level: AccessLevel, min: AccessLevel) {
  return RolePriority[level] >= RolePriority[min];
}

type FileWithVisibility = Pick<File, "visibility" | "guestAccess" | "isMentionRestricted">;
type UserWithRole = Pick<User, "id" | "role">;
type FilePermissionGrants = Pick<FilePermission, "role" | "userId">[];
type MentionedUsers = string[]; 

/**
 * Pure function resolving access exactly according to canonical order.
 */
export function resolveAccess(
  user: UserWithRole | null,
  file: FileWithVisibility,
  explicitGrantLevel: Role | null,
  isMentioned: boolean
): AccessLevel | null {
  // 1. superadmin bypass
  if (user?.role === "SUPERADMIN") return "SUPERADMIN";

  // 2. File-level explicit grant
  if (user && explicitGrantLevel) {
     // Downward clamp: a system guest cannot exceed viewer at file level.
     const clamped = RolePriority[explicitGrantLevel] > RolePriority[user.role] 
        ? user.role 
        : explicitGrantLevel;
     return clamped;
  }

  // 3. Mention-restriction gate
  if (file.isMentionRestricted) {
     if (!user || !isMentioned) return null;
  }

  let baseLevel: AccessLevel | null = null;
  
  // 4. File visibility
  if (file.visibility === "PUBLIC") {
     if (user) {
        baseLevel = "VIEWER";
     } else if (file.guestAccess) {
        baseLevel = "GUEST";
     }
  }

  // 5. Otherwise
  return baseLevel;
}

const PERM_TTL_SECONDS = 60 * 5; // 5 minutes cache TTL

/**
 * Resolves and caches the access level for a user-file pair.
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

  // Resolve from DB
  const file = await db.file.findUnique({
    where: { id: fileId },
    select: { visibility: true, guestAccess: true, isMentionRestricted: true }
  });

  if (!file) throw AppError.notFound("File not found");

  let explicitGrantLevel: Role | null = null;
  let isMentioned = false;

  if (user) {
    const perm = await db.filePermission.findUnique({
      where: { fileId_userId: { fileId, userId: user.id } },
      select: { role: true }
    });
    explicitGrantLevel = perm?.role || null;

    if (file.isMentionRestricted) {
      const mention = await db.fileMention.findUnique({
        where: { fileId_mentionedUserId: { fileId, mentionedUserId: user.id } }
      });
      isMentioned = !!mention;
    }
  }

  const level = resolveAccess(user as UserWithRole, file, explicitGrantLevel, isMentioned);
  
  if (level) {
    await redis.set(cacheKey, level, "EX", PERM_TTL_SECONDS);
  } else {
    await redis.set(cacheKey, "NONE", "EX", PERM_TTL_SECONDS);
  }

  return level;
}

/**
 * Validates permission against a minimum level and throws 403 AppError if insufficient.
 */
export async function requireAccess(
  user: UserWithRole | null,
  fileId: string,
  min: AccessLevel
): Promise<AccessLevel> {
  const level = await getCachedAccess(user, fileId);
  if (!level || !hasMinimumLevel(level, min)) {
    throw AppError.forbidden();
  }
  return level;
}

/**
 * Invalidates the permission cache for a given user or file.
 * Passing null for a parameter treats it as a wildcard.
 */
export async function invalidatePermCache(userId: string | null, fileId: string | null) {
  const pattern = redisKey(NS.perm, userId || "*", fileId || "*");
  
  const stream = redis.scanStream({
    match: pattern,
    count: 100,
  });

  return new Promise<void>((resolve, reject) => {
    stream.on("data", async (keys: string[]) => {
      if (keys.length) {
        // Pause stream to await pipeline
        stream.pause();
        const pipeline = redis.pipeline();
        keys.forEach(key => pipeline.del(key));
        await pipeline.exec();
        stream.resume();
      }
    });
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });
}

/**
 * Get all files a user is permitted to see.
 * This is primarily used to scope search and bulk downloads.
 */
export async function getPermittedFiles(userId: string): Promise<{ id: string }[]> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!user) return [];

  if (user.role === "SUPERADMIN") {
    return db.file.findMany({ select: { id: true } });
  } else if (user.role === "ADMIN") {
    return db.file.findMany({
      where: {
        OR: [
          { ownerId: user.id },
          { visibility: "PUBLIC" },
          { permissions: { some: { userId: user.id } } },
          { ownerId: null, visibility: "PRIVATE" }
        ]
      },
      select: { id: true }
    });
  } else {
    return db.file.findMany({
      where: {
        OR: [
          { ownerId: user.id },
          { visibility: "PUBLIC" },
          { permissions: { some: { userId: user.id } } }
        ]
      },
      select: { id: true }
    });
  }
}
