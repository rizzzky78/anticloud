import { type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-context";
import { subscribeToUser } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

/**
 * GET /api/notifications/stream
 *
 * Server-Sent Events stream of the signed-in user's new notifications
 * (plan/phase-21). Events: `notification` (JSON payload). A comment heartbeat
 * keeps idle connections open through proxies. Clients reconnect
 * automatically (EventSource) and re-sync the unread count on `open`.
 */
export async function GET(request: NextRequest) {
  const session = await getCurrentUser().catch(() => null);
  if (!session) return new Response(null, { status: 401 });

  const userId = session.user.id;
  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          stop();
        }
      };

      const unsubscribe = subscribeToUser(userId, (payload) => {
        send(`event: notification\ndata: ${payload}\n\n`);
      });
      const heartbeat = setInterval(() => send(`: ping\n\n`), HEARTBEAT_MS);

      function stop() {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      }
      cleanup = stop;

      request.signal.addEventListener("abort", stop);
      // Tell the client how long to wait before reconnecting, then confirm.
      send(`retry: 5000\nevent: ready\ndata: {}\n\n`);
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
