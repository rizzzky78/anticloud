import { Readable } from "node:stream";
import { type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { getObjectStream } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * GET /api/avatars/[userId] — a user's profile picture, visible to any
 * signed-in user (intranet directory). The URL carries a version query
 * (`?v=`) so responses can be cached aggressively.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const session = await getCurrentUser().catch(() => null);
  if (!session) return new Response(null, { status: 401 });

  const { userId } = await params;
  const user = await db.user.findUnique({ where: { id: userId }, select: { avatarKey: true } });
  if (!user?.avatarKey) return new Response(null, { status: 404 });

  const stream = await getObjectStream(user.avatarKey).catch(() => null);
  if (!stream) return new Response(null, { status: 404 });

  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cache-Control": "private, max-age=86400, immutable",
    },
  });
}
