import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-context";
import { AppError } from "@/lib/result";
import { db } from "@/lib/db";
import { getPermittedFiles } from "@/lib/permissions";
import { getObjectStream } from "@/lib/storage";
import { Readable } from "node:stream";
import * as archiver from "archiver";
import { enqueueJob } from "@/lib/jobs";

// Hard-depends on the Node runtime: node:stream (Readable.toWeb), archiver, and
// MinIO object streams are unavailable on the Edge runtime.
export const runtime = "nodejs";

const bulkDownloadSchema = z.object({
  fileIds: z.array(z.string().min(1)),
});

// Max files for sync stream; above this we trigger an async job
const MAX_SYNC_FILES = 50;

export async function POST(req: Request) {
  try {
    const session = await getCurrentUser();
    if (!session) throw AppError.unauthorized();

    const body = await req.json();
    const { fileIds } = bulkDownloadSchema.parse(body);

    if (fileIds.length === 0) {
      return NextResponse.json({ error: "No files selected" }, { status: 400 });
    }

    const { recordAudit } = await import("@/lib/audit");
    await recordAudit({
      actorId: session.user.id,
      action: "file.bulk_download",
      targetType: "bulk",
      targetId: null,
      metadata: { fileIdsCount: fileIds.length, async: fileIds.length > MAX_SYNC_FILES },
    });

    if (fileIds.length > MAX_SYNC_FILES) {
      // Phase 09 §9.4: Async bulk download
      const job = await enqueueJob({
        type: "BULK_ARCHIVE",
        payload: { fileIds, userId: session.user.id },
      });
      return NextResponse.json({
        async: true,
        jobId: job.id,
        message: "Archive job queued. Please poll status.",
      });
    }

    // Phase 09 §9.3: Sync stream bulk download
    // 1. Resolve permitted files
    const permitted = await getPermittedFiles(session.user.id);
    const permittedIds = new Set(permitted.map((f) => f.id));

    // 2. Fetch full file metadata
    const files = await db.file.findMany({
      where: { id: { in: fileIds } },
      select: { id: true, displayName: true, objectKey: true },
    });

    // We will build a stream of a ZIP file directly back to the client.
    const archiverFactory = require("archiver");
    // level 0 = store (no compression) for speed; stored blobs are usually
    // already-compressed media, so deflate would only burn CPU.
    const archive = archiverFactory("zip", {
      zlib: { level: 0 },
    }) as archiver.Archiver;

    // Per archiver docs, register warning/error handlers before finalize().
    // Warnings (e.g. ENOENT) are non-fatal; a genuine error must destroy the
    // stream so the client download fails fast instead of hanging on a
    // truncated archive.
    archive.on("warning", (err: any) => {
      if (err?.code === "ENOENT") {
        console.warn("Archive warning:", err);
      } else {
        console.error("Archive error (warning channel):", err);
        archive.destroy(err);
      }
    });
    archive.on("error", (err: Error) => {
      console.error("Archive error:", err);
      archive.destroy(err);
    });

    let manifest = "Bulk Download Manifest\n\n";

    // Append entries and finalize. archiver emits data as the client consumes
    // it; Readable.toWeb() below applies proper backpressure, so we must NOT
    // pump 'data' events into a writer manually (that ignored backpressure and
    // could close the stream before pending writes flushed, truncating the zip).
    (async () => {
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
          const stream = await getObjectStream(file.objectKey);
          archive.append(stream, { name: file.displayName });
          manifest += `[INCLUDED] ${file.displayName}\n`;
        } catch (err: any) {
          manifest += `[EXCLUDED] ${file.displayName}: Storage error (${err.message})\n`;
        }
      }

      // Append manifest, then finalize (no more entries after this).
      archive.append(manifest, { name: "manifest.txt" });
      await archive.finalize();
    })().catch((err) => {
      console.error("Archive build error:", err);
      archive.destroy(err);
    });

    // Bridge the archiver Node readable to a Web ReadableStream for NextResponse.
    const webStream = Readable.toWeb(archive) as unknown as ReadableStream<Uint8Array>;

    // Return the response as a downloadable attachment.
    return new NextResponse(webStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="archive.zip"',
      },
    });
  } catch (error: any) {
    console.error("Bulk download error:", error);
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status || 400 },
      );
    }
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
