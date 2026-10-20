import { db } from "./db";
import { enqueueJob } from "./jobs";
import { buildObjectKey, getObjectStream, KeyPrefix, putObject, removeObjects } from "./storage";

/**
 * Thumbnails (plan/phase-18).
 *
 * The worker renders a small WebP preview for raster images so file lists do
 * not download full-size originals for every visible row. Other types keep
 * their icon (or the browser's own video first-frame poster).
 */

/** Raster formats sharp decodes safely. SVG is excluded (untrusted XML). */
const THUMBNAIL_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/tiff",
  "image/bmp",
  "image/heic",
  "image/heif",
]);

/** Originals larger than this are not decoded (memory guard). */
const MAX_SOURCE_BYTES = 80 * 1024 * 1024;
const THUMB_SIZE = 320;

export function supportsThumbnail(mimeType: string, size: bigint | number): boolean {
  const t = mimeType.split(";")[0].trim().toLowerCase();
  return THUMBNAIL_TYPES.has(t) && Number(size) <= MAX_SOURCE_BYTES;
}

/** Queue thumbnail generation for a file when its type supports it. */
export async function queueThumbnail(file: { id: string; mimeType: string; size: bigint }) {
  if (!supportsThumbnail(file.mimeType, file.size)) return;
  await enqueueJob({ type: "THUMBNAIL", payload: { fileId: file.id }, maxAttempts: 2 });
}

async function readAll(objectKey: string, limit: number): Promise<Buffer> {
  const stream = await getObjectStream(objectKey);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > limit) {
      stream.destroy();
      throw new Error("Source image too large for a thumbnail");
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

/**
 * THUMBNAIL job handler: render the current content of a file to a WebP
 * thumbnail and swap it in. If the content changed while rendering, the new
 * thumbnail is discarded (a fresh job was queued by that change).
 */
export async function generateThumbnail(fileId: string): Promise<{ thumbnailKey: string | null }> {
  const file = await db.file.findUnique({
    where: { id: fileId },
    select: { id: true, objectKey: true, mimeType: true, size: true, thumbnailKey: true, deletedAt: true },
  });
  if (!file || file.deletedAt) return { thumbnailKey: null };

  if (!supportsThumbnail(file.mimeType, file.size)) {
    // Content changed to a type without previews: drop a stale thumbnail.
    if (file.thumbnailKey) {
      await db.file.update({ where: { id: file.id }, data: { thumbnailKey: null } });
      await removeObjects([file.thumbnailKey]).catch(() => {});
    }
    return { thumbnailKey: null };
  }

  const { default: sharp } = await import("sharp");
  const source = await readAll(file.objectKey, MAX_SOURCE_BYTES);
  const thumb = await sharp(source, { failOn: "error", limitInputPixels: 100_000_000, animated: false })
    .rotate()
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 72 })
    .toBuffer();

  const { key } = buildObjectKey({ prefix: KeyPrefix.thumbnail });
  await putObject(key, thumb, thumb.length, { "Content-Type": "image/webp" });

  // Only attach if the file still has the content we rendered.
  const updated = await db.file.updateMany({
    where: { id: file.id, objectKey: file.objectKey },
    data: { thumbnailKey: key },
  });
  if (updated.count !== 1) {
    await removeObjects([key]).catch(() => {});
    return { thumbnailKey: null };
  }
  if (file.thumbnailKey) await removeObjects([file.thumbnailKey]).catch(() => {});
  return { thumbnailKey: key };
}
