"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-context";
import { AppError } from "@/lib/result";
import { Role } from "@prisma/client";
import { z } from "zod";
import { invalidatePermCache, requireAccess } from "@/lib/permissions";

const setSystemRoleSchema = z.object({
  userId: z.string(),
  newRole: z.nativeEnum(Role),
});

export async function setSystemRole(payload: z.infer<typeof setSystemRoleSchema>) {
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
  
  // TODO: Phase 10 Audit Log
  return { success: true };
}

const grantFileRoleSchema = z.object({
  fileId: z.string(),
  targetUserId: z.string(),
  role: z.nativeEnum(Role),
});

export async function grantFileRole(payload: z.infer<typeof grantFileRoleSchema>) {
  const session = await getCurrentUser();
  if (!session) throw AppError.forbidden();

  const { fileId, targetUserId, role } = grantFileRoleSchema.parse(payload);
  
  // Requires ADMIN access on the file to grant roles
  await requireAccess(session.user as any, fileId, "ADMIN");

  await db.filePermission.upsert({
    where: { fileId_userId: { fileId, userId: targetUserId } },
    update: { role, grantedById: session.user.id },
    create: { fileId, userId: targetUserId, role, grantedById: session.user.id }
  });

  await invalidatePermCache(targetUserId, fileId);

  // TODO: Phase 10 Audit Log
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

  await db.filePermission.delete({
    where: { fileId_userId: { fileId, userId: targetUserId } }
  });

  await invalidatePermCache(targetUserId, fileId);

  // TODO: Phase 10 Audit Log
  return { success: true };
}
