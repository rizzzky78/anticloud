import { db } from './db';
import { redis, redisKey, NS } from './redis';
import { JobType, JobStatus, Job } from '@prisma/client';

const JOB_QUEUE_KEY = redisKey(NS.job, 'queue');

export type EnqueueOptions = {
  type: JobType;
  payload: any;
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

  // Push to Redis list
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
export async function completeJob(jobId: string, result?: any): Promise<void> {
  await db.job.update({
    where: { id: jobId },
    data: { status: "COMPLETED", completedAt: new Date(), result: result ?? {} },
  });
}

/**
 * Mark a job as failed, or send to DLQ if max attempts reached.
 */
export async function failJob(jobId: string, errorMsg: string): Promise<void> {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) return;

  const newAttempts = job.attempts + 1;
  const isDeadLetter = newAttempts >= job.maxAttempts;

  await db.job.update({
    where: { id: jobId },
    data: {
      attempts: newAttempts,
      error: errorMsg,
      status: isDeadLetter ? "DEAD_LETTER" : "FAILED",
    },
  });

  if (!isDeadLetter) {
    // Retry: Push back to queue
    // In a real system, we'd use exponential backoff (e.g. ZSET with timestamp), 
    // but for simplicity, we just push it back to the end of the queue.
    await redis.rpush(JOB_QUEUE_KEY, jobId);
  }
}

/**
 * Consume loop for a worker.
 */
export async function consumeJobs(handler: (job: Job) => Promise<any>) {
  console.log("Worker started. Listening for jobs...");
  
  while (true) {
    try {
      // BLPOP blocks until an element is available.
      // Returns [key, element]
      const result = await redis.blpop(JOB_QUEUE_KEY, 0);
      if (!result) continue;

      const [, jobId] = result;
      const job = await db.job.findUnique({ where: { id: jobId } });
      
      if (!job || (job.status !== "PENDING" && job.status !== "FAILED")) {
        continue; // Skip invalid or already processed jobs
      }

      await startJob(job.id);
      
      try {
        const handlerResult = await handler(job);
        await completeJob(job.id, handlerResult);
      } catch (err: any) {
        console.error(`Job ${job.id} failed:`, err);
        await failJob(job.id, err.message || "Unknown error");
      }
    } catch (err) {
      console.error("Worker loop error:", err);
      await new Promise(res => setTimeout(res, 5000)); // Sleep before retrying loop
    }
  }
}
