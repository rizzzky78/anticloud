import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { ShareLink, File } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Public share links (plan/phase-14).
 *
 * A link is a bearer token for ONE file. It is validated against the link's
 * own limits (revoked, expiry, download cap) and the file's live state on
 * every request. Password-protected links require an unlock cookie: an HMAC
 * over the link id + password hash, so changing the password or revoking the
 * link invalidates every outstanding unlock.
 */

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 32;
export const UNLOCK_COOKIE_MAX_AGE = 12 * 60 * 60; // 12 hours

/** URL-safe, unguessable token (192 bits). */
export function generateShareToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function hashSharePassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt:${salt.toString("base64url")}:${hash.toString("base64url")}`;
}

export async function verifySharePassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split(":");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64url");
  const actual = await scryptAsync(password, Buffer.from(saltB64, "base64url"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function unlockCookieName(linkId: string): string {
  return `ac_share_${linkId}`;
}

export function unlockCookieValue(link: Pick<ShareLink, "id" | "passwordHash">): string {
  return createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`share-unlock:${link.id}:${link.passwordHash ?? ""}`)
    .digest("base64url");
}

export function isUnlocked(
  link: Pick<ShareLink, "id" | "passwordHash">,
  cookieValue: string | undefined,
): boolean {
  if (!link.passwordHash) return true;
  if (!cookieValue) return false;
  const expected = Buffer.from(unlockCookieValue(link));
  const actual = Buffer.from(cookieValue);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export type ShareLinkState =
  | { ok: true; link: ShareLink & { file: File; createdBy: { name: string } | null } }
  | { ok: false; reason: "not_found" | "revoked" | "expired" | "exhausted" };

/**
 * Resolve a token to a usable link + file, or the reason it cannot be used.
 * Mention-restricted, deleted, and expired files never resolve.
 */
export async function resolveShareLink(token: string): Promise<ShareLinkState> {
  if (!token || token.length > 128) return { ok: false, reason: "not_found" };

  const link = await db.shareLink.findUnique({
    where: { token },
    include: { file: true, createdBy: { select: { name: true } } },
  });
  if (!link) return { ok: false, reason: "not_found" };

  const now = Date.now();
  const file = link.file;
  if (
    file.deletedAt ||
    (file.expiresAt && file.expiresAt.getTime() <= now) ||
    file.isMentionRestricted
  ) {
    return { ok: false, reason: "not_found" };
  }
  if (link.revokedAt) return { ok: false, reason: "revoked" };
  if (link.expiresAt && link.expiresAt.getTime() <= now) return { ok: false, reason: "expired" };
  if (link.maxDownloads !== null && link.downloadCount >= link.maxDownloads) {
    return { ok: false, reason: "exhausted" };
  }
  return { ok: true, link };
}

/**
 * Atomically count one download, honoring the cap under concurrency.
 * Returns false when the cap was reached by a concurrent request.
 */
export async function consumeShareDownload(link: Pick<ShareLink, "id" | "maxDownloads">) {
  const result = await db.shareLink.updateMany({
    where: {
      id: link.id,
      revokedAt: null,
      ...(link.maxDownloads !== null ? { downloadCount: { lt: link.maxDownloads } } : {}),
    },
    data: { downloadCount: { increment: 1 }, lastAccessAt: new Date() },
  });
  return result.count === 1;
}
