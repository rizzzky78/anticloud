"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-context";
import { AppError } from "@/lib/result";
import { assertWriteAccess } from "@/lib/file-access";
import { enqueueJob } from "@/lib/jobs";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { bustFileMeta } from "@/lib/file-meta";

const compressSchema = z.object({
  fileId: z.string().min(1),
});

export async function compress(payload: unknown) {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const { fileId } = compressSchema.parse(payload);
  
  // Need write access to compress (it creates a derived file owned by same user)
  await assertWriteAccess(session.user as any, fileId);

  const job = await enqueueJob({
    type: "COMPRESSION",
    payload: { fileId, userId: session.user.id },
    maxAttempts: 3,
  });

  await recordAudit({
    action: "file.compress",
    targetType: "file",
    targetId: fileId,
    metadata: { jobId: job.id },
  });

  return { jobId: job.id };
}

const promoteSchema = z.object({
  derivativeId: z.string().min(1),
});

/**
 * Promote a derivative file to be the primary (canonical) version.
 * Swaps binary details (objectKey, mimeType, size) in a transaction,
 * leaving the original uncompressed binary preserved as a derivative.
 */
export async function promoteDerivative(payload: unknown) {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const { derivativeId } = promoteSchema.parse(payload);
  const derivative = await db.file.findUnique({
    where: { id: derivativeId },
  });
  if (!derivative || !derivative.derivedFromId) {
    throw AppError.notFound("Derivative file not found");
  }

  const originalId = derivative.derivedFromId;
  
  // Assert write access to the original file
  await assertWriteAccess(session.user as any, originalId);
  const original = await db.file.findUnique({
    where: { id: originalId },
  });
  if (!original) throw AppError.notFound("Original file not found");

  // Swap objectKey, mimeType, size
  await db.$transaction([
    db.file.update({
      where: { id: originalId },
      data: {
        objectKey: derivative.objectKey,
        mimeType: derivative.mimeType,
        size: derivative.size,
      },
    }),
    db.file.update({
      where: { id: derivativeId },
      data: {
        objectKey: original.objectKey,
        mimeType: original.mimeType,
        size: original.size,
        displayName: `${original.displayName} (Original)`,
      },
    }),
  ]);

  await bustFileMeta(originalId);
  await bustFileMeta(derivativeId);

  // Invalidate search vector and caches for the swap
  const { updateSearchVector, invalidateUserSearchCache } = await import("@/lib/search");
  await updateSearchVector(originalId);
  await updateSearchVector(derivativeId);
  await invalidateUserSearchCache(session.user.id);

  await recordAudit({
    action: "file.promote_derivative",
    targetType: "file",
    targetId: originalId,
    metadata: { derivativeId },
  });

  return { fileId: originalId };
}

