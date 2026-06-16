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
        const { fileIds, userId } = job.payload as { fileIds: string[]; userId: string };

        // 1. Resolve permitted files
        const { getPermittedFiles } = await import("./lib/permissions");
        const permitted = await getPermittedFiles(userId);
        const permittedIds = new Set(permitted.map((f) => f.id));

        // 2. Fetch full file metadata
        const { db } = await import("./lib/db");
        const files = await db.file.findMany({
          where: { id: { in: fileIds } },
          select: { id: true, displayName: true, objectKey: true },
        });

        // 3. Build ZIP
        // archiver v8 ships named format classes (ESM); the old
        // `archiver("zip", opts)` factory was removed. Use `new ZipArchive(opts)`.
        const { ZipArchive } = await import("archiver");
        const archive = new ZipArchive({ zlib: { level: 0 } });

        const { PassThrough } = await import("node:stream");
        const passThroughStream = new PassThrough();

        const { buildObjectKey, KeyPrefix, putObject, presignedGetUrl } = await import("./lib/storage");
        const { key: newKey } = buildObjectKey({ prefix: KeyPrefix.archive });

        // Start upload
        const uploadPromise = putObject(newKey, passThroughStream);

        let manifest = "Bulk Download Manifest\n\n";

        archive.pipe(passThroughStream);

        for (const reqFileId of fileIds) {
          const file = files.find((f: { id: string }) => f.id === reqFileId);
          if (!file) {
            manifest += `[EXCLUDED] ID ${reqFileId}: File not found\n`;
            continue;
          }
          if (!permittedIds.has(file.id)) {
            manifest += `[EXCLUDED] ${file.displayName}: Access denied\n`;
            continue;
          }
          try {
            const { getObjectStream } = await import("./lib/storage");
            const stream = await getObjectStream(file.objectKey);
            archive.append(stream, { name: file.displayName });
            manifest += `[INCLUDED] ${file.displayName}\n`;
          } catch (err: any) {
            manifest += `[EXCLUDED] ${file.displayName}: Storage error (${err.message})\n`;
          }
        }

        archive.append(manifest, { name: "manifest.txt" });
        await archive.finalize();

        // Wait for upload to complete
        await uploadPromise;

        // Generate a 1-hour presigned URL
        const downloadUrl = await presignedGetUrl(newKey, 3600);

        return { success: true, downloadUrl };
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
