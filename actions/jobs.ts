"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-context";
import { AppError } from "@/lib/result";
import { getJobStatus } from "@/lib/jobs";

const getJobSchema = z.object({
  jobId: z.string().min(1),
});

/**
 * Retrieve a background job's status.
 * Restricted to the user who enqueued it, or admins/superadmins.
 */
export async function getJob(payload: unknown) {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const { jobId } = getJobSchema.parse(payload);
  const job = await getJobStatus(jobId);
  if (!job) throw AppError.notFound("Job not found");

  const userRole = session.user.role as string;
  const isAdmin = userRole === "ADMIN" || userRole === "SUPERADMIN";

  const payloadObj = job.payload as any;
  const isOwner = payloadObj?.userId === session.user.id;

  if (!isOwner && !isAdmin) {
    if (job.type === "COMPRESSION" && payloadObj?.fileId) {
      const { assertWriteAccess } = await import("@/lib/file-access");
      try {
        await assertWriteAccess(session.user as any, payloadObj.fileId);
      } catch {
        throw AppError.forbidden("Access denied to this job");
      }
    } else {
      throw AppError.forbidden("Access denied to this job");
    }
  }

  return {
    id: job.id,
    type: job.type,
    status: job.status,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    error: job.error,
    result: job.result,
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
  };
}
