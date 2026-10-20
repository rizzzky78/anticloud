import { Prisma } from '@prisma/client';
import { db } from './db';
import { redis } from './redis';
import { getJSON, setJSON } from './cache';
import { accessibleFilesSql } from './permissions';
import { FileMetaRecord } from './file-meta';
import crypto from 'crypto';

export type SearchFilters = {
  tags?: string[];
  dateRange?: { start?: string; end?: string };
  uploaderId?: string;
  mimeType?: string;
};

/**
 * Search result row. Storage internals (`objectKey`) and capability tokens
 * (`permanentUrlToken`) are deliberately excluded — results reach every
 * viewer, not only file managers.
 */
export type SearchResult = Omit<FileMetaRecord, 'objectKey' | 'permanentUrlToken'> & {
  owner: { id: string; name: string; username: string | null } | null;
  tags: string[];
};

const SEARCH_EPOCH_KEY = 'search:epoch';
const SEARCH_TTL_SECONDS = 300;
const SEARCH_LIMIT = 50;

/**
 * Update the searchVector for a given file.
 * This should be called whenever a file, its tags, notes, or mentions are modified.
 */
export async function updateSearchVector(fileId: string): Promise<void> {
  await db.$executeRaw`
    UPDATE "file"
    SET "searchVector" =
      setweight(to_tsvector('english', coalesce("displayName", '')), 'A') ||
      setweight(to_tsvector('english', coalesce((
        SELECT string_agg(t.value, ' ') 
        FROM file_tag ft 
        JOIN tag t ON ft."tagId" = t.id 
        WHERE ft."fileId" = file.id
      ), '')), 'B') ||
      setweight(to_tsvector('english', coalesce((
        SELECT string_agg(u.username, ' ')
        FROM file_mention fm 
        JOIN "user" u ON fm."mentionedUserId" = u.id 
        WHERE fm."fileId" = file.id
      ), '')), 'C') ||
      setweight(to_tsvector('english', coalesce((
        SELECT body 
        FROM file_note fn 
        WHERE fn."fileId" = file.id 
        ORDER BY version DESC 
        LIMIT 1
      ), '')), 'D')
    WHERE id = ${fileId};
  `;
}

/**
 * Invalidate cached search results for everyone.
 *
 * Search results depend on other users' files and permissions, so per-user
 * invalidation leaves other users with stale results. Instead every cache key
 * embeds a global epoch; bumping it orphans all entries (they expire by TTL).
 * The `userId` argument is kept for call-site readability.
 */
export async function invalidateUserSearchCache(_userId?: string): Promise<void> {
  await redis.incr(SEARCH_EPOCH_KEY);
}

/**
 * Search files with full-text search, scoped by the central permission
 * predicate (`accessibleFilesSql`) and composed with optional filters.
 */
export async function searchFiles(
  user: { id: string; role: string },
  query: string,
  filters: SearchFilters = {},
): Promise<SearchResult[]> {
  const epoch = (await redis.get(SEARCH_EPOCH_KEY)) ?? '0';
  const queryHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ query, filters, role: user.role }))
    .digest('hex');
  const cacheKey = `search:${user.id}:${epoch}:${queryHash}`;
  const cached = await getJSON<SearchResult[]>(cacheKey);
  if (cached) return cached;

  const rawQuery = query.trim();
  const terms = rawQuery
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/^[#@]+/, '')) // drop tag/mention sigils
    .map((t) => t.replace(/[^\p{L}\p{N}_]+/gu, '')) // strip tsquery operators
    .filter(Boolean);
  const tsQuery = terms.map((t) => `${t}:*`).join(' & ');
  const ilikePattern = `%${rawQuery.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

  const conditions: Prisma.Sql[] = [accessibleFilesSql(user)];

  if (rawQuery) {
    conditions.push(
      tsQuery
        ? Prisma.sql`(f."searchVector" @@ to_tsquery('english', ${tsQuery}) OR f."displayName" ILIKE ${ilikePattern})`
        : Prisma.sql`f."displayName" ILIKE ${ilikePattern}`,
    );
  }
  if (filters.uploaderId) conditions.push(Prisma.sql`f."ownerId" = ${filters.uploaderId}`);
  if (filters.mimeType) conditions.push(Prisma.sql`f."mimeType" = ${filters.mimeType}`);
  if (filters.dateRange?.start) {
    conditions.push(Prisma.sql`f."createdAt" >= ${new Date(filters.dateRange.start)}`);
  }
  if (filters.dateRange?.end) {
    conditions.push(Prisma.sql`f."createdAt" <= ${new Date(filters.dateRange.end)}`);
  }
  for (const tag of filters.tags ?? []) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM file_tag ft JOIN tag t ON ft."tagId" = t.id
      WHERE ft."fileId" = f.id AND t.value = ${tag}
    )`);
  }

  const orderBy = rawQuery && tsQuery
    ? Prisma.sql`ORDER BY ts_rank(f."searchVector", to_tsquery('english', ${tsQuery})) DESC, f."createdAt" DESC`
    : Prisma.sql`ORDER BY f."createdAt" DESC`;

  const matches = await db.$queryRaw<{ id: string }[]>`
    SELECT f.id FROM "file" f
    WHERE ${Prisma.join(conditions, ' AND ')}
    ${orderBy}
    LIMIT ${SEARCH_LIMIT}
  `;
  const matchingIds = matches.map((r) => r.id);

  if (matchingIds.length === 0) {
    await setJSON(cacheKey, [], SEARCH_TTL_SECONDS);
    return [];
  }

  const rawFiles = await db.file.findMany({
    where: { id: { in: matchingIds } },
    include: {
      owner: { select: { id: true, name: true, username: true } },
      tags: { include: { tag: true } },
    },
  });
  rawFiles.sort((a, b) => matchingIds.indexOf(a.id) - matchingIds.indexOf(b.id));

  const results: SearchResult[] = rawFiles.map((file) => ({
    id: file.id,
    ownerId: file.ownerId,
    displayName: file.displayName,
    mimeType: file.mimeType,
    size: file.size.toString(),
    version: file.version,
    contentUpdatedAt: file.contentUpdatedAt.toISOString(),
    owner: file.owner,
    tags: file.tags.map((ft) => ft.tag.value),
    visibility: file.visibility,
    folderPath: file.folderPath,
    guestAccess: file.guestAccess,
    isReadOnly: file.isReadOnly,
    isMentionRestricted: file.isMentionRestricted,
    expiresAt: file.expiresAt ? file.expiresAt.toISOString() : null,
    deletedAt: file.deletedAt ? file.deletedAt.toISOString() : null,
    createdAt: file.createdAt.toISOString(),
    updatedAt: file.updatedAt.toISOString(),
  }));

  await setJSON(cacheKey, results, SEARCH_TTL_SECONDS);
  return results;
}
