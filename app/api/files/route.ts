import { type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-context";
import { listFilesGrouped } from "@/lib/file-list";
import { toApiError, statusFor } from "@/lib/result";

export const runtime = "nodejs";

const querySchema = z.object({
  folderPath: z.string().optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

/**
 * GET /api/files
 *
 * Returns files grouped by date bucket for the authenticated user.
 * Unauthenticated callers receive only PUBLIC + guestAccess files.
 *
 * Query params:
 *   folderPath — restrict to a virtual folder (optional)
 *   pageSize   — max items (default 50, max 200)
 *   offset     — pagination offset (default 0)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentUser().catch(() => null);
    const user = session ? { id: session.user.id, role: session.user.role as string } : null;

    const parsed = querySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    if (!parsed.success) {
      return Response.json(
        { code: "BAD_REQUEST", message: parsed.error.issues.map((i) => i.message).join("; ") },
        { status: 400 },
      );
    }

    const { folderPath, pageSize, offset } = parsed.data;

    const buckets = await listFilesGrouped(user, { folderPath, pageSize, offset });

    return Response.json({ buckets });
  } catch (err) {
    return Response.json(toApiError(err), { status: statusFor(err) });
  }
}
