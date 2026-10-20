import { db } from './db';
import { redis, redisKey, NS } from './redis';
import { JobType, Job, Prisma } from '@prisma/client';

/** Ready-to-run job ids (FIFO). */
const JOB_QUEUE_KEY = redisKey(NS.job, 'queue');
/** Ids a worker has claimed and is currently processing. */
const JOB_PROCESSING_KEY = redisKey(NS.job, 'processing');
/** Failed jobs waiting for their backoff delay; score = due time (ms). */
const JOB_DELAYED_KEY = redisKey(NS.job, 'delayed');

const BASE_BACKOFF_MS = 15_000;
const MAX_BACKOFF_MS = 15 * 60_000;
/** A RUNNING job untouched for this long is considered abandoned by a dead worker. */
const STALE_RUNNING_MS = 30 * 60_000;

export type EnqueueOptions = {
  type: JobType;
  payload: Prisma.InputJsonValue;
  maxAttempts?: number;
};

/**
 * Enqueue a new background job.
 */
export async function enqueueJob({ type, payload, maxAttempts = 3 }: EnqueueOptions): Promise<Job> {
  const job = await db.job.create({
    data: {
      type,
      payload: payload ?? {},
      maxAttempts,
      status: "PENDING",
    },
  });

  await redis.rpush(JOB_QUEUE_KEY, job.id);
  return job;
}

/**
 * Get job status by ID.
 */
export async function getJobStatus(jobId: string): Promise<Job | null> {
  return db.job.findUnique({ where: { id: jobId } });
}

/**
 * Mark a job as running.
 */
export async function startJob(jobId: string): Promise<Job | null> {
  return db.job.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date() },
  });
}

/**
 * Mark a job as completed successfully.
 */
export async function completeJob(jobId: string, result?: Prisma.InputJsonValue): Promise<void> {
  await db.job.update({
    where: { id: jobId },
    data: { status: "COMPLETED", completedAt: new Date(), result: result ?? {} },
  });
}

function backoffMs(attempts: number): number {
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1));
}

/**
 * Mark a job as failed. Retries are scheduled with exponential backoff via the
 * delayed set; once attempts are exhausted the job lands in the dead-letter state.
 */
export async function failJob(jobId: string, errorMsg: string): Promise<void> {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) return;

  await redis.incr("metrics:job_failures_total").catch(() => {});

  const newAttempts = job.attempts + 1;
  const isDeadLetter = newAttempts >= job.maxAttempts;

  await db.job.update({
    where: { id: jobId },
    data: {
      attempts: newAttempts,
      error: errorMsg.slice(0, 2000),
      status: isDeadLetter ? "DEAD_LETTER" : "FAILED",
    },
  });

  if (!isDeadLetter) {
    await redis.zadd(JOB_DELAYED_KEY, Date.now() + backoffMs(newAttempts), jobId);
  }
}

/**
 * Re-queue a dead-lettered or failed job for another round of attempts.
 * Used by the superadmin jobs console.
 */
export async function retryJob(jobId: string): Promise<void> {
  await db.job.update({
    where: { id: jobId },
    data: { status: "PENDING", attempts: 0, error: null },
  });
  await redis.zrem(JOB_DELAYED_KEY, jobId);
  await redis.rpush(JOB_QUEUE_KEY, jobId);
}

/** Move delayed jobs whose backoff has elapsed back onto the ready queue. */
export async function promoteDueJobs(): Promise<number> {
  const due = await redis.zrangebyscore(JOB_DELAYED_KEY, 0, Date.now(), 'LIMIT', 0, 100);
  let moved = 0;
  for (const id of due) {
    // ZREM returns 1 only for the caller that actually removed it — safe with
    // several workers racing on the same set.
    if ((await redis.zrem(JOB_DELAYED_KEY, id)) === 1) {
      await redis.rpush(JOB_QUEUE_KEY, id);
      moved++;
    }
  }
  return moved;
}

/**
 * Recover jobs abandoned by a crashed worker: ids left in the processing list,
 * and RUNNING rows that have not finished within the stale window, are reset
 * to PENDING and re-queued. Call once on worker boot (single worker) or under
 * the maintenance lock.
 */
export async function recoverAbandonedJobs(): Promise<number> {
  let recovered = 0;

  // Drain the processing list left over from a previous worker process.
  for (;;) {
    const id = await redis.lmove(JOB_PROCESSING_KEY, JOB_QUEUE_KEY, 'LEFT', 'RIGHT');
    if (!id) break;
    await db.job.updateMany({
      where: { id, status: "RUNNING" },
      data: { status: "PENDING" },
    });
    recovered++;
  }

  const stale = await db.job.findMany({
    where: { status: "RUNNING", startedAt: { lt: new Date(Date.now() - STALE_RUNNING_MS) } },
    select: { id: true },
  });
  for (const { id } of stale) {
    await failJob(id, "Job abandoned by worker (timed out)");
    recovered++;
  }

  return recovered;
}

/** Number of jobs waiting in the ready queue (for metrics). */
export async function queueDepth(): Promise<number> {
  return redis.llen(JOB_QUEUE_KEY);
}

/**
 * Consume loop for a worker. Jobs are claimed with BLMOVE into a processing
 * list so a crash mid-job leaves a recoverable trace instead of losing it.
 *
 * Uses a dedicated connection because blocking commands would stall every
 * other command sharing the client.
 */
export async function consumeJobs(handler: (job: Job) => Promise<Prisma.InputJsonValue | void>) {
  console.log("Worker started. Listening for jobs...");
  const blocking = redis.duplicate();

  while (true) {
    try {
      const jobId = await blocking.blmove(JOB_QUEUE_KEY, JOB_PROCESSING_KEY, 'LEFT', 'RIGHT', 5);
      if (!jobId) continue;

      try {
        const job = await db.job.findUnique({ where: { id: jobId } });
        if (!job || (job.status !== "PENDING" && job.status !== "FAILED")) {
          continue; // Skip invalid or already processed jobs
        }

        await startJob(job.id);
        try {
          const handlerResult = await handler(job);
          await completeJob(job.id, handlerResult ?? {});
        } catch (err) {
          console.error(`Job ${job.id} failed:`, err);
          await failJob(job.id, err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        await redis.lrem(JOB_PROCESSING_KEY, 1, jobId);
      }
    } catch (err) {
      console.error("Worker loop error:", err);
      await new Promise(res => setTimeout(res, 5000)); // Sleep before retrying loop
    }
  }
}
