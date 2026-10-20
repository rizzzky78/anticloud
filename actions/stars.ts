"use server";

import { z } from "zod";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-context";
import { AppError } from "@/lib/result";
import { requireAccess } from "@/lib/permissions";

const starSchema = z.object({ fileId: z.string().min(1), starred: z.boolean() });

/** Star or unstar a file the caller can read. Idempotent. */
export async function setStarred(payload: unknown) {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const { fileId, starred } = starSchema.parse(payload);

  if (starred) {
    await requireAccess({ id: session.user.id, role: session.user.role as Role }, fileId, "GUEST");
    await db.fileStar.upsert({
      where: { userId_fileId: { userId: session.user.id, fileId } },
      update: {},
      create: { userId: session.user.id, fileId },
    });
  } else {
    await db.fileStar.deleteMany({ where: { userId: session.user.id, fileId } });
  }
  return { fileId, starred };
}

/** Whether the caller starred a file. */
export async function isStarred(payload: unknown): Promise<boolean> {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();
  const { fileId } = z.object({ fileId: z.string().min(1) }).parse(payload);
  const star = await db.fileStar.findUnique({
    where: { userId_fileId: { userId: session.user.id, fileId } },
    select: { fileId: true },
  });
  return !!star;
}
