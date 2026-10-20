import { Readable } from "node:stream";
import { type NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { buildObjectKey, putObject, removeObject } from "@/lib/storage";
import { getCachedAccess, hasMinimumLevel } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import { mimeTypeSchema } from "@/lib/paths";
import { replaceFileContent } from "@/lib/versions";
import { assertWithinQuota } from "@/lib/quota";
import { toApiError, statusFor } from "@/lib/result";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * PUT /api/files/[id]/replace
 *
 * Upload new content for an existing file. The new binary is written to a NEW
 * object key; the previous binary is kept as a `FileVersion` (plan/phase-13),
 * so a replace is always reversible. Rejects with 423 if the file is
 * read-only (superadmin bypasses).
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

    const userRole = session.user.role as Role;
    const level = await getCachedAccess({ id: session.user.id, role: userRole }, id);
    // Editors (and above) may upload new content; the old binary stays in history.
    if (!level || !hasMinimumLevel(level, "EDITOR")) {
      // Return 404 to avoid confirming file existence to unauthorized callers.
      return Response.json({ code: "NOT_FOUND", message: "Not found" }, { status: 404 });
    }

    if (file.isReadOnly && userRole !== "SUPERADMIN") {
      return Response.json(
        { code: "READ_ONLY", message: "This file is read-only" },
        { status: 423 },
      );
    }

    const limit = await checkRateLimit(`upload:${session.user.id}`, 20, 60);
    if (!limit.allowed) {
      return Response.json(
        { code: "RATE_LIMITED", message: "Too many uploads" },
        { status: 429, headers: { "Retry-After": String(limit.resetIn) } },
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

    // The previous content stays in history, so the full new size counts
    // against the file owner's quota.
    await assertWithinQuota(file.ownerId, BigInt(size));

    const mime = mimeTypeSchema.safeParse(request.headers.get("content-type") ?? file.mimeType);
    const newMimeType = mime.success ? mime.data : file.mimeType;

    const { key: newKey } = buildObjectKey();
    const nodeStream = Readable.fromWeb(
      body as Parameters<typeof Readable.fromWeb>[0],
    );
    await putObject(newKey, nodeStream, size, { "Content-Type": newMimeType });

    let version: number;
    try {
      ({ version } = await replaceFileContent({
        fileId: id,
        newObjectKey: newKey,
        mimeType: newMimeType,
        size: BigInt(size),
        actorId: session.user.id,
      }));
    } catch (err) {
      // Never leave an orphaned object behind when the DB swap fails.
      await removeObject(newKey).catch(() => {});
      throw err;
    }

    const { invalidateUserSearchCache } = await import("@/lib/search");
    await invalidateUserSearchCache();

    const { recordAudit } = await import("@/lib/audit");
    await recordAudit({
      actorId: session.user.id,
      action: "file.replace",
      targetType: "file",
      targetId: id,
      metadata: {
        mimeType: newMimeType,
        size: size.toString(),
        previousVersion: file.version,
        version,
      },
    });

    return Response.json({ id, version });
  } catch (err) {
    if (statusFor(err) >= 500) {
      console.error("[replace] Unexpected error during file replace:", err);
    }
    return Response.json(toApiError(err), { status: statusFor(err) });
  }
}
