import { Readable } from "node:stream";
import { type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { getObjectStream, getPartialObjectStream } from "@/lib/storage";
import { toApiError, statusFor } from "@/lib/result";

export const runtime = "nodejs";

type Session = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** Inline permission check — replaced by phase-02 middleware once that ships. */
async function resolveReadAccess(
  session: Session | null,
  fileId: string,
): Promise<{
  file: Awaited<ReturnType<typeof db.file.findFirst>>;
  allowed: boolean;
}> {
  const file = await db.file.findFirst({
    where: {
      id: fileId,
      deletedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });

  if (!file) return { file: null, allowed: false };

  if (!session) {
    return { file, allowed: file.visibility === "PUBLIC" && file.guestAccess };
  }

  const role = session.user.role as string | undefined;

  if (role === "SUPERADMIN") return { file, allowed: true };
  if (file.ownerId === session.user.id) return { file, allowed: true };

  const grant = await db.filePermission.findUnique({
    where: { fileId_userId: { fileId, userId: session.user.id } },
    select: { role: true },
  });
  if (grant) return { file, allowed: true };

  if (file.visibility === "PUBLIC") return { file, allowed: true };

  // Unowned private files: ADMINs can access (phase-04 §4.5).
  if (file.ownerId === null && file.visibility === "PRIVATE") {
    return { file, allowed: role === "ADMIN" };
  }

  return { file, allowed: false };
}

/**
 * Parse a single-range HTTP `Range` header against a known object size.
 * Supports `bytes=start-end`, `bytes=start-`, and `bytes=-suffixLength`.
 * Returns clamped, inclusive byte bounds, or `null` when there is no usable
 * range (absent header, malformed, multi-range, or unsatisfiable).
 */
function parseRangeHeader(
  header: string | null,
  size: number,
): { start: number; end: number } | null {
  if (!header || size <= 0) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;

  let start: number;
  let end: number;

  if (rawStart === "") {
    // Suffix range: last N bytes.
    const suffix = Number(rawEnd);
    if (suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Number(rawEnd);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= size) return null;

  return { start, end: Math.min(end, size - 1) };
}

/**
 * GET /api/files/[id]
 *
 * Streams the file binary from MinIO. Returns 404 for both non-existent files
 * and permission failures to prevent existence enumeration. Honors HTTP `Range`
 * requests (206) so audio/video players can seek.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // getCurrentUser is safe to call in unauthenticated contexts; it returns
    // null rather than throwing when no session is present.
    const session = await getCurrentUser().catch(() => null);

    const { file, allowed } = await resolveReadAccess(session, id);

    if (!file || !allowed) {
      return new Response(null, { status: 404 });
    }

    const totalSize = Number(file.size);
    const range = parseRangeHeader(request.headers.get("range"), totalSize);

    // Thumbnail/preview requests from file lists. These fire once per visible
    // row, so they must not be audited (would flood the trail) and should be
    // browser-cacheable rather than revalidated on every scroll/back-nav.
    const isPreview = request.nextUrl.searchParams.get("preview") === "1";

    // Record one audit entry per view. Media players issue many follow-up Range
    // requests while seeking; only the initial request (full body, or a range
    // starting at byte 0) is logged so the audit trail isn't flooded.
    if (!isPreview && (!range || range.start === 0)) {
      const { recordAudit } = await import("@/lib/audit");
      await recordAudit({
        actorId: session?.user?.id || null,
        action: "file.download",
        targetType: "file",
        targetId: file.id,
        metadata: { displayName: file.displayName },
      });
    }

    const commonHeaders: Record<string, string> = {
      "Content-Type": file.mimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.displayName)}`,
      "Cache-Control": "private, no-cache",
      // Advertise range support so players (Safari especially) enable seeking.
      "Accept-Ranges": "bytes",
    };

    // Partial content — stream just the requested byte window for media seeking.
    if (range) {
      const chunkLength = range.end - range.start + 1;
      const partial = await getPartialObjectStream(
        file.objectKey,
        range.start,
        chunkLength,
      );
      const partialStream = Readable.toWeb(partial) as ReadableStream;
      return new Response(partialStream, {
        status: 206,
        headers: {
          ...commonHeaders,
          "Content-Length": chunkLength.toString(),
          "Content-Range": `bytes ${range.start}-${range.end}/${totalSize}`,
        },
      });
    }

    const minioStream = await getObjectStream(file.objectKey);
    const webStream = Readable.toWeb(minioStream) as ReadableStream;

    return new Response(webStream, {
      status: 200,
      headers: {
        ...commonHeaders,
        "Content-Length": totalSize.toString(),
      },
    });
  } catch (err) {
    return Response.json(toApiError(err), { status: statusFor(err) });
  }
}
