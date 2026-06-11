"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-context";
import { AppError } from "@/lib/result";
import { invalidatePermCache, requireAccess } from "@/lib/permissions";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const addMentionSchema = z.object({
  fileId: z.string().min(1),
  mentionedUserId: z.string().min(1),
});

const removeMentionSchema = z.object({
  fileId: z.string().min(1),
  mentionedUserId: z.string().min(1),
});

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Mention a user on a file.
 *
 * - Requires ADMIN access on the file (owner or admin role).
 * - Creates a `FileMention` row (idempotent on duplicate).
 * - Creates an in-app `Notification` for the mentioned user.
 * - If the file is `isMentionRestricted`, the mention doubles as the access
 *   grant → invalidates `perm:` cache so the next request re-resolves.
 */
export async function addMention(payload: z.infer<typeof addMentionSchema>) {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const { fileId, mentionedUserId } = addMentionSchema.parse(payload);

  // Must be ADMIN or higher to mention users.
  await requireAccess(session.user as any, fileId, "ADMIN");

  // Fetch file metadata for the notification message + restriction check.
  const file = await db.file.findUnique({
    where: { id: fileId },
    select: { displayName: true, isMentionRestricted: true },
  });
  if (!file) throw AppError.notFound("File not found");

  // Verify the mentioned user exists.
  const mentioned = await db.user.findUnique({
    where: { id: mentionedUserId },
    select: { id: true },
  });
  if (!mentioned) throw AppError.notFound("Mentioned user not found");

  // Upsert the mention + create a notification atomically.
  await db.$transaction(async (tx) => {
    // Upsert: if already mentioned this is a no-op on the mention row,
    // but we still create the notification so the user is re-notified.
    await tx.fileMention.upsert({
      where: {
        fileId_mentionedUserId: { fileId, mentionedUserId },
      },
      create: {
        fileId,
        mentionedUserId,
        addedById: session.user.id,
      },
      update: {
        // Refresh the author if re-mentioned by someone else.
        addedById: session.user.id,
      },
    });

    await tx.notification.create({
      data: {
        userId: mentionedUserId,
        fileId,
        type: "MENTION",
        message: `You were mentioned in "${file.displayName}".`,
      },
    });
  });

  // If the file is mention-restricted, the mention is now the access grant.
  // Bust the perm cache so the next permission check re-resolves from DB.
  if (file.isMentionRestricted) {
    await invalidatePermCache(mentionedUserId, fileId);
  }

  // Phase 8 Search refresh
  const { updateSearchVector, invalidateUserSearchCache } = await import("@/lib/search");
  await updateSearchVector(fileId);
  
  const fileForOwner = await db.file.findUnique({ where: { id: fileId }, select: { ownerId: true }});
  if (fileForOwner?.ownerId) await invalidateUserSearchCache(fileForOwner.ownerId);

  return { success: true };
}

/**
 * Remove a mention from a file.
 *
 * - Requires ADMIN access.
 * - Deletes the `FileMention` row (idempotent if already absent).
 * - Busts `perm:` cache for the affected user (revokes mention-based access).
 */
export async function removeMention(payload: z.infer<typeof removeMentionSchema>) {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const { fileId, mentionedUserId } = removeMentionSchema.parse(payload);

  await requireAccess(session.user as any, fileId, "ADMIN");

  await db.fileMention.deleteMany({
    where: { fileId, mentionedUserId },
  });

  // Always bust the cache — even if file wasn't mention-restricted, this is
  // a safe no-cost invalidation.
  await invalidatePermCache(mentionedUserId, fileId);

  // Phase 8 Search refresh
  const { updateSearchVector, invalidateUserSearchCache } = await import("@/lib/search");
  await updateSearchVector(fileId);
  
  const fileForOwner = await db.file.findUnique({ where: { id: fileId }, select: { ownerId: true }});
  if (fileForOwner?.ownerId) await invalidateUserSearchCache(fileForOwner.ownerId);

  return { success: true };
}
