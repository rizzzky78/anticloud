import { db } from '../lib/db';
import { queueThumbnail } from '../lib/thumbnails';
import { redis } from '../lib/redis';

/**
 * Queue THUMBNAIL jobs for existing image files that have no thumbnail yet
 * (files uploaded before plan/phase-18). Safe to run repeatedly.
 */
async function main() {
  let cursor: string | undefined;
  let queued = 0;

  for (;;) {
    const batch = await db.file.findMany({
      where: { deletedAt: null, thumbnailKey: null, mimeType: { startsWith: 'image/' } },
      select: { id: true, mimeType: true, size: true },
      orderBy: { id: 'asc' },
      take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (batch.length === 0) break;

    for (const file of batch) {
      await queueThumbnail(file);
      queued++;
    }
    cursor = batch[batch.length - 1].id;
  }

  console.log(`Queued thumbnail generation for up to ${queued} image file(s).`);
}

main()
  .catch((err) => {
    console.error('Thumbnail backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
    redis.disconnect();
  });
