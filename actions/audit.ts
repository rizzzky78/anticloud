"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-context";
import { AppError } from "@/lib/result";

const auditQuerySchema = z.object({
  actorQuery: z.string().optional(),
  targetId: z.string().optional(),
  action: z.string().optional(),
  startDate: z.string().optional(), // ISO string
  endDate: z.string().optional(),   // ISO string
  page: z.number().int().default(1),
  limit: z.number().int().default(25),
});

export type AuditQueryInput = z.infer<typeof auditQuerySchema>;

/**
 * Fetch audit logs. Restricted strictly to SUPERADMIN.
 * Composes filters into a single query.
 */
export async function getAuditLogs(payload: unknown) {
  const session = await getCurrentUser();
  if (!session || session.user.role !== "SUPERADMIN") {
    throw AppError.forbidden("Superadmin access required");
  }

  const parsed = auditQuerySchema.parse(payload ?? {});
  const { actorQuery, targetId, action, startDate, endDate, page, limit } = parsed;

  const where: any = {};

  // Action filter
  if (action && action !== "all") {
    where.action = action;
  }

  // Target ID filter
  if (targetId) {
    where.targetId = targetId;
  }

  // Date range filter
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) {
      where.createdAt.gte = new Date(startDate);
    }
    if (endDate) {
      // Set to end of day if it's just a date
      const end = new Date(endDate);
      where.createdAt.lte = end;
    }
  }

  // Actor search (by name, email, or username)
  if (actorQuery) {
    where.actor = {
      OR: [
        { name: { contains: actorQuery, mode: "insensitive" } },
        { email: { contains: actorQuery, mode: "insensitive" } },
        { username: { contains: actorQuery, mode: "insensitive" } },
      ],
    };
  }

  const offset = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true,
            image: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip: offset,
      take: limit,
    }),
    db.auditLog.count({ where }),
  ]);

  // Extract unique actions for filters in the UI
  const actionTypes = await db.auditLog.groupBy({
    by: ["action"],
    _count: {
      action: true,
    },
  });

  return {
    logs: logs.map((log) => ({
      ...log,
      createdAt: log.createdAt.toISOString(),
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    actionTypes: actionTypes.map((a) => a.action),
  };
}
