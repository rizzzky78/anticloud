import { Readable } from "node:stream";
import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getObjectStream } from "@/lib/storage";
import { toApiError, statusFor } from "@/lib/result";

export const runtime = "nodejs";

/**
 * GET /api/files/p/[token]
 *
 * Token-validated permanent URL. No authentication required — the token IS the
 * credential. However, the token is NOT a pure capability: the file's current
 * permission state is validated on every request.
 *
 * Returns 404 when any of the following are true:
 *   • Token does not match any file's `permanentUrlToken`.
 *   • File is soft-deleted.
 *   • File has expired (`expiresAt` is in the past).
 *   • File visibility is PRIVATE (changing visibility invalidates the URL).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    const file = await db.file.findFirst({
      where: {
        permanentUrlToken: token,
        deletedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });

    if (!file) return new Response(null, { status: 404 });

    // Permanent URLs are public-only. Revoking public access makes the URL stop
    // serving even if the token itself has not changed.
    if (file.visibility !== "PUBLIC") return new Response(null, { status: 404 });

    // Phase-10 stub: audit("file.permanent_url_serve", file.id)

    const minioStream = await getObjectStream(file.objectKey);
    const webStream = Readable.toWeb(minioStream) as ReadableStream;

    return new Response(webStream, {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": file.size.toString(),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.displayName)}`,
        // Safe to cache briefly — CDN/proxy revalidation is fine for public content.
        "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    return Response.json(toApiError(err), { status: statusFor(err) });
  }
}
