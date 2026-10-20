import { type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { buildObjectKey, KeyPrefix, putObject, removeObjects } from "@/lib/storage";
import { checkRateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { toApiError, statusFor } from "@/lib/result";

export const runtime = "nodejs";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ACCEPTED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]);

function json(code: string, message: string, status: number) {
  return Response.json({ code, message }, { status });
}

/**
 * POST /api/account/avatar — upload a profile picture (raw image body).
 * The image is re-encoded to a 256×256 WebP (strips metadata and any
 * embedded payload) before it is stored.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentUser();
    if (!session) return json("UNAUTHORIZED", "Authentication required", 401);

    const limit = await checkRateLimit(`avatar:${session.user.id}`, 10, 600);
    if (!limit.allowed) return json("RATE_LIMITED", "Too many avatar changes", 429);

    const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!ACCEPTED.has(type)) return json("BAD_REQUEST", "Use a PNG, JPEG, WebP, GIF or AVIF image", 400);

    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > MAX_AVATAR_BYTES) return json("BAD_REQUEST", "Image must be 5 MB or smaller", 400);

    const body = Buffer.from(await request.arrayBuffer());
    if (body.length === 0) return json("BAD_REQUEST", "Image is empty", 400);
    if (body.length > MAX_AVATAR_BYTES) return json("BAD_REQUEST", "Image must be 5 MB or smaller", 400);

    const { default: sharp } = await import("sharp");
    let avatar: Buffer;
    try {
      avatar = await sharp(body, { failOn: "error", limitInputPixels: 50_000_000, animated: false })
        .rotate()
        .resize(256, 256, { fit: "cover" })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      return json("BAD_REQUEST", "That file is not a valid image", 400);
    }

    const { key } = buildObjectKey({ prefix: KeyPrefix.avatar });
    await putObject(key, avatar, avatar.length, { "Content-Type": "image/webp" });

    const previous = await db.user.findUnique({
      where: { id: session.user.id },
      select: { avatarKey: true },
    });
    const image = `/api/avatars/${session.user.id}?v=${Date.now()}`;
    await db.user.update({
      where: { id: session.user.id },
      data: { avatarKey: key, image },
    });
    if (previous?.avatarKey) await removeObjects([previous.avatarKey]).catch(() => {});

    await recordAudit({ actorId: session.user.id, action: "account.avatar_update", targetType: "user", targetId: session.user.id });
    return Response.json({ image });
  } catch (err) {
    if (statusFor(err) >= 500) console.error("[avatar] Upload failed:", err);
    return Response.json(toApiError(err), { status: statusFor(err) });
  }
}

/** DELETE /api/account/avatar — remove the profile picture. */
export async function DELETE() {
  try {
    const session = await getCurrentUser();
    if (!session) return json("UNAUTHORIZED", "Authentication required", 401);

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { avatarKey: true },
    });
    await db.user.update({
      where: { id: session.user.id },
      data: { avatarKey: null, image: null },
    });
    if (user?.avatarKey) await removeObjects([user.avatarKey]).catch(() => {});

    await recordAudit({ actorId: session.user.id, action: "account.avatar_remove", targetType: "user", targetId: session.user.id });
    return new Response(null, { status: 204 });
  } catch (err) {
    return Response.json(toApiError(err), { status: statusFor(err) });
  }
}
