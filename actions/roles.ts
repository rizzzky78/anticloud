"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-context";
import { AppError } from "@/lib/result";
import { z } from "zod";
import { invalidatePermCache, requireAccess } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";

const setSystemRoleSchema = z.object({
  userId: z.string(),
  // EDITOR is a file-level share tier only, never a system role.
  newRole: z.enum(["SUPERADMIN", "ADMIN", "VIEWER", "GUEST"]),
});

export async function setSystemRole(payload: unknown) {
  const session = await getCurrentUser();
  if (!session || !["SUPERADMIN", "ADMIN"].includes(session.user.role as string)) {
    throw AppError.forbidden();
  }
  
  const { userId, newRole } = setSystemRoleSchema.parse(payload);
  
  if (newRole === "SUPERADMIN" && session.user.role !== "SUPERADMIN") {
    throw AppError.forbidden("Only superadmin can grant superadmin role");
  }

  const targetUser = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (targetUser?.role === "SUPERADMIN" && session.user.role !== "SUPERADMIN") {
    throw AppError.forbidden("Only superadmin can modify a superadmin");
  }

  await db.user.update({
    where: { id: userId },
    data: { role: newRole }
  });

  await invalidatePermCache(userId, null);
  
  await recordAudit({
    action: "role.set_system",
    targetType: "user",
    targetId: userId,
    metadata: { oldRole: targetUser?.role, newRole },
  });
  return { success: true };
}

/** Share tiers a manager can hand out: viewer, editor, manager (ADMIN). */
const shareRoleSchema = z.enum(["VIEWER", "EDITOR", "ADMIN"]);

const grantFileRoleSchema = z.object({
  fileId: z.string(),
  targetUserId: z.string(),
  role: shareRoleSchema,
  // Optional time-limited share; must be in the future.
  expiresAt: z.iso
    .datetime()
    .nullable()
    .optional()
    .refine((v) => v == null || new Date(v).getTime() > Date.now(), {
      message: "Expiry must be in the future",
    }),
});

const SHARE_LABEL: Record<z.infer<typeof shareRoleSchema>, string> = {
  VIEWER: "Viewer",
  EDITOR: "Editor",
  ADMIN: "Manager",
};

export async function grantFileRole(payload: z.input<typeof grantFileRoleSchema>) {
  const session = await getCurrentUser();
  if (!session) throw AppError.forbidden();

  const { fileId, targetUserId, role, expiresAt } = grantFileRoleSchema.parse(payload);
  
  // Requires ADMIN access on the file to grant roles
  await requireAccess(session.user as any, fileId, "ADMIN");

  const [target, file, existing] = await Promise.all([
    db.user.findUnique({ where: { id: targetUserId }, select: { id: true } }),
    db.file.findUnique({ where: { id: fileId }, select: { ownerId: true, displayName: true } }),
    db.filePermission.findUnique({
      where: { fileId_userId: { fileId, userId: targetUserId } },
      select: { role: true },
    }),
  ]);
  if (!target) throw AppError.notFound("User not found");
  if (!file) throw AppError.notFound("File not found");
  if (file.ownerId === targetUserId) {
    throw AppError.badRequest("The owner already has full access");
  }
  if (targetUserId === session.user.id) {
    throw AppError.badRequest("You cannot change your own access");
  }

  const expiry = expiresAt ? new Date(expiresAt) : null;
  await db.filePermission.upsert({
    where: { fileId_userId: { fileId, userId: targetUserId } },
    update: { role, expiresAt: expiry, grantedById: session.user.id },
    create: { fileId, userId: targetUserId, role, expiresAt: expiry, grantedById: session.user.id },
  });

  await invalidatePermCache(targetUserId, fileId);
  const { invalidateUserSearchCache } = await import("@/lib/search");
  await invalidateUserSearchCache();

  // Tell the recipient — on a new share, or when their level changes.
  if (!existing || existing.role !== role) {
    await notify([targetUserId], {
      type: "SHARE",
      fileId,
      message: `${session.user.name} shared "${file.displayName}" with you as ${SHARE_LABEL[role]}${
        expiry ? ` until ${expiry.toISOString().slice(0, 10)}` : ""
      }.`,
    });
  }

  await recordAudit({
    action: "role.grant_file",
    targetType: "file",
    targetId: fileId,
    metadata: { targetUserId, role, expiresAt: expiry?.toISOString() ?? null },
  });
  return { success: true };
}

const revokeFileRoleSchema = z.object({
  fileId: z.string(),
  targetUserId: z.string(),
});

export async function revokeFileRole(payload: z.infer<typeof revokeFileRoleSchema>) {
  const session = await getCurrentUser();
  if (!session) throw AppError.forbidden();

  const { fileId, targetUserId } = revokeFileRoleSchema.parse(payload);

  await requireAccess(session.user as any, fileId, "ADMIN");

  await db.filePermission.deleteMany({
    where: { fileId, userId: targetUserId },
  });

  await invalidatePermCache(targetUserId, fileId);
  const { invalidateUserSearchCache } = await import("@/lib/search");
  await invalidateUserSearchCache();

  await recordAudit({
    action: "role.revoke_file",
    targetType: "file",
    targetId: fileId,
    metadata: { targetUserId },
  });
  return { success: true };
}

const getFilePermissionsSchema = z.object({
  fileId: z.string(),
});

export async function getFilePermissions(payload: z.infer<typeof getFilePermissionsSchema>) {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const { fileId } = getFilePermissionsSchema.parse(payload);

  // Requires at least VIEWER access on the file to view who has access
  await requireAccess(session.user as any, fileId, "VIEWER");

  return db.filePermission.findMany({
    where: { fileId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          username: true,
          role: true,
        },
      },
      grantedBy: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}


const leaveShareSchema = z.object({ fileId: z.string().min(1) });

/**
 * Remove a file from "Shared with me": the recipient drops their own grant.
 */
export async function leaveShare(payload: unknown) {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const { fileId } = leaveShareSchema.parse(payload);
  const { count } = await db.filePermission.deleteMany({
    where: { fileId, userId: session.user.id },
  });

  if (count > 0) {
    await invalidatePermCache(session.user.id, fileId);
    const { invalidateUserSearchCache } = await import("@/lib/search");
    await invalidateUserSearchCache();
    await recordAudit({
      action: "role.leave_file",
      targetType: "file",
      targetId: fileId,
    });
  }
  return { success: true };
}
