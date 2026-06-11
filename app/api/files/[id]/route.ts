import { Readable } from "node:stream";
import { type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { getObjectStream } from "@/lib/storage";
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
 * GET /api/files/[id]
 *
 * Streams the file binary from MinIO. Returns 404 for both non-existent files
 * and permission failures to prevent existence enumeration.
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

    const minioStream = await getObjectStream(file.objectKey);
    const webStream = Readable.toWeb(minioStream) as ReadableStream;

    // Phase-10 stub: record download audit entry here once audit module ships.

    return new Response(webStream, {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": file.size.toString(),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.displayName)}`,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (err) {
    return Response.json(toApiError(err), { status: statusFor(err) });
  }
}
