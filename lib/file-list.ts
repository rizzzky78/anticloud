import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

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
    WHEN f.created_at >= date_trunc('day', NOW())
      THEN 'today'
    WHEN f.created_at >= date_trunc('day', NOW()) - INTERVAL '1 day'
      THEN 'yesterday'
    WHEN f.created_at >= date_trunc('week', NOW())
      THEN 'this_week'
    WHEN f.created_at >= date_trunc('month', NOW())
      THEN 'this_month'
    ELSE to_char(date_trunc('month', f.created_at), 'YYYY-MM')
  END
`;

/** Filters out files that have passed their TTL. Phase-09 cron does the actual cleanup. */
const EXPIRY_FILTER = Prisma.sql`AND (f.expires_at IS NULL OR f.expires_at > NOW())`;

const SELECT_COLS = Prisma.sql`
  f.id,
  f.owner_id,
  f.display_name,
  f.mime_type,
  f.size,
  f.visibility,
  f.folder_path,
  f.guest_access,
  f.is_read_only,
  f.created_at,
  f.updated_at,
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
    ? Prisma.sql`AND f.folder_path = ${options.folderPath}`
    : Prisma.sql``;

  // ── Unauthenticated: public + guest-enabled only ──────────────────────────
  if (!user) {
    const rows = await db.$queryRaw<RawFileRow[]>`
      SELECT ${SELECT_COLS}
      FROM "file" f
      WHERE f.deleted_at IS NULL
        ${EXPIRY_FILTER}
        AND f.visibility = 'PUBLIC'
        AND f.guest_access = true
        ${folderFilter}
      ORDER BY f.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;
    return groupRows(rows);
  }

  // ── SUPERADMIN: all non-deleted files ─────────────────────────────────────
  if (user.role === "SUPERADMIN") {
    const rows = await db.$queryRaw<RawFileRow[]>`
      SELECT ${SELECT_COLS}
      FROM "file" f
      WHERE f.deleted_at IS NULL
        ${EXPIRY_FILTER}
        ${folderFilter}
      ORDER BY f.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;
    return groupRows(rows);
  }

  // ── ADMIN: own + public + grants + unowned-private ────────────────────────
  if (user.role === "ADMIN") {
    const rows = await db.$queryRaw<RawFileRow[]>`
      SELECT ${SELECT_COLS}
      FROM "file" f
      WHERE f.deleted_at IS NULL
        ${EXPIRY_FILTER}
        AND (
          f.owner_id = ${user.id}
          OR f.visibility = 'PUBLIC'
          OR EXISTS (
            SELECT 1 FROM file_permission fp
            WHERE fp.file_id = f.id AND fp.user_id = ${user.id}
          )
          OR (f.owner_id IS NULL AND f.visibility = 'PRIVATE')
        )
        ${folderFilter}
      ORDER BY f.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;
    return groupRows(rows);
  }

  // ── Regular user (VIEWER / GUEST): own + public + grants ─────────────────
  const rows = await db.$queryRaw<RawFileRow[]>`
    SELECT ${SELECT_COLS}
    FROM "file" f
    WHERE f.deleted_at IS NULL
      ${EXPIRY_FILTER}
      AND (
        f.owner_id = ${user.id}
        OR f.visibility = 'PUBLIC'
        OR EXISTS (
          SELECT 1 FROM file_permission fp
          WHERE fp.file_id = f.id AND fp.user_id = ${user.id}
        )
      )
      ${folderFilter}
    ORDER BY f.created_at DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `;
  return groupRows(rows);
}
