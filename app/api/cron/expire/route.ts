import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runMaintenance } from "@/lib/maintenance";

export const runtime = "nodejs";

/**
 * GET /api/cron/expire
 *
 * Manual / external trigger for the maintenance pass (TTL expiry, recycle-bin
 * purge, archive cleanup). The worker already runs the same pass on a
 * schedule; this route exists for deployments that prefer an external cron.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const report = await runMaintenance();
    return NextResponse.json({ success: true, ...report });
  } catch (error) {
    console.error("Cron maintenance error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
