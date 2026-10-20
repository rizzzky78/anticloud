import { Readable } from "node:stream";
import { type NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { getObjectStream } from "@/lib/storage";
import { getCachedAccess } from "@/lib/permissions";
import { safeContentHeaders } from "@/lib/content-headers";
import { toApiError, statusFor } from "@/lib/result";

export const runtime = "nodejs";

/**
 * GET /api/files/[id]/versions/[versionId]
 *
 * Streams a historical version of a file. Anyone who can read the live file
 * can read its history. Returns 404 for missing versions or denied access.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  try {
    const session = await getCurrentUser();
    if (!session) return new Response(null, { status: 404 });

    const { id, versionId } = await params;
    const version = await db.fileVersion.findFirst({
      where: { id: versionId, fileId: id, file: { deletedAt: null } },
      include: { file: { select: { displayName: true } } },
    });
    if (!version) return new Response(null, { status: 404 });

    const level = await getCachedAccess(
      { id: session.user.id, role: session.user.role as Role },
      id,
    );
    if (!level) return new Response(null, { status: 404 });

    const { recordAudit } = await import("@/lib/audit");
    await recordAudit({
      actorId: session.user.id,
      action: "file.version_download",
      targetType: "file",
      targetId: id,
      metadata: { version: version.version },
    });

    const filename = `v${version.version} - ${version.file.displayName}`;
    const stream = await getObjectStream(version.objectKey);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: {
        ...safeContentHeaders(version.mimeType, filename, {
          forceDownload: request.nextUrl.searchParams.get("download") === "1",
        }),
        "Content-Length": version.size.toString(),
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (err) {
    return Response.json(toApiError(err), { status: statusFor(err) });
  }
}
