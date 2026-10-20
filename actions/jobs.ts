"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-context";
import { AppError } from "@/lib/result";
import { getJobStatus, retryJob } from "@/lib/jobs";
import { recordAudit } from "@/lib/audit";

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
    result: publicJobResult(job.result),
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
  };
}

/** Strip storage internals (object keys) from a job result before it reaches the client. */
function publicJobResult(result: unknown) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return result;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { archiveKey, ...rest } = result as Record<string, unknown>;
  return rest;
}

/**
 * Re-queue a FAILED or DEAD_LETTER job. SUPERADMIN only.
 */
export async function retryDeadJob(payload: unknown) {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();
  if ((session.user.role as string) !== "SUPERADMIN") throw AppError.forbidden();

  const { jobId } = getJobSchema.parse(payload);
  const job = await getJobStatus(jobId);
  if (!job) throw AppError.notFound("Job not found");
  if (job.status !== "DEAD_LETTER" && job.status !== "FAILED") {
    throw AppError.badRequest("Only failed or dead-lettered jobs can be retried");
  }

  await retryJob(jobId);
  await recordAudit({
    actorId: session.user.id,
    action: "job.retry",
    targetType: "job",
    targetId: jobId,
  });
  return { jobId };
}
