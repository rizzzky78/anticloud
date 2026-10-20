import { db } from '../lib/db';
import { getObjectStream } from '../lib/storage';
import { sha256OfStream } from '../lib/checksum';

/**
 * Compute SHA-256 for files (and versions) stored before checksums existed
 * (plan/phase-23). Streams each object once; safe to stop and re-run.
 */
async function main() {
  let files = 0;
  let versions = 0;
  let failures = 0;

  for (;;) {
    const batch = await db.file.findMany({
      where: { sha256: null },
      select: { id: true, objectKey: true, size: true },
      take: 100,
    });
    if (batch.length === 0) break;

    for (const file of batch) {
      try {
        const { sha256, bytes } = await sha256OfStream(await getObjectStream(file.objectKey));
        if (BigInt(bytes) !== file.size) {
          console.warn(`Size mismatch for file ${file.id}: stored ${file.size}, object ${bytes}`);
        }
        // Only write if the content was not replaced meanwhile.
        await db.file.updateMany({
          where: { id: file.id, objectKey: file.objectKey },
          data: { sha256 },
        });
        files++;
      } catch (err) {
        failures++;
        console.error(`Failed to hash file ${file.id}:`, err);
        // Mark unreadable objects so the loop does not retry them forever.
        await db.file.updateMany({ where: { id: file.id, sha256: null }, data: { sha256: '' } });
      }
    }
  }

  for (;;) {
    const batch = await db.fileVersion.findMany({
      where: { sha256: null },
      select: { id: true, objectKey: true },
      take: 100,
    });
    if (batch.length === 0) break;

    for (const version of batch) {
      try {
        const { sha256 } = await sha256OfStream(await getObjectStream(version.objectKey));
        await db.fileVersion.update({ where: { id: version.id }, data: { sha256 } });
        versions++;
      } catch (err) {
        failures++;
        console.error(`Failed to hash version ${version.id}:`, err);
        await db.fileVersion.update({ where: { id: version.id }, data: { sha256: '' } });
      }
    }
  }

  console.log(`Hashed ${files} file(s) and ${versions} version(s); ${failures} failure(s).`);
}

main()
  .catch((err) => {
    console.error('Checksum backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
