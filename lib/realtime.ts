import type Redis from "ioredis";
import { redis } from "@/lib/redis";
import { NOTIFY_CHANNEL_PREFIX } from "@/lib/notify";

/**
 * Process-wide notification fan-out for SSE streams (plan/phase-21).
 *
 * One Redis subscriber connection per server process pattern-subscribes to
 * every user channel; open streams register a listener for their user. This
 * keeps Redis connections constant regardless of how many tabs are open.
 */

type Listener = (payload: string) => void;

const globalForRealtime = globalThis as unknown as {
  realtimeSubscriber: Redis | undefined;
  realtimeListeners: Map<string, Set<Listener>> | undefined;
};

const listeners: Map<string, Set<Listener>> =
  globalForRealtime.realtimeListeners ?? new Map();
globalForRealtime.realtimeListeners = listeners;

function ensureSubscriber(): Redis {
  if (globalForRealtime.realtimeSubscriber) return globalForRealtime.realtimeSubscriber;

  const sub = redis.duplicate();
  sub.on("pmessage", (_pattern: string, channel: string, message: string) => {
    const userId = channel.slice(NOTIFY_CHANNEL_PREFIX.length);
    const set = listeners.get(userId);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(message);
      } catch {
        // A broken stream must not affect other listeners.
      }
    }
  });
  sub.on("error", (err) => console.error("[realtime] subscriber error:", err));
  sub.psubscribe(`${NOTIFY_CHANNEL_PREFIX}*`).catch((err) =>
    console.error("[realtime] psubscribe failed:", err),
  );
  globalForRealtime.realtimeSubscriber = sub;
  return sub;
}

/** Register a listener for one user's notifications; returns an unsubscribe. */
export function subscribeToUser(userId: string, listener: Listener): () => void {
  ensureSubscriber();
  let set = listeners.get(userId);
  if (!set) {
    set = new Set();
    listeners.set(userId, set);
  }
  set.add(listener);

  return () => {
    const current = listeners.get(userId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listeners.delete(userId);
  };
}
