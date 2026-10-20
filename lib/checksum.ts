import { createHash } from "node:crypto";
import { Transform, type Readable, pipeline } from "node:stream";

/**
 * Streaming SHA-256 (plan/phase-23). The hasher sits between the request body
 * and object storage, so content is hashed in a single pass without buffering.
 */
export interface HashingStream {
  /** Pass-through stream to hand to storage. */
  stream: Transform;
  /** Hex digest; valid once the stream has finished. */
  digest: () => string;
  /** Bytes that flowed through. */
  bytes: () => number;
}

export function hashStream(source: Readable): HashingStream {
  const hash = createHash("sha256");
  let count = 0;
  let digest: string | null = null;

  const stream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk);
      count += chunk.length;
      callback(null, chunk);
    },
    flush(callback) {
      digest = hash.digest("hex");
      callback();
    },
  });

  // `pipeline` propagates a source error into the hashing stream, so the
  // storage upload rejects instead of hanging on a truncated body.
  pipeline(source, stream, () => {});

  return {
    stream,
    digest: () => {
      if (digest === null) throw new Error("Hash not finalized: stream has not finished");
      return digest;
    },
    bytes: () => count,
  };
}

/** SHA-256 of an entire readable (used by the backfill script). */
export async function sha256OfStream(source: Readable): Promise<{ sha256: string; bytes: number }> {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of source) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    hash.update(buf);
    bytes += buf.length;
  }
  return { sha256: hash.digest("hex"), bytes };
}
