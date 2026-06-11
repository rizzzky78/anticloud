import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-context";
import { AppError } from "@/lib/result";
import { db } from "@/lib/db";
import { getPermittedFiles } from "@/lib/permissions";
import { getObjectStream } from "@/lib/storage";
import * as archiver from "archiver";
import { enqueueJob } from "@/lib/jobs";

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

    // We will build a stream of a ZIP file directly back to the client
    const archiverFactory = require("archiver");
    const archive = archiverFactory("zip", { zlib: { level: 0 } }) as archiver.Archiver; // store without compression or level 1 for speed

    // We can use a TransformStream to bridge archiver (Node stream) to Web Stream API for NextResponse
    const { readable, writable } = new TransformStream();

    // Create an adapter to write from Node to Web Stream
    const writer = writable.getWriter();

    archive.on("data", (chunk: any) => writer.write(chunk));
    archive.on("end", () => writer.close());
    archive.on("error", (err: Error) => {
      console.error("Archive error:", err);
      writer.abort(err);
    });

    let manifest = "Bulk Download Manifest\n\n";

    // Build the archive asynchronously
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

      // Append manifest
      archive.append(manifest, { name: "manifest.txt" });

      // Finalize the archive
      archive.finalize();
    })();

    // Return the response as a downloadable attachment
    return new NextResponse(readable, {
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
