"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-context";
import { AppError } from "@/lib/result";
import { assertWriteAccess } from "@/lib/file-access";
import { enqueueJob } from "@/lib/jobs";

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
    payload: { fileId },
    maxAttempts: 3,
  });

  return { jobId: job.id };
}
