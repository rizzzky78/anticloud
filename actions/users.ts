"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-context";
import { AppError } from "@/lib/result";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { effectiveQuota, usageByOwner } from "@/lib/quota";

/**
 * Search users by name, email, or username.
 * Primarily used by the Mentions Manager and Sharing controls.
 */
export async function searchUsers(query: string) {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  // Intranet directory lookup for sharing/mentions. Require a minimal query so
  // the endpoint cannot be used to dump the whole user table in one call.
  const trimmed = query.trim().slice(0, 100);
  if (trimmed.length < 2) return [];

  return db.user.findMany({
    where: {
      OR: [
        { name: { contains: trimmed, mode: "insensitive" } },
        { email: { contains: trimmed, mode: "insensitive" } },
        { username: { contains: trimmed, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      username: true,
      role: true,
    },
    take: 10,
  });
}

/**
 * List all users. Admin or Superadmin only.
 */
export async function getUsers() {
  const session = await getCurrentUser();
  if (!session || !["SUPERADMIN", "ADMIN"].includes(session.user.role as string)) {
    throw AppError.forbidden();
  }

  const [users, usage] = await Promise.all([
    db.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        username: true,
        role: true,
        createdAt: true,
        storageQuota: true,
        disabledAt: true,
        disabledReason: true,
        twoFactorEnabled: true,
      },
    }),
    usageByOwner(),
  ]);

  return users.map(({ storageQuota, disabledAt, twoFactorEnabled, ...u }) => {
    const quota = effectiveQuota({ role: u.role, storageQuota });
    return {
      ...u,
      disabledAt: disabledAt?.toISOString() ?? null,
      twoFactorEnabled: !!twoFactorEnabled,
      storageUsed: (usage.get(u.id) ?? BigInt(0)).toString(),
      // Raw setting: null = deployment default, "0" = unlimited.
      storageQuotaSetting: storageQuota === null ? null : storageQuota.toString(),
      storageQuotaEffective: quota === null ? null : quota.toString(),
    };
  });
}

const setQuotaSchema = z.object({
  userId: z.string().min(1),
  // null → use the deployment default; 0 → unlimited; otherwise MiB.
  quotaMb: z.number().int().min(0).max(100_000_000).nullable(),
});

/** Set a user's storage quota. Admin or Superadmin only. */
export async function setUserQuota(payload: unknown) {
  const session = await getCurrentUser();
  if (!session || !["SUPERADMIN", "ADMIN"].includes(session.user.role as string)) {
    throw AppError.forbidden();
  }

  const { userId, quotaMb } = setQuotaSchema.parse(payload);
  const target = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!target) throw AppError.notFound("User not found");
  if (target.role === "SUPERADMIN" && session.user.role !== "SUPERADMIN") {
    throw AppError.forbidden("Only a superadmin can change a superadmin's quota");
  }

  const storageQuota = quotaMb === null ? null : BigInt(quotaMb) * BigInt(1024 * 1024);
  await db.user.update({ where: { id: userId }, data: { storageQuota } });
  await recordAudit({
    actorId: session.user.id,
    action: "user.set_quota",
    targetType: "user",
    targetId: userId,
    metadata: { quotaMb },
  });
  return { userId };
}
