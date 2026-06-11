import { type Visibility } from "@prisma/client";
import { db } from "@/lib/db";
import { getJSON, setJSON, del } from "@/lib/cache";
import { redisKey, NS } from "@/lib/redis";

const FILEMETA_TTL = 60 * 5; // 5 minutes

/**
 * Serialisable snapshot of a file row. `size` is a string because BigInt
 * cannot round-trip through JSON.stringify / JSON.parse.
 */
export interface FileMetaRecord {
  id: string;
  ownerId: string | null;
  displayName: string;
  objectKey: string;
  mimeType: string;
  /** Serialised BigInt — convert back with BigInt(record.size). */
  size: string;
  visibility: Visibility;
  folderPath: string;
  guestAccess: boolean;
  isReadOnly: boolean;
  isMentionRestricted: boolean;
  permanentUrlToken: string | null;
  expiresAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Return a file's metadata, preferring the Redis cache over the DB.
 * Returns null when the file does not exist or is soft-deleted.
 */
export async function getFileMeta(fileId: string): Promise<FileMetaRecord | null> {
  const key = redisKey(NS.filemeta, fileId);

  const cached = await getJSON<FileMetaRecord>(key);
  if (cached) return cached;

  const file = await db.file.findFirst({
    where: {
      id: fileId,
      deletedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
  if (!file) return null;

  const record: FileMetaRecord = {
    id: file.id,
    ownerId: file.ownerId,
    displayName: file.displayName,
    objectKey: file.objectKey,
    mimeType: file.mimeType,
    size: file.size.toString(),
    visibility: file.visibility,
    folderPath: file.folderPath,
    guestAccess: file.guestAccess,
    isReadOnly: file.isReadOnly,
    isMentionRestricted: file.isMentionRestricted,
    permanentUrlToken: file.permanentUrlToken,
    expiresAt: file.expiresAt?.toISOString() ?? null,
    deletedAt: file.deletedAt?.toISOString() ?? null,
    createdAt: file.createdAt.toISOString(),
    updatedAt: file.updatedAt.toISOString(),
  };

  await setJSON(key, record, FILEMETA_TTL);
  return record;
}

/** Invalidate the cached record for one file. Call after any metadata write. */
export async function bustFileMeta(fileId: string): Promise<void> {
  await del(redisKey(NS.filemeta, fileId));
}
