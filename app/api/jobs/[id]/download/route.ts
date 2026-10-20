import { Readable } from "node:stream";
import { type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-context";
import { getJobStatus } from "@/lib/jobs";
import { getObjectStream, statObject } from "@/lib/storage";
import { toApiError, statusFor } from "@/lib/result";

export const runtime = "nodejs";

/**
 * GET /api/jobs/[id]/download
 *
 * Streams the ZIP produced by a completed BULK_ARCHIVE job. Only the user who
 * requested the archive (or a SUPERADMIN) may download it. Returns 404 for
 * missing, foreign, unfinished, or already-cleaned-up archives.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getCurrentUser();
    if (!session) return new Response(null, { status: 401 });

    const { id } = await params;
    const job = await getJobStatus(id);
    if (!job || job.type !== "BULK_ARCHIVE" || job.status !== "COMPLETED") {
      return new Response(null, { status: 404 });
    }

    const payload = job.payload as { userId?: string } | null;
    const isRequester = payload?.userId === session.user.id;
    if (!isRequester && session.user.role !== "SUPERADMIN") {
      return new Response(null, { status: 404 });
    }

    const result = job.result as { archiveKey?: string } | null;
    if (!result?.archiveKey) return new Response(null, { status: 404 });

    const stat = await statObject(result.archiveKey).catch(() => null);
    if (!stat) return new Response(null, { status: 404 });

    const stream = await getObjectStream(result.archiveKey);
    const filename = `archive-${job.createdAt.toISOString().slice(0, 10)}.zip`;

    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(stat.size),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return Response.json(toApiError(err), { status: statusFor(err) });
  }
}
