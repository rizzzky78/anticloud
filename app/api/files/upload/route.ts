import { Readable } from "node:stream";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { buildObjectKey, putObjectCompensated } from "@/lib/storage";
import { checkRateLimit } from "@/lib/rate-limit";
import { AppError, toApiError, statusFor } from "@/lib/result";
import { displayNameSchema, folderPathSchema, mimeTypeSchema } from "@/lib/paths";
import { assertCanUpload } from "@/lib/folders";
import { assertWithinQuota } from "@/lib/quota";
import { hashStream } from "@/lib/checksum";
import { findDuplicates } from "@/lib/duplicates";
import type { Role } from "@prisma/client";

export const runtime = "nodejs";

// 2 GiB hard cap per request.
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

// Per-user upload rate limit; sized for folder uploads of many small files.
const UPLOAD_RATE_MAX = 300;
const UPLOAD_RATE_WINDOW = 60;

const metaSchema = z.object({
  displayName: displayNameSchema,
  mimeType: mimeTypeSchema,
  folderPath: folderPathSchema,
  visibility: z.enum(["PUBLIC", "PRIVATE"]).default("PRIVATE"),
  guestAccess: z.boolean().default(false),
  // Optional TTL: an ISO-8601 datetime in the future, or null for no expiry.
  expiresAt: z.iso
    .datetime()
    .nullable()
    .default(null)
    .refine((v) => v == null || new Date(v).getTime() > Date.now(), {
      message: "Expiration must be a future date",
    }),
});

/**
 * Header values cannot carry raw non-ASCII; clients send names URI-encoded.
 * Fall back to the raw value for clients that send plain ASCII.
 */
function decodeHeader(value: string | null): string | null {
  if (value == null) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * POST /api/files/upload
 *
 * Accept a raw binary stream (application/octet-stream or any mime type).
 * Metadata is carried in headers so the body is never buffered to disk.
 *
 * Required headers:
 *   Content-Length    — byte size of the body (required for streaming to MinIO)
 *   X-Display-Name   — user-visible filename
 *
 * Optional headers:
 *   Content-Type     — MIME type (defaults to application/octet-stream)
 *   X-Folder-Path    — virtual folder path (defaults to /)
 *   X-Visibility     — PUBLIC | PRIVATE (defaults to PRIVATE)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentUser();
    if (!session) {
      return Response.json(
        { code: "UNAUTHORIZED", message: "Authentication required" },
        { status: 401 },
      );
    }

    const limitResult = await checkRateLimit(
      `upload:${session.user.id}`,
      UPLOAD_RATE_MAX,
      UPLOAD_RATE_WINDOW,
    );
    if (!limitResult.allowed) {
      return Response.json(
        { code: "RATE_LIMITED", message: "Too many uploads" },
        { status: 429, headers: { "Retry-After": String(limitResult.resetIn) } },
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

    const parsed = metaSchema.safeParse({
      displayName: decodeHeader(request.headers.get("x-display-name")),
      mimeType: request.headers.get("content-type") ?? "application/octet-stream",
      folderPath: decodeHeader(request.headers.get("x-folder-path")) ?? "/",
      visibility: request.headers.get("x-visibility") ?? "PRIVATE",
      guestAccess: request.headers.get("x-guest-access") === "true",
      expiresAt: request.headers.get("x-expires-at") || null,
    });
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return Response.json({ code: "BAD_REQUEST", message: msg }, { status: 400 });
    }

    const body = request.body;
    if (!body) {
      return Response.json(
        { code: "BAD_REQUEST", message: "Request body is empty" },
        { status: 400 },
      );
    }

    const { key, id } = buildObjectKey();
    const { displayName, mimeType, folderPath, visibility, expiresAt } = parsed.data;

    // Reject before streaming anything when the uploader is out of space.
    await assertWithinQuota(session.user.id, BigInt(size));

    // Folders owned by someone else only accept uploads from editors+.
    await assertCanUpload(
      { id: session.user.id, role: session.user.role as Role },
      folderPath,
    );
    // Guest access only applies to PUBLIC files.
    const guestAccess = visibility === "PUBLIC" && parsed.data.guestAccess;

    // Convert Web ReadableStream → Node.js Readable so MinIO can consume it.
    // The stream is never written to disk; it flows directly to object storage.
    const nodeStream = Readable.fromWeb(
      body as Parameters<typeof Readable.fromWeb>[0],
    );

    // Hash while streaming: one pass, no buffering (plan/phase-23).
    const hashing = hashStream(nodeStream);
    let sha256 = "";

    await putObjectCompensated(
      key,
      hashing.stream,
      size,
      { "Content-Type": mimeType },
      async () => {
        // Integrity: the stored byte count must match the declared length.
        if (hashing.bytes() !== size) {
          throw AppError.badRequest("Upload was incomplete. Please try again.");
        }
        sha256 = hashing.digest();

        await db.file.create({
          data: {
            id,
            ownerId: session.user.id,
            contentUploadedById: session.user.id,
            displayName,
            objectKey: key,
            mimeType,
            size: BigInt(size),
            sha256,
            folderPath,
            visibility,
            guestAccess,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
          },
        });

        // Populate the FTS searchVector so the file is findable immediately.
        // Without this the column stays NULL until the file is later renamed/
        // tagged/noted, and search returns nothing for freshly uploaded files.
        const { updateSearchVector, invalidateUserSearchCache } = await import(
          "@/lib/search"
        );
        await updateSearchVector(id);
        await invalidateUserSearchCache(session.user.id);

        const { queueThumbnail } = await import("@/lib/thumbnails");
        await queueThumbnail({ id, mimeType, size: BigInt(size) }).catch((err) =>
          console.error(`[upload] Failed to queue thumbnail for ${id}:`, err),
        );

        const { recordAudit } = await import("@/lib/audit");
        await recordAudit({
          actorId: session.user.id,
          action: "file.upload",
          targetType: "file",
          targetId: id,
          metadata: {
            displayName,
            mimeType,
            size: size.toString(),
            folderPath,
            visibility,
            guestAccess,
            expiresAt,
          },
        });
      },
    );

    // Tell the uploader about identical files they can already see.
    const duplicates = await findDuplicates(
      { id: session.user.id, role: session.user.role as string },
      sha256,
      id,
      3,
    ).catch(() => []);

    return Response.json({ id, sha256, duplicates }, { status: 201 });
  } catch (err) {
    // AppErrors are expected/user-facing; anything else is an unexpected fault
    // (storage unreachable, bucket missing, DB constraint, …). Log those so the
    // real cause is visible instead of collapsing silently to a generic 500.
    if (statusFor(err) >= 500) {
      console.error("[upload] Unexpected error during file upload:", err);
    }
    return Response.json(toApiError(err), { status: statusFor(err) });
  }
}
