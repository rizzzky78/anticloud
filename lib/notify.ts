import { db } from "@/lib/db";
import { redis } from "@/lib/redis";

/**
 * In-app notifications (plan/phase-21).
 *
 * Every notification is persisted, then announced on a per-user Redis channel
 * so open browser tabs update instantly through the SSE stream
 * (`/api/notifications/stream`). Publishing is best-effort: the row is the
 * source of truth and clients re-sync on reconnect.
 */

export type NotificationType =
  | "MENTION"
  | "SHARE"
  | "GROUP"
  | "FILE_UPDATE"
  | "NOTE"
  | "JOB";

export interface NotifyInput {
  type: NotificationType;
  message: string;
  fileId?: string | null;
}

export const NOTIFY_CHANNEL_PREFIX = "notify:";
const MAX_RECIPIENTS = 1000;

/** Persist and push one notification to each recipient (deduplicated). */
export async function notify(userIds: Iterable<string>, input: NotifyInput): Promise<void> {
  const recipients = Array.from(new Set(userIds)).slice(0, MAX_RECIPIENTS);
  if (recipients.length === 0) return;

  await db.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type: input.type,
      message: input.message.slice(0, 500),
      fileId: input.fileId ?? null,
    })),
  });

  const payload = JSON.stringify({ type: input.type, message: input.message, fileId: input.fileId ?? null });
  await Promise.all(
    recipients.map((userId) =>
      redis.publish(`${NOTIFY_CHANNEL_PREFIX}${userId}`, payload).catch(() => 0),
    ),
  );
}

/**
 * Tell a file's owner about something a collaborator did, unless the actor is
 * the owner. No-op for unowned files.
 */
export async function notifyFileOwner(
  fileId: string,
  actor: { id: string; name: string },
  type: NotificationType,
  describe: (displayName: string) => string,
): Promise<void> {
  const file = await db.file.findUnique({
    where: { id: fileId },
    select: { ownerId: true, displayName: true },
  });
  if (!file?.ownerId || file.ownerId === actor.id) return;
  await notify([file.ownerId], { type, fileId, message: describe(file.displayName) });
}
