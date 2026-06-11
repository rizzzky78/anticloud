import { db } from "@/lib/db";

export interface AuditOptions {
  actorId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  ip?: string | null;
  metadata?: any;
}

/**
 * Record an immutable audit log entry.
 * Safely extracts actorId and IP from request context dynamically if not specified,
 * which prevents import crashes in non-Next.js contexts like worker.ts.
 */
export async function recordAudit(options: AuditOptions) {
  let finalActorId = options.actorId;
  let finalIp = options.ip;

  // Attempt to resolve actor ID dynamically from request headers/session if not supplied
  if (!finalActorId) {
    try {
      const { getCurrentUser } = await import("@/lib/auth-context");
      const session = await getCurrentUser();
      if (session?.user) {
        finalActorId = session.user.id;
      }
    } catch {
      // Safely ignore when run outside request context
    }
  }

  // Attempt to resolve request IP dynamically if not supplied
  if (!finalIp) {
    try {
      const { headers } = await import("next/headers");
      const reqHeaders = await headers();
      finalIp =
        reqHeaders.get("x-forwarded-for")?.split(",")[0] ||
        reqHeaders.get("x-real-ip") ||
        null;
    } catch {
      // Safely ignore when run outside request context
    }
  }

  return await db.auditLog.create({
    data: {
      actorId: finalActorId || null,
      action: options.action,
      targetType: options.targetType || null,
      targetId: options.targetId || null,
      ip: finalIp || null,
      metadata: options.metadata || {},
    },
  });
}
