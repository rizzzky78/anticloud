import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { Client, type ItemBucketMetadata, type BucketItemStat } from "minio";
import { env } from "@/lib/env";

/**
 * MinIO storage client — the ONLY module that talks to MinIO.
 *
 * Rule: no other file constructs or parses MinIO object keys. Application code
 * passes internal UUIDs + metadata; `buildObjectKey()` owns the mapping from
 * those values to a physical object key, and the helpers below are the only
 * surface the rest of the app uses to read/write binary content.
 */
const globalForStorage = globalThis as unknown as {
  minio: Client | undefined;
};

function createClient(): Client {
  // The minio SDK is plain-S3, so this same client talks to a local MinIO
  // server OR a cloud provider (R2 / AWS S3 / B2). `region` and `pathStyle` are
  // only forwarded when set — for local MinIO they stay unset and the SDK uses
  // its sensible defaults; for cloud storage they come from the environment.
  return new Client({
    endPoint: env.MINIO_ENDPOINT,
    port: env.MINIO_PORT,
    useSSL: env.MINIO_USE_SSL,
    accessKey: env.MINIO_ACCESS_KEY,
    secretKey: env.MINIO_SECRET_KEY,
    ...(env.MINIO_REGION ? { region: env.MINIO_REGION } : {}),
    ...(env.MINIO_PATH_STYLE !== undefined
      ? { pathStyle: env.MINIO_PATH_STYLE }
      : {}),
  });
}

/** Singleton MinIO client (hot-reload safe). */
export const storage: Client = globalForStorage.minio ?? createClient();

if (env.NODE_ENV !== "production") {
  globalForStorage.minio = storage;
}

/** The single bucket all objects live in. */
export const BUCKET = env.MINIO_BUCKET;

/**
 * Logical prefixes for the flat object namespace. Kept here so key construction
 * stays centralized; later phases pass a prefix instead of building paths.
 */
export const KeyPrefix = {
  file: "files",
  derived: "derived",
  archive: "archives",
} as const;

export type KeyPrefix = (typeof KeyPrefix)[keyof typeof KeyPrefix];

/**
 * Map an internal id + prefix to a physical object key. The key is deliberately
 * unrelated to any user-visible name (names live in Postgres). Objects are laid
 * out as `<prefix>/<yyyy>/<mm>/<dd>/<uuid>` for operational manageability.
 *
 * @param input.id    internal UUID; generated if omitted (returned to the caller
 *                     should be stored alongside the key in Postgres).
 * @param input.prefix logical namespace; defaults to `files`.
 * @param input.date  bucketing date; defaults to now.
 */
export function buildObjectKey(input: {
  id?: string;
  prefix?: KeyPrefix;
  date?: Date;
} = {}): { key: string; id: string } {
  const id = input.id ?? randomUUID();
  const prefix = input.prefix ?? KeyPrefix.file;
  const d = input.date ?? new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return { key: `${prefix}/${yyyy}/${mm}/${dd}/${id}`, id };
}

/** Ensure the configured bucket exists; create it if missing. Call on boot. */
export async function ensureBucket(): Promise<void> {
  const exists = await storage.bucketExists(BUCKET);
  if (!exists) {
    await storage.makeBucket(BUCKET);
  }
}

/** Stream/buffer an object into storage. Returns the etag/version info. */
export function putObject(
  key: string,
  body: Readable | Buffer | string,
  size?: number,
  metaData?: ItemBucketMetadata,
) {
  return storage.putObject(BUCKET, key, body, size, metaData);
}

/** Open a readable stream for an object's binary content. */
export function getObjectStream(key: string): Promise<Readable> {
  return storage.getObject(BUCKET, key);
}

/**
 * Open a readable stream for a byte range of an object. Used to satisfy HTTP
 * `Range` requests so media players can seek without downloading the whole file.
 *
 * @param offset zero-based start byte (inclusive).
 * @param length number of bytes to read; omit/0 to read to the end of the object.
 */
export function getPartialObjectStream(
  key: string,
  offset: number,
  length?: number,
): Promise<Readable> {
  return storage.getPartialObject(BUCKET, key, offset, length ?? 0);
}

/** Remove an object. */
export function removeObject(key: string): Promise<void> {
  return storage.removeObject(BUCKET, key);
}

/** Fetch object metadata (size, etag, lastModified) without the body. */
export function statObject(key: string): Promise<BucketItemStat> {
  return storage.statObject(BUCKET, key);
}

/** Generate a presigned GET URL valid for `ttlSeconds`. */
export function presignedGetUrl(key: string, ttlSeconds: number): Promise<string> {
  return storage.presignedGetObject(BUCKET, key, ttlSeconds);
}

/**
 * Put an object in MinIO then run a callback (e.g. a DB write). If the
 * callback throws, the just-written object is removed so no orphan remains.
 * The original error is always re-thrown.
 */
export async function putObjectCompensated(
  key: string,
  body: Readable | Buffer | string,
  size: number | undefined,
  metadata: ItemBucketMetadata | undefined,
  afterPut: () => Promise<void>,
): Promise<void> {
  await putObject(key, body, size, metadata);
  try {
    await afterPut();
  } catch (err) {
    await removeObject(key).catch(() => {});
    throw err;
  }
}
