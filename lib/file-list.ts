import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { accessibleFilesSql } from "@/lib/permissions";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BucketKey =
  | "today"
  | "yesterday"
  | "this_week"
  | "this_month"
  | string; // YYYY-MM for older months

export interface FileListEntry {
  id: string;
  ownerId: string | null;
  displayName: string;
  mimeType: string;
  /** Serialised BigInt string. */
  size: string;
  visibility: string;
  folderPath: string;
  guestAccess: boolean;
  isReadOnly: boolean;
  isMentionRestricted: boolean;
  createdAt: string;
  updatedAt: string;
  bucket: BucketKey;
}

export interface FileBucket {
  key: BucketKey;
  /** Human-readable label for the UI, e.g. "This Week" or "March 2024". */
  label: string;
  files: FileListEntry[];
}

export interface ListOptions {
  /** Restrict to a specific virtual folder path. */
  folderPath?: string;
  /** Max files per page (default 50). */
  pageSize?: number;
  /** Rows to skip (default 0). */
  offset?: number;
}

// ─── Raw DB row returned by $queryRaw ─────────────────────────────────────────

interface RawFileRow {
  id: string;
  owner_id: string | null;
  display_name: string;
  mime_type: string;
  size: bigint;
  visibility: string;
  folder_path: string;
  guest_access: boolean;
  is_read_only: boolean;
  is_mention_restricted: boolean;
  created_at: Date;
  updated_at: Date;
  bucket: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bucketLabel(key: string): string {
  switch (key) {
    case "today":      return "Today";
    case "yesterday":  return "Yesterday";
    case "this_week":  return "This Week";
    case "this_month": return "This Month";
    default: {
      const [year, month] = key.split("-");
      if (!year || !month) return key;
      const d = new Date(Number(year), Number(month) - 1, 1);
      return d.toLocaleDateString("en-US", { year: "numeric", month: "long" });
    }
  }
}

/**
 * The date-bucketing CASE expression used in every query variant.
 * Returns 'today' | 'yesterday' | 'this_week' | 'this_month' | 'YYYY-MM'.
 * Bucketing happens server-side in Postgres (date_trunc) so the client
 * receives a pre-grouped shape without re-computing dates.
 */
const BUCKET_EXPR = Prisma.sql`
  CASE
    WHEN f."createdAt" >= date_trunc('day', NOW())
      THEN 'today'
    WHEN f."createdAt" >= date_trunc('day', NOW()) - INTERVAL '1 day'
      THEN 'yesterday'
    WHEN f."createdAt" >= date_trunc('week', NOW())
      THEN 'this_week'
    WHEN f."createdAt" >= date_trunc('month', NOW())
      THEN 'this_month'
    ELSE to_char(date_trunc('month', f."createdAt"), 'YYYY-MM')
  END
`;

const SELECT_COLS = Prisma.sql`
  f.id,
  f."ownerId"             AS owner_id,
  f."displayName"         AS display_name,
  f."mimeType"            AS mime_type,
  f.size,
  f.visibility,
  f."folderPath"          AS folder_path,
  f."guestAccess"         AS guest_access,
  f."isReadOnly"          AS is_read_only,
  f."isMentionRestricted" AS is_mention_restricted,
  f."createdAt"           AS created_at,
  f."updatedAt"           AS updated_at,
  ${BUCKET_EXPR} AS bucket
`;

function groupRows(rows: RawFileRow[]): FileBucket[] {
  const map = new Map<string, FileListEntry[]>();
  const order: string[] = [];

  for (const r of rows) {
    if (!map.has(r.bucket)) {
      map.set(r.bucket, []);
      order.push(r.bucket);
    }
    map.get(r.bucket)!.push({
      id: r.id,
      ownerId: r.owner_id,
      displayName: r.display_name,
      mimeType: r.mime_type,
      size: r.size.toString(),
      visibility: r.visibility,
      folderPath: r.folder_path,
      guestAccess: r.guest_access,
      isReadOnly: r.is_read_only,
      isMentionRestricted: r.is_mention_restricted,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
      bucket: r.bucket,
    });
  }

  return order.map((key) => ({
    key,
    label: bucketLabel(key),
    files: map.get(key)!,
  }));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Return files grouped by date bucket, scoped strictly to what `user` may see.
 *
 * Visibility rules applied in SQL:
 *  - Unauthenticated  → PUBLIC + guestAccess only.
 *  - SUPERADMIN       → all non-deleted files.
 *  - ADMIN            → own + PUBLIC + explicit grants + unowned-private.
 *  - Regular user     → own + PUBLIC + explicit grants.
 *
 * The date bucketing CASE expression runs in Postgres so the response already
 * carries the grouped shape; no client-side recompute needed.
 */
export async function listFilesGrouped(
  user: { id: string; role: string } | null,
  options: ListOptions = {},
): Promise<FileBucket[]> {
  const { pageSize = 50, offset = 0 } = options;
  const folderFilter = options.folderPath != null
    ? Prisma.sql`AND f."folderPath" = ${options.folderPath}`
    : Prisma.sql``;

  // ── Unauthenticated: public + guest-enabled only ──────────────────────────
  const rows = await db.$queryRaw<RawFileRow[]>`
    SELECT ${SELECT_COLS}
    FROM "file" f
    WHERE ${accessibleFilesSql(user)}
      ${folderFilter}
    ORDER BY f."createdAt" DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `;
  return groupRows(rows);
}

// ─── Recycle bin (user-scoped soft-deleted files) ─────────────────────────────

/** Grace window before phase-09 cron hard-deletes a soft-deleted file. */
const GRACE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface DeletedFileEntry {
  id: string;
  displayName: string;
  mimeType: string;
  /** Serialised BigInt string. */
  size: string;
  folderPath: string;
  deletedAt: string;
}

/**
 * List the soft-deleted files the given user may restore — files they own or
 * hold an ADMIN/SUPERADMIN grant on — still inside the 30-day grace window.
 * This is the user-facing recycle bin (distinct from the SUPERADMIN admin bin,
 * which lists every deleted file).
 */
export async function listDeletedFilesForUser(
  user: { id: string; role: string },
): Promise<DeletedFileEntry[]> {
  const graceCutoff = new Date(Date.now() - GRACE_WINDOW_MS);

  const files = await db.file.findMany({
    where: {
      deletedAt: { not: null, gt: graceCutoff },
      OR: [
        { ownerId: user.id },
        {
          permissions: {
            some: {
              userId: user.id,
              role: { in: ["ADMIN", "SUPERADMIN"] },
            },
          },
        },
      ],
    },
    orderBy: { deletedAt: "desc" },
  });

  return files.map((f) => ({
    id: f.id,
    displayName: f.displayName,
    mimeType: f.mimeType,
    size: f.size.toString(),
    folderPath: f.folderPath,
    deletedAt: f.deletedAt!.toISOString(),
  }));
}

export function getImmediateSubfolders(currentPath: string, allPaths: string[]): string[] {
  const normalizedCurrent = currentPath.endsWith("/") ? currentPath : currentPath + "/";
  const subfolders = new Set<string>();

  for (const path of allPaths) {
    if (path === currentPath) continue;
    if (path.startsWith(normalizedCurrent)) {
      const relative = path.slice(normalizedCurrent.length);
      const firstSegment = relative.split("/")[0];
      if (firstSegment) {
        subfolders.add(normalizedCurrent + firstSegment);
      }
    }
  }

  return Array.from(subfolders);
}

export async function listUserFolderPaths(
  user: { id: string; role: string } | null,
): Promise<string[]> {
  const rows = await db.$queryRaw<{ folder_path: string }[]>`
    SELECT DISTINCT f."folderPath" AS folder_path
    FROM "file" f
    WHERE ${accessibleFilesSql(user)}
  `;
  const paths = new Set(rows.map((r) => r.folder_path));
  if (user) {
    for (const path of await listVisibleFolderRows(user)) paths.add(path);
  }
  return Array.from(paths);
}

/**
 * Folder entities (plan/phase-16) the user can see even when they hold no
 * visible files: folders they own or that sit inside a folder they own or
 * that is shared with them (directly or via a group). Superadmins see all.
 */
async function listVisibleFolderRows(user: { id: string; role: string }): Promise<string[]> {
  if (user.role === "SUPERADMIN") {
    const all = await db.folder.findMany({ select: { path: true } });
    return all.map((f) => f.path);
  }
  const rows = await db.$queryRaw<{ path: string }[]>`
    SELECT fo.path FROM folder fo
    WHERE EXISTS (
      SELECT 1 FROM folder anc
      WHERE (fo.path = anc.path OR starts_with(fo.path, anc.path || '/'))
        AND (
          anc."ownerId" = ${user.id}
          OR EXISTS (
            SELECT 1 FROM folder_permission fop
            WHERE fop."folderId" = anc.id
              AND (fop."expiresAt" IS NULL OR fop."expiresAt" > NOW())
              AND (
                fop."userId" = ${user.id}
                OR fop."groupId" IN (SELECT gm."groupId" FROM group_member gm WHERE gm."userId" = ${user.id})
              )
          )
        )
    )
  `;
  return rows.map((r) => r.path);
}

export async function listSubfolders(
  user: { id: string; role: string } | null,
  currentPath: string,
): Promise<string[]> {
  const allPaths = await listUserFolderPaths(user);
  return getImmediateSubfolders(currentPath, allPaths);
}

