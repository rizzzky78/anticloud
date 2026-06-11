import { Readable } from "node:stream";
import { type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { putObject } from "@/lib/storage";
import { del } from "@/lib/cache";
import { redisKey, NS } from "@/lib/redis";
import { toApiError, statusFor } from "@/lib/result";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * PUT /api/files/[id]/replace
 *
 * Replace the binary content of an existing file. Updates size and MIME type
 * in the DB. Rejects with 423 if the file is read-only (superadmin bypasses).
 *
 * This is the ONLY path that writes a new binary for an existing file key;
 * all other metadata operations in phase-04 never touch MinIO.
 *
 * Required headers:
 *   Content-Length — byte size of the replacement body
 *
 * Optional headers:
 *   Content-Type  — new MIME type (defaults to current file MIME type)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const session = await getCurrentUser();
    if (!session) {
      return Response.json(
        { code: "UNAUTHORIZED", message: "Authentication required" },
        { status: 401 },
      );
    }

    const file = await db.file.findFirst({ where: { id, deletedAt: null } });
    if (!file) {
      return Response.json({ code: "NOT_FOUND", message: "Not found" }, { status: 404 });
    }

    const userRole = session.user.role as string | undefined;
    const isSuperadmin = userRole === "SUPERADMIN";

    // Write access: owner, superadmin, or explicit ADMIN/SUPERADMIN grant.
    const grant = await db.filePermission.findUnique({
      where: { fileId_userId: { fileId: id, userId: session.user.id } },
      select: { role: true },
    });

    const hasWrite =
      isSuperadmin ||
      file.ownerId === session.user.id ||
      grant?.role === "SUPERADMIN" ||
      grant?.role === "ADMIN";

    if (!hasWrite) {
      // Return 404 to avoid confirming file existence to unauthorized callers.
      return Response.json({ code: "NOT_FOUND", message: "Not found" }, { status: 404 });
    }

    if (file.isReadOnly && !isSuperadmin) {
      return Response.json(
        { code: "READ_ONLY", message: "This file is read-only" },
        { status: 423 },
      );
    }

    const contentLengthRaw = request.headers.get("content-length");
    const size = contentLengthRaw ? parseInt(contentLengthRaw, 10) : NaN;
    if (!Number.isFinite(size) || size <= 0) {
      return Response.json(
        { code: "BAD_REQUEST", message: "Content-Length header is required" },
        { status: 400 },
      );
    }
    if (size > MAX_UPLOAD_BYTES) {
      return Response.json(
        { code: "BAD_REQUEST", message: "File exceeds the 2 GiB upload limit" },
        { status: 400 },
      );
    }

    const body = request.body;
    if (!body) {
      return Response.json(
        { code: "BAD_REQUEST", message: "Request body is empty" },
        { status: 400 },
      );
    }

    const newMimeType = request.headers.get("content-type") ?? file.mimeType;
    const nodeStream = Readable.fromWeb(
      body as Parameters<typeof Readable.fromWeb>[0],
    );

    await putObject(file.objectKey, nodeStream, size, { "Content-Type": newMimeType });

    await db.file.update({
      where: { id },
      data: { mimeType: newMimeType, size: BigInt(size) },
    });

    // Bust filemeta and perm caches for this file.
    await del(
      redisKey(NS.filemeta, id),
      redisKey(NS.perm, session.user.id, id),
    );

    const { recordAudit } = await import("@/lib/audit");
    await recordAudit({
      actorId: session.user.id,
      action: "file.replace",
      targetType: "file",
      targetId: id,
      metadata: { mimeType: newMimeType, size: size.toString() },
    });

    return Response.json({ id });
  } catch (err) {
    return Response.json(toApiError(err), { status: statusFor(err) });
  }
}
