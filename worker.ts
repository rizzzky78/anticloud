import { consumeJobs } from './lib/jobs';
import { compressFile } from './lib/compression';
import { Job } from '@prisma/client';

/**
 * Worker entry point.
 * Run this concurrently with the Next.js server.
 */
async function main() {
  console.log("Starting background worker...");

  await consumeJobs(async (job: Job) => {
    console.log(`Processing job ${job.id} of type ${job.type}...`);

    switch (job.type) {
      case "COMPRESSION": {
        const { fileId } = job.payload as { fileId: string };
        return await compressFile(job.id, fileId);
      }
      
      case "BULK_ARCHIVE": {
        // Handled below or via another script
        // For Phase 09, we'll leave it as a stub, and implement async zip later if needed
        console.log("BULK_ARCHIVE not fully implemented yet");
        return { success: true };
      }

      case "TTL_EXPIRY": {
        // Normally TTL expiry is a cron endpoint `app/api/cron/expire/route.ts` 
        // that hits MinIO and DB. If it's a job, process it here.
        console.log("TTL_EXPIRY job triggered");
        return { success: true };
      }

      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }
  });
}

main().catch(err => {
  console.error("Fatal worker error:", err);
  process.exit(1);
});
