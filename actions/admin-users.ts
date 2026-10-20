"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-context";
import { AppError } from "@/lib/result";
import { recordAudit } from "@/lib/audit";
import { invalidatePermCache } from "@/lib/permissions";
import { invalidateUserSearchCache } from "@/lib/search";
import { hashPassword, refreshUserSessions, revokeAllUserSessions } from "@/lib/auth-admin";

/**
 * Account lifecycle for administrators (plan/phase-22). Admins manage
 * non-superadmin accounts; only superadmins can act on superadmins. Nobody
 * can disable or delete their own account here.
 */

type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>["user"];

const MIN_PASSWORD = 8;

async function requireAdmin() {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();
  const role = session.user.role as string;
  if (role !== "ADMIN" && role !== "SUPERADMIN") throw AppError.forbidden();
  return session;
}

async function loadTarget(actor: SessionUser, userId: string, { allowSelf = false } = {}) {
  if (!allowSelf && userId === actor.id) {
    throw AppError.badRequest("You cannot do this to your own account");
  }
  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, disabledAt: true },
  });
  if (!target) throw AppError.notFound("User not found");
  if (target.role === "SUPERADMIN" && actor.role !== "SUPERADMIN") {
    throw AppError.forbidden("Only a superadmin can manage a superadmin account");
  }
  return target;
}

// ─── Create ──────────────────────────────────────────────────────────────────

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.email("Enter a valid email").max(254).transform((v) => v.toLowerCase()),
  username: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((v) => (v ? v.toLowerCase() : undefined))
    .refine((v) => v === undefined || /^[a-z0-9_.]{3,30}$/.test(v), {
      message: "Username: 3–30 letters, numbers, dots or underscores",
    }),
  password: z.string().min(MIN_PASSWORD, `Password must be at least ${MIN_PASSWORD} characters`).max(128),
  role: z.enum(["SUPERADMIN", "ADMIN", "VIEWER", "GUEST"]).default("VIEWER"),
});

/**
 * Create an account with an initial password (there is no email delivery on
 * the intranet; the admin hands the password over and the user changes it).
 */
export async function createUserAccount(payload: unknown) {
  const session = await requireAdmin();
  const input = createSchema.parse(payload);
  if (input.role === "SUPERADMIN" && session.user.role !== "SUPERADMIN") {
    throw AppError.forbidden("Only a superadmin can create a superadmin");
  }

  const clash = await db.user.findFirst({
    where: {
      OR: [{ email: input.email }, ...(input.username ? [{ username: input.username }] : [])],
    },
    select: { email: true },
  });
  if (clash) {
    throw AppError.conflict(
      clash.email === input.email ? "Email is already in use" : "Username is already taken",
    );
  }

  const passwordHash = await hashPassword(input.password);
  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        emailVerified: true,
        username: input.username ?? null,
        displayUsername: input.username ?? null,
        role: input.role,
      },
      select: { id: true },
    });
    await tx.account.create({
      data: {
        userId: created.id,
        accountId: created.id,
        providerId: "credential",
        password: passwordHash,
      },
    });
    return created;
  });

  await recordAudit({
    actorId: session.user.id,
    action: "user.create",
    targetType: "user",
    targetId: user.id,
    metadata: { email: input.email, role: input.role },
  });
  return { userId: user.id };
}

// ─── Disable / enable ────────────────────────────────────────────────────────

const disableSchema = z.object({
  userId: z.string().min(1),
  disabled: z.boolean(),
  reason: z.string().trim().max(280).optional(),
});

/** Disable (sign out everywhere, block sign-in) or re-enable an account. */
export async function setUserDisabled(payload: unknown) {
  const session = await requireAdmin();
  const { userId, disabled, reason } = disableSchema.parse(payload);
  await loadTarget(session.user, userId);

  await db.user.update({
    where: { id: userId },
    data: disabled
      ? { disabledAt: new Date(), disabledReason: reason || null }
      : { disabledAt: null, disabledReason: null },
  });

  if (disabled) {
    await revokeAllUserSessions(userId);
  } else {
    await refreshUserSessions(userId);
  }
  await invalidatePermCache(userId, null);

  await recordAudit({
    actorId: session.user.id,
    action: disabled ? "user.disable" : "user.enable",
    targetType: "user",
    targetId: userId,
    metadata: disabled ? { reason: reason || null } : {},
  });
  return { userId, disabled };
}

// ─── Sessions & password ─────────────────────────────────────────────────────

/** Sign a user out of every device. */
export async function signOutUserEverywhere(payload: unknown) {
  const session = await requireAdmin();
  const { userId } = z.object({ userId: z.string().min(1) }).parse(payload);
  await loadTarget(session.user, userId);

  await revokeAllUserSessions(userId);
  await recordAudit({
    actorId: session.user.id,
    action: "user.revoke_sessions",
    targetType: "user",
    targetId: userId,
  });
  return { userId };
}

const resetSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(MIN_PASSWORD, `Password must be at least ${MIN_PASSWORD} characters`).max(128),
});

/** Set a new password for a user (and sign them out everywhere). */
export async function resetUserPassword(payload: unknown) {
  const session = await requireAdmin();
  const { userId, password } = resetSchema.parse(payload);
  await loadTarget(session.user, userId);

  const passwordHash = await hashPassword(password);
  const existing = await db.account.findFirst({
    where: { userId, providerId: "credential" },
    select: { id: true },
  });
  if (existing) {
    await db.account.update({ where: { id: existing.id }, data: { password: passwordHash } });
  } else {
    await db.account.create({
      data: { userId, accountId: userId, providerId: "credential", password: passwordHash },
    });
  }
  await revokeAllUserSessions(userId);

  await recordAudit({
    actorId: session.user.id,
    action: "user.reset_password",
    targetType: "user",
    targetId: userId,
  });
  return { userId };
}

// ─── Delete ──────────────────────────────────────────────────────────────────

const deleteSchema = z.object({
  userId: z.string().min(1),
  // Hand files and folders to this user; null leaves them unowned (kept per
  // their visibility, manageable by admins).
  transferToUserId: z.string().min(1).nullable(),
});

/** Delete an account, optionally transferring its files and folders first. */
export async function deleteUserAccount(payload: unknown) {
  const session = await requireAdmin();
  const { userId, transferToUserId } = deleteSchema.parse(payload);
  const target = await loadTarget(session.user, userId);

  if (transferToUserId) {
    if (transferToUserId === userId) throw AppError.badRequest("Choose a different user");
    const recipient = await db.user.findUnique({
      where: { id: transferToUserId },
      select: { id: true, disabledAt: true },
    });
    if (!recipient) throw AppError.notFound("Transfer recipient not found");
    if (recipient.disabledAt) throw AppError.badRequest("Transfer recipient is disabled");
  }

  const [files, folders] = await db.$transaction(async (tx) => {
    const movedFiles = transferToUserId
      ? await tx.file.updateMany({ where: { ownerId: userId }, data: { ownerId: transferToUserId } })
      : { count: 0 };
    const movedFolders = transferToUserId
      ? await tx.folder.updateMany({ where: { ownerId: userId }, data: { ownerId: transferToUserId } })
      : { count: 0 };
    // The recipient owns these now; explicit grants of theirs are redundant.
    if (transferToUserId) {
      await tx.filePermission.deleteMany({
        where: { userId: transferToUserId, file: { ownerId: transferToUserId } },
      });
    }
    await tx.user.delete({ where: { id: userId } });
    return [movedFiles.count, movedFolders.count];
  });

  await revokeAllUserSessions(userId).catch(() => {});
  await invalidatePermCache(null, null);
  await invalidateUserSearchCache();

  await recordAudit({
    actorId: session.user.id,
    action: "user.delete",
    targetType: "user",
    targetId: userId,
    metadata: {
      email: target.email,
      transferToUserId,
      filesTransferred: files,
      foldersTransferred: folders,
    },
  });
  return { userId, filesTransferred: files, foldersTransferred: folders };
}
