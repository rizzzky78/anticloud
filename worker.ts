import { consumeJobs, promoteDueJobs, recoverAbandonedJobs } from './lib/jobs';
import { compressFile } from './lib/compression';
import { runMaintenance } from './lib/maintenance';
import { Job } from '@prisma/client';

/** How often delayed (backoff) jobs are checked for promotion. */
const PROMOTE_INTERVAL_MS = 5_000;
/** How often the maintenance pass (expiry, trash purge, archive cleanup) runs. */
const MAINTENANCE_INTERVAL_MS = 15 * 60_000;

function startSchedulers() {
  setInterval(() => {
    promoteDueJobs().catch((err) => console.error("[scheduler] promote failed:", err));
  }, PROMOTE_INTERVAL_MS);

  const maintain = () =>
    runMaintenance()
      .then((r) => {
        if (r.ran && (r.expired || r.purged || r.archivesRemoved)) {
          console.log(
            `[maintenance] expired=${r.expired} purged=${r.purged} archives=${r.archivesRemoved}`,
          );
        }
      })
      .catch((err) => console.error("[maintenance] run failed:", err));
  setTimeout(maintain, 30_000);
  setInterval(maintain, MAINTENANCE_INTERVAL_MS);
}

/**
 * Worker entry point.
 * Run this concurrently with the Next.js server.
 */
async function main() {
  console.log("Starting background worker...");

  const recovered = await recoverAbandonedJobs();
  if (recovered > 0) console.log(`Recovered ${recovered} abandoned job(s).`);
  startSchedulers();

  await consumeJobs(async (job: Job) => {
    console.log(`Processing job ${job.id} of type ${job.type}...`);

    switch (job.type) {
      case "COMPRESSION": {
        const { fileId } = job.payload as { fileId: string };
        return await compressFile(job.id, fileId);
      }
      
      case "BULK_ARCHIVE": {
        const { fileIds, userId } = job.payload as { fileIds: string[]; userId: string };

        // 1. Resolve requested files and which of them the requester may read
        const { filterAccessibleFileIds } = await import("./lib/permissions");
        const { db } = await import("./lib/db");
        const requester = await db.user.findUnique({
          where: { id: userId },
          select: { id: true, role: true },
        });
        const files = await db.file.findMany({
          where: { id: { in: fileIds } },
          select: { id: true, displayName: true, objectKey: true },
        });
        const permittedIds = requester
          ? await filterAccessibleFileIds(requester, fileIds)
          : new Set<string>();

        // 3. Build ZIP
        // archiver v8 ships named format classes (ESM); the old
        // `archiver("zip", opts)` factory was removed. Use `new ZipArchive(opts)`.
        const { ZipArchive } = await import("archiver");
        const archive = new ZipArchive({ zlib: { level: 0 } });

        const { PassThrough } = await import("node:stream");
        const passThroughStream = new PassThrough();

        const { buildObjectKey, KeyPrefix, putObject } = await import("./lib/storage");
        const { key: newKey } = buildObjectKey({ prefix: KeyPrefix.archive });

        // Start upload
        const uploadPromise = putObject(newKey, passThroughStream);

        let manifest = "Bulk Download Manifest\n\n";
        const { createZipNamer } = await import("./lib/zip-names");
        const entryName = createZipNamer();

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
            archive.append(stream, { name: entryName(file.displayName) });
            manifest += `[INCLUDED] ${file.displayName}\n`;
          } catch (err: any) {
            manifest += `[EXCLUDED] ${file.displayName}: Storage error (${err.message})\n`;
          }
        }

        archive.append(manifest, { name: "manifest.txt" });
        await archive.finalize();

        // Wait for upload to complete
        await uploadPromise;

        const { notify } = await import("./lib/notify");
        await notify([userId], {
          type: "JOB",
          message: `Your ZIP archive of ${permittedIds.size} file(s) is ready to download from the jobs panel.`,
        }).catch(() => {});

        // The archive is streamed back through the app (auth-checked) rather
        // than a presigned storage URL: the storage endpoint is usually an
        // internal host the browser cannot reach.
        return {
          success: true,
          archiveKey: newKey,
          downloadUrl: `/api/jobs/${job.id}/download`,
        };
      }

      case "THUMBNAIL": {
        const { fileId } = job.payload as { fileId: string };
        const { generateThumbnail } = await import("./lib/thumbnails");
        return await generateThumbnail(fileId);
      }

      case "TTL_EXPIRY": {
        const report = await runMaintenance();
        return { success: true, ...report };
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
