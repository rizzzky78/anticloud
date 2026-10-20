"use server";

import { z } from "zod";
import { cookies, headers } from "next/headers";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getCurrentUser } from "@/lib/auth-context";
import { AppError } from "@/lib/result";
import { requireAccess } from "@/lib/permissions";
import { assertWriteAccess } from "@/lib/file-access";
import { checkRateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import {
  generateShareToken,
  hashSharePassword,
  resolveShareLink,
  unlockCookieName,
  unlockCookieValue,
  verifySharePassword,
  UNLOCK_COOKIE_MAX_AGE,
} from "@/lib/share-links";

const MAX_ACTIVE_LINKS_PER_FILE = 20;

export interface ShareLinkItem {
  id: string;
  url: string;
  label: string | null;
  expiresAt: string | null;
  hasPassword: boolean;
  maxDownloads: number | null;
  downloadCount: number;
  revokedAt: string | null;
  lastAccessAt: string | null;
  createdAt: string;
  createdBy: string | null;
}

function shareUrl(token: string): string {
  return `${env.APP_URL.replace(/\/$/, "")}/s/${token}`;
}

/** Share links of a file (managers only), newest first. */
export async function listShareLinks(payload: unknown): Promise<ShareLinkItem[]> {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const { fileId } = z.object({ fileId: z.string().min(1) }).parse(payload);
  await requireAccess({ id: session.user.id, role: session.user.role as Role }, fileId, "ADMIN");

  const links = await db.shareLink.findMany({
    where: { fileId },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true } } },
  });
  return links.map((l) => ({
    id: l.id,
    url: shareUrl(l.token),
    label: l.label,
    expiresAt: l.expiresAt?.toISOString() ?? null,
    hasPassword: !!l.passwordHash,
    maxDownloads: l.maxDownloads,
    downloadCount: l.downloadCount,
    revokedAt: l.revokedAt?.toISOString() ?? null,
    lastAccessAt: l.lastAccessAt?.toISOString() ?? null,
    createdAt: l.createdAt.toISOString(),
    createdBy: l.createdBy?.name ?? null,
  }));
}

const createSchema = z.object({
  fileId: z.string().min(1),
  label: z.string().trim().max(80).optional().transform((v) => v || null),
  expiresAt: z.iso
    .datetime()
    .nullable()
    .optional()
    .refine((v) => v == null || new Date(v).getTime() > Date.now(), {
      message: "Expiry must be in the future",
    }),
  password: z
    .string()
    .max(128)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null))
    .refine((v) => v === null || v.length >= 4, {
      message: "Password must be at least 4 characters",
    }),
  maxDownloads: z.number().int().min(1).max(100_000).nullable().optional(),
});

/** Create a public share link for a file (managers only). */
export async function createShareLink(payload: unknown): Promise<ShareLinkItem> {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const input = createSchema.parse(payload);
  const file = await assertWriteAccess(session.user, input.fileId);
  if (file.isMentionRestricted) {
    throw AppError.badRequest("Mention-restricted files cannot be shared by link");
  }

  const active = await db.shareLink.count({
    where: {
      fileId: file.id,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
  if (active >= MAX_ACTIVE_LINKS_PER_FILE) {
    throw AppError.badRequest(`A file can have at most ${MAX_ACTIVE_LINKS_PER_FILE} active links`);
  }

  const link = await db.shareLink.create({
    data: {
      fileId: file.id,
      token: generateShareToken(),
      label: input.label,
      createdById: session.user.id,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      passwordHash: input.password ? await hashSharePassword(input.password) : null,
      maxDownloads: input.maxDownloads ?? null,
    },
  });

  await recordAudit({
    actorId: session.user.id,
    action: "share_link.create",
    targetType: "file",
    targetId: file.id,
    metadata: {
      linkId: link.id,
      expiresAt: link.expiresAt?.toISOString() ?? null,
      passwordProtected: !!link.passwordHash,
      maxDownloads: link.maxDownloads,
    },
  });

  return {
    id: link.id,
    url: shareUrl(link.token),
    label: link.label,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    hasPassword: !!link.passwordHash,
    maxDownloads: link.maxDownloads,
    downloadCount: 0,
    revokedAt: null,
    lastAccessAt: null,
    createdAt: link.createdAt.toISOString(),
    createdBy: session.user.name,
  };
}

/** Revoke a share link immediately (managers of the file only). */
export async function revokeShareLink(payload: unknown) {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const { linkId } = z.object({ linkId: z.string().min(1) }).parse(payload);
  const link = await db.shareLink.findUnique({
    where: { id: linkId },
    select: { id: true, fileId: true, revokedAt: true },
  });
  if (!link) throw AppError.notFound("Link not found");
  await requireAccess(
    { id: session.user.id, role: session.user.role as Role },
    link.fileId,
    "ADMIN",
  );

  if (!link.revokedAt) {
    await db.shareLink.update({ where: { id: link.id }, data: { revokedAt: new Date() } });
    await recordAudit({
      actorId: session.user.id,
      action: "share_link.revoke",
      targetType: "file",
      targetId: link.fileId,
      metadata: { linkId: link.id },
    });
  }
  return { linkId: link.id };
}

/**
 * Unlock a password-protected share link for this browser. Public (no session
 * needed); rate-limited per link and client IP against password guessing.
 */
export async function unlockShareLink(payload: unknown): Promise<{ ok: boolean; message?: string }> {
  const { token, password } = z
    .object({ token: z.string().min(1).max(128), password: z.string().min(1).max(128) })
    .parse(payload);

  const reqHeaders = await headers();
  const ip =
    reqHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    reqHeaders.get("x-real-ip") ||
    "unknown";
  const limit = await checkRateLimit(`share-unlock:${token}:${ip}`, 10, 300);
  if (!limit.allowed) {
    return { ok: false, message: "Too many attempts. Try again in a few minutes." };
  }

  const state = await resolveShareLink(token);
  if (!state.ok || !state.link.passwordHash) {
    return { ok: false, message: "This link is not available." };
  }

  const valid = await verifySharePassword(password, state.link.passwordHash);
  if (!valid) return { ok: false, message: "Incorrect password." };

  const cookieStore = await cookies();
  cookieStore.set(unlockCookieName(state.link.id), unlockCookieValue(state.link), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.APP_URL.startsWith("https://"),
    path: "/",
    maxAge: UNLOCK_COOKIE_MAX_AGE,
  });
  return { ok: true };
}
