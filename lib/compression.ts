import { createGzip } from 'node:zlib';
import { getObjectStream, putObjectCompensated, buildObjectKey, statObject, KeyPrefix } from './storage';
import { db } from './db';

/**
 * Handle a COMPRESSION job.
 * Downloads the file, compresses via gzip, uploads as a derived file.
 */
export async function compressFile(jobId: string, fileId: string): Promise<{ derivedFileId: string }> {
  const originalFile = await db.file.findUnique({ where: { id: fileId } });
  if (!originalFile) throw new Error("Original file not found");

  // Prevent double compression or compressing something that's already compressed
  // In a full implementation, we'd check mimeType or extensions.
  if (originalFile.mimeType === "application/gzip") {
    throw new Error("File is already compressed");
  }

  const { key: newKey, id: newFileId } = buildObjectKey({ prefix: KeyPrefix.derived });
  
  // 1. Get readable stream
  const readStream = await getObjectStream(originalFile.objectKey);
  
  // 2. Create compression stream
  const gzip = createGzip();
  
  // 3. Pipe to compress
  const compressedStream = readStream.pipe(gzip);

  const newDisplayName = `${originalFile.displayName}.gz`;
  const newMimeType = "application/gzip";

  // We don't know the exact size of the compressed stream ahead of time,
  // MinIO `putObject` can take an unknown size stream but it buffers in memory or needs chunked transfer.
  // In production we would pipe to disk first or use a pass-through stream if MinIO handles chunked.
  
  await putObjectCompensated(
    newKey,
    compressedStream,
    undefined, // unknown size
    { "Content-Type": newMimeType },
    async () => {
      // Create derived file record in DB
      // We must get the size of the newly uploaded object
      const stat = await statObject(newKey);

      await db.file.create({
        data: {
          id: newFileId,
          ownerId: originalFile.ownerId,
          displayName: newDisplayName,
          folderPath: originalFile.folderPath,
          objectKey: newKey,
          mimeType: newMimeType,
          size: BigInt(stat.size),
          visibility: originalFile.visibility,
          guestAccess: originalFile.guestAccess,
          isReadOnly: true, // Derived files shouldn't be edited directly
          derivedFromId: originalFile.id,
        }
      });
    }
  );

  return { derivedFileId: newFileId };
}
