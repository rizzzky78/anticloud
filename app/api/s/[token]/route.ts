import { Readable } from "node:stream";
import { type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getObjectStream } from "@/lib/storage";
import { safeContentHeaders } from "@/lib/content-headers";
import {
  consumeShareDownload,
  isUnlocked,
  resolveShareLink,
  unlockCookieName,
} from "@/lib/share-links";
import { toApiError, statusFor } from "@/lib/result";

export const runtime = "nodejs";

/**
 * GET /api/s/[token]
 *
 * Serve the file behind a public share link. No session required — the token
 * is the credential, checked against revocation, expiry, download cap, the
 * password unlock cookie, and the file's live state on every request.
 *
 *   ?preview=1   inline preview for the landing page (not counted)
 *   (default)    download — counted against `maxDownloads`
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const state = await resolveShareLink(token);
    if (!state.ok) {
      return new Response(null, { status: state.reason === "not_found" ? 404 : 410 });
    }
    const { link } = state;

    const cookieStore = await cookies();
    if (!isUnlocked(link, cookieStore.get(unlockCookieName(link.id))?.value)) {
      return new Response(null, { status: 401 });
    }

    const isPreview = request.nextUrl.searchParams.get("preview") === "1";
    if (!isPreview) {
      if (!(await consumeShareDownload(link))) return new Response(null, { status: 410 });

      const { recordAudit } = await import("@/lib/audit");
      await recordAudit({
        actorId: null,
        action: "share_link.download",
        targetType: "file",
        targetId: link.fileId,
        metadata: { linkId: link.id },
      });
    }

    const stream = await getObjectStream(link.file.objectKey);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: {
        ...safeContentHeaders(link.file.mimeType, link.file.displayName, {
          forceDownload: !isPreview,
        }),
        "Content-Length": link.file.size.toString(),
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (err) {
    return Response.json(toApiError(err), { status: statusFor(err) });
  }
}
