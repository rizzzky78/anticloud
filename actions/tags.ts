"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { redis, redisKey, NS } from "@/lib/redis";
import { getCurrentUser } from "@/lib/auth-context";
import { AppError } from "@/lib/result";
import { requireAccess } from "@/lib/permissions";

// ─── Tag-frequency sorted-set key ────────────────────────────────────────────
// One global sorted-set: `tagfreq:` → member = tag value, score = usage count.
// ZRANGEBYLEX + ZREVRANGEBYSCORE serve autocomplete (Phase 6.3).
const TAG_FREQ_KEY = redisKey(NS.tagfreq);

// ─── Schemas ─────────────────────────────────────────────────────────────────

const addTagSchema = z.object({
  fileId: z.string().min(1),
  value: z
    .string()
    .min(1)
    .max(64)
    .toLowerCase()
    .regex(/^[\w\-]+$/, "Tags may only contain letters, numbers, hyphens and underscores"),
});

const removeTagSchema = z.object({
  fileId: z.string().min(1),
  value: z.string().min(1).max(64).toLowerCase(),
});

import { updateSearchVector, invalidateUserSearchCache } from "@/lib/search";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Bust the Phase-8 search cache for a file's owner.
 */
async function bustOwnerSearchCache(fileId: string): Promise<void> {
  const file = await db.file.findUnique({
    where: { id: fileId },
    select: { ownerId: true },
  });
  if (file?.ownerId) {
    await invalidateUserSearchCache(file.ownerId);
  }
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Add a tag to a file.
 *
 * - Requires at least VIEWER access on the file (permission-gated).
 * - Rejects if the file is `isReadOnly`.
 * - Upserts the `Tag` row (by unique value) and the `FileTag` junction.
 * - Increments the tag's score in the `tagfreq:` Redis sorted set.
 */
export async function addTag(payload: z.infer<typeof addTagSchema>) {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const { fileId, value } = addTagSchema.parse(payload);

  // Permission gate: VIEWER or higher.
  await requireAccess(session.user as any, fileId, "VIEWER");

  // Reject read-only files.
  const file = await db.file.findUnique({
    where: { id: fileId },
    select: { isReadOnly: true },
  });
  if (!file) throw AppError.notFound("File not found");
  if (file.isReadOnly) throw AppError.readOnly("Cannot tag a read-only file");

  // Upsert Tag + FileTag in a transaction.
  await db.$transaction(async (tx) => {
    const tag = await tx.tag.upsert({
      where: { value },
      create: { value },
      update: {},
      select: { id: true },
    });

    await tx.fileTag.upsert({
      where: { fileId_tagId: { fileId, tagId: tag.id } },
      create: { fileId, tagId: tag.id },
      update: {},
    });
  });

  // Bump Redis frequency score (+1).
  await redis.zincrby(TAG_FREQ_KEY, 1, value);

  // Bust the file owner's search cache (Phase 8 contract).
  await updateSearchVector(fileId);
  await bustOwnerSearchCache(fileId);

  return { success: true };
}

/**
 * Remove a tag from a file.
 *
 * - Requires at least VIEWER access.
 * - Rejects if the file is `isReadOnly`.
 * - Deletes the `FileTag` junction row (the `Tag` itself is preserved).
 * - Decrements the tag's Redis frequency score (floor 0).
 */
export async function removeTag(payload: z.infer<typeof removeTagSchema>) {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const { fileId, value } = removeTagSchema.parse(payload);

  await requireAccess(session.user as any, fileId, "VIEWER");

  const file = await db.file.findUnique({
    where: { id: fileId },
    select: { isReadOnly: true },
  });
  if (!file) throw AppError.notFound("File not found");
  if (file.isReadOnly) throw AppError.readOnly("Cannot modify tags on a read-only file");

  // Resolve tag id.
  const tag = await db.tag.findUnique({ where: { value }, select: { id: true } });
  if (!tag) return { success: true }; // idempotent — tag didn't exist

  await db.fileTag.deleteMany({
    where: { fileId, tagId: tag.id },
  });

  // Decrement Redis score, but never go below 0.
  const current = await redis.zscore(TAG_FREQ_KEY, value);
  const currentScore = current ? parseFloat(current) : 0;
  if (currentScore > 0) {
    await redis.zincrby(TAG_FREQ_KEY, -1, value);
  }

  await updateSearchVector(fileId);
  await bustOwnerSearchCache(fileId);

  return { success: true };
}
