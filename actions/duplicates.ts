"use server";

import { z } from "zod";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-context";
import { AppError } from "@/lib/result";
import { requireAccess } from "@/lib/permissions";
import { findDuplicates, type DuplicateFile } from "@/lib/duplicates";

/** Checksum and readable duplicates of a file. Requires read access. */
export async function getFileIntegrity(
  payload: unknown,
): Promise<{ sha256: string | null; duplicates: DuplicateFile[] }> {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const { fileId } = z.object({ fileId: z.string().min(1) }).parse(payload);
  const user = { id: session.user.id, role: session.user.role as Role };
  await requireAccess(user, fileId, "GUEST");

  const file = await db.file.findUnique({ where: { id: fileId }, select: { sha256: true } });
  if (!file) throw AppError.notFound("File not found");
  if (!file.sha256) return { sha256: null, duplicates: [] };

  return { sha256: file.sha256, duplicates: await findDuplicates(user, file.sha256, fileId) };
}
