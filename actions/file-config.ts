"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-context";
import { AppError } from "@/lib/result";
import { assertWriteAccess, assertNotReadOnly } from "@/lib/file-access";
import { bustFileMeta } from "@/lib/file-meta";
import { invalidatePermCache } from "@/lib/permissions";
import { env } from "@/lib/env";
import { recordAudit } from "@/lib/audit";

// Superadmin recovery window for soft-deleted files (phase-09 hard-deletes after this).
const GRACE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>["user"];

// ─── 5.1 — TTL & soft-delete ──────────────────────────────────────────────────

const setTTLSchema = z.object({
  fileId: z.string().min(1),
  // ISO-8601 datetime string, or null to clear the TTL.
  expiresAt: z.iso.datetime().nullable(),
});

/**
 * Set or clear the TTL on a file.
 * When `expiresAt` is reached the file becomes inaccessible; phase-09's expiry
 * cron will soft-delete it and later hard-delete it after the grace window.
 * This config op is not blocked by isReadOnly.
 */
export async function setTTL(payload: unknown) {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const { fileId, expiresAt } = setTTLSchema.parse(payload);
  await assertWriteAccess(session.user as SessionUser, fileId);

  await db.file.update({
    where: { id: fileId },
    data: { expiresAt: expiresAt ? new Date(expiresAt) : null },
  });

  await bustFileMeta(fileId);
  await recordAudit({
    action: "file.set_ttl",
    targetType: "file",
    targetId: fileId,
    metadata: { expiresAt },
  });
  return { fileId };
}

const fileIdSchema = z.object({ fileId: z.string().min(1) });

/**
 * Soft-delete a file: sets `deletedAt` to now. The file disappears from all
 * normal listings and serves until a SUPERADMIN recovers it or the phase-09
 * cron hard-deletes it after the grace window.
 * Blocked by isReadOnly unless caller is SUPERADMIN.
 */
export async function softDeleteFile(payload: unknown) {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const { fileId } = fileIdSchema.parse(payload);
  const file = await assertWriteAccess(session.user as SessionUser, fileId);
  assertNotReadOnly(file, session.user.role as string | undefined);

  await db.file.update({
    where: { id: fileId },
    data: { deletedAt: new Date() },
  });

  await bustFileMeta(fileId);
  // Evict all permission decisions — the file is now inaccessible.
  await invalidatePermCache(null, fileId);
  await recordAudit({
    action: "file.soft_delete",
    targetType: "file",
    targetId: fileId,
  });
  return { fileId };
}

/**
 * Recover a soft-deleted file. SUPERADMIN only, within the 30-day grace window.
 */
export async function recoverFile(payload: unknown) {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();
  if ((session.user.role as string) !== "SUPERADMIN") throw AppError.forbidden();

  const { fileId } = fileIdSchema.parse(payload);

  // Load the file even when soft-deleted.
  const file = await db.file.findFirst({ where: { id: fileId } });
  if (!file) throw AppError.notFound("File not found");

  if (!file.deletedAt) {
    // Already active — idempotent success.
    return { fileId };
  }

  const elapsed = Date.now() - file.deletedAt.getTime();
  if (elapsed > GRACE_WINDOW_MS) {
    throw AppError.badRequest(
      "Recovery window has expired (30-day grace period). File must be restored from backup.",
    );
  }

  await db.file.update({
    where: { id: fileId },
    data: { deletedAt: null },
  });

  await bustFileMeta(fileId);
  await recordAudit({
    action: "file.recover",
    targetType: "file",
    targetId: fileId,
  });
  return { fileId };
}

/**
 * Restore a soft-deleted file the caller owns (or holds an ADMIN/SUPERADMIN
 * grant on), within the 30-day grace window. This is the user-facing recycle
 * bin counterpart to `recoverFile` (which is SUPERADMIN-only and unscoped).
 */
export async function restoreFile(payload: unknown) {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const { fileId } = fileIdSchema.parse(payload);
  // Write access is required; allow operating on the soft-deleted row.
  const file = await assertWriteAccess(session.user as SessionUser, fileId, {
    allowSoftDeleted: true,
  });

  if (!file.deletedAt) {
    // Already active — idempotent success.
    return { fileId };
  }

  const elapsed = Date.now() - file.deletedAt.getTime();
  if (elapsed > GRACE_WINDOW_MS) {
    throw AppError.badRequest(
      "Recovery window has expired (30-day grace period). File must be restored from backup.",
    );
  }

  await db.file.update({
    where: { id: fileId },
    data: { deletedAt: null },
  });

  await bustFileMeta(fileId);
  // Re-evaluate access now that the file is live again.
  await invalidatePermCache(null, fileId);
  await recordAudit({
    action: "file.restore",
    targetType: "file",
    targetId: fileId,
  });
  return { fileId };
}

// ─── 5.2 — Permanent presigned URL token ─────────────────────────────────────

/**
 * Generate (or rotate) a permanent URL token for a file.
 * The token is stored on the file row; the URL is `APP_URL/api/files/p/<token>`.
 * The URL only serves content while the file is PUBLIC — changing visibility to
 * PRIVATE makes the URL return 404 even though the token is unchanged.
 */
export async function generatePermanentToken(payload: unknown) {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const { fileId } = fileIdSchema.parse(payload);
  await assertWriteAccess(session.user as SessionUser, fileId);

  const token = randomUUID();

  await db.file.update({
    where: { id: fileId },
    data: { permanentUrlToken: token },
  });

  await bustFileMeta(fileId);
  await recordAudit({
    action: "file.generate_token",
    targetType: "file",
    targetId: fileId,
  });

  const url = `${env.APP_URL}/api/files/p/${token}`;
  return { fileId, token, url };
}

/**
 * Revoke a file's permanent URL token. Any existing permanent URL immediately
 * stops serving, even before the token value is regenerated.
 */
export async function revokePermanentToken(payload: unknown) {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const { fileId } = fileIdSchema.parse(payload);
  await assertWriteAccess(session.user as SessionUser, fileId);

  await db.file.update({
    where: { id: fileId },
    data: { permanentUrlToken: null },
  });

  await bustFileMeta(fileId);
  await recordAudit({
    action: "file.revoke_token",
    targetType: "file",
    targetId: fileId,
  });
  return { fileId };
}

// ─── 5.3 — Read-only mode ─────────────────────────────────────────────────────

const setReadOnlySchema = z.object({
  fileId: z.string().min(1),
  isReadOnly: z.boolean(),
});

/**
 * Set or lift the read-only flag.
 * Setting it prevents all content mutations (replace, delete, rename, move) for
 * non-superadmin callers. SUPERADMIN can always override.
 * setReadOnly itself is not blocked by the current flag — an owner can always
 * toggle it (including lifting it).
 */
export async function setReadOnly(payload: unknown) {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const { fileId, isReadOnly } = setReadOnlySchema.parse(payload);
  await assertWriteAccess(session.user as SessionUser, fileId);

  await db.file.update({
    where: { id: fileId },
    data: { isReadOnly },
  });

  await bustFileMeta(fileId);
  await recordAudit({
    action: "file.set_readonly",
    targetType: "file",
    targetId: fileId,
    metadata: { isReadOnly },
  });
  return { fileId };
}

// ─── 5.4 — Mention-restricted access ─────────────────────────────────────────

const setMentionRestrictedSchema = z.object({
  fileId: z.string().min(1),
  isMentionRestricted: z.boolean(),
});

/**
 * Enable or disable mention-restricted access.
 * When enabled, users who would otherwise reach a file via public visibility
 * are denied unless they appear in the file's mention list (phase-06).
 * Users with explicit file-permission grants are unaffected (restriction is
 * additive, applied only after RBAC in the resolution order).
 * Changing this setting invalidates the permission cache for the file.
 */
export async function setMentionRestricted(payload: unknown) {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const { fileId, isMentionRestricted } = setMentionRestrictedSchema.parse(payload);
  await assertWriteAccess(session.user as SessionUser, fileId);

  await db.file.update({
    where: { id: fileId },
    data: { isMentionRestricted },
  });

  await bustFileMeta(fileId);
  // Mention-restriction change affects all permission decisions for this file.
  await invalidatePermCache(null, fileId);
  await recordAudit({
    action: "file.set_mention_restricted",
    targetType: "file",
    targetId: fileId,
    metadata: { isMentionRestricted },
  });
  return { fileId };
}
