"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-context";
import { AppError } from "@/lib/result";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const getNotificationsSchema = z.object({
  unreadOnly: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(), // cuid of last notification for cursor pagination
});

const markAsReadSchema = z.object({
  notificationId: z.string().min(1),
});

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Fetch notifications for the currently authenticated user.
 *
 * - Ordered newest first.
 * - Optionally filter to unread only (`readAt IS NULL`).
 * - Cursor-based pagination via `cursor` (last notification id seen).
 */
export async function getNotifications(
  payload?: Partial<z.infer<typeof getNotificationsSchema>>,
) {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const { unreadOnly, limit, cursor } = getNotificationsSchema.parse(payload ?? {});

  const notifications = await db.notification.findMany({
    where: {
      userId: session.user.id,
      ...(unreadOnly ? { readAt: null } : {}),
      ...(cursor ? { id: { lt: cursor } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      type: true,
      message: true,
      readAt: true,
      createdAt: true,
      file: {
        select: {
          id: true,
          displayName: true,
        },
      },
    },
  });

  const nextCursor =
    notifications.length === limit
      ? notifications[notifications.length - 1]?.id
      : undefined;

  return { notifications, nextCursor };
}

/**
 * Mark a single notification as read.
 *
 * Ownership is enforced — a user can only read their own notifications.
 */
export async function markAsRead(payload: z.infer<typeof markAsReadSchema>) {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const { notificationId } = markAsReadSchema.parse(payload);

  const notification = await db.notification.findUnique({
    where: { id: notificationId },
    select: { userId: true, readAt: true },
  });

  if (!notification) throw AppError.notFound("Notification not found");
  if (notification.userId !== session.user.id) throw AppError.forbidden();

  // Idempotent — if already read, skip the write.
  if (notification.readAt) return { success: true };

  await db.notification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
  });

  return { success: true };
}

/**
 * Mark ALL unread notifications for the current user as read.
 */
export async function markAllRead() {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  await db.notification.updateMany({
    where: {
      userId: session.user.id,
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  return { success: true };
}

/**
 * Count unread notifications for the current user (badge helper).
 */
export async function getUnreadCount(): Promise<number> {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  return db.notification.count({
    where: {
      userId: session.user.id,
      readAt: null,
    },
  });
}
