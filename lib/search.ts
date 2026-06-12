import { db } from './db';
import { redis, NS, redisKey } from './redis';
import { getJSON, setJSON } from './cache';
import { getPermittedFiles } from './permissions';
import { FileMetaRecord } from './file-meta';
import crypto from 'crypto';

export type SearchFilters = {
  tags?: string[];
  dateRange?: { start?: string; end?: string };
  uploaderId?: string;
  mimeType?: string;
};

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
 * Bust the search cache for a specific user.
 * This should be called whenever the user uploads, tags, deletes, or otherwise modifies a file.
 */
export async function invalidateUserSearchCache(userId: string): Promise<void> {
  // We use SCAN to find all search keys for this user and delete them.
  // In a high-throughput system, tracking keys via a Redis SET might be more efficient,
  // but SCAN is sufficient for this scope.
  const prefix = redisKey('search', userId, '*');
  let cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', prefix, 'COUNT', 100);
    cursor = nextCursor;
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } while (cursor !== '0');
}

/**
 * Search files with full-text search, respecting permissions and filters.
 */
export async function searchFiles(
  userId: string,
  query: string,
  filters: SearchFilters = {}
): Promise<FileMetaRecord[]> {
  // 1. Check Cache
  const queryHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ query, filters }))
    .digest('hex');
  
  const cacheKey = redisKey('search', userId, queryHash);
  const cached = await getJSON<FileMetaRecord[]>(cacheKey);
  if (cached) return cached;

  // 2. Resolve permissions
  const permittedFiles = await getPermittedFiles(userId);
  if (permittedFiles.length === 0) return []; // User can't see anything

  // Extract file IDs the user can see
  const permittedFileIds = permittedFiles.map((f) => f.id);

  // 3. Build Prisma Query
  // Since we are using advanced FTS and need to compose it with standard Prisma filters,
  // we can use a raw query or Prisma's filter capabilities.
  // We will use Prisma's `findMany` and pass the raw query for the tsvector part if a query exists.
  
  // Normalize the user query. We support free text plus `#tag` / `@mention`
  // sigils — the sigils are stripped here because their content is already
  // folded into the file's searchVector (tags = weight B, mentions = weight C),
  // and the `#`/`@` characters would otherwise break to_tsquery parsing.
  const rawQuery = query.trim();
  const terms = rawQuery
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/^[#@]+/, '')) // drop tag/mention sigils
    .map((t) => t.replace(/[^\p{L}\p{N}_]+/gu, '')) // strip tsquery operators
    .filter(Boolean);

  // Prefix-match every term (`war` → `war:*`) and AND them together, so a
  // multi-word query like "war takjil" matches files containing both prefixes.
  const tsQuery = terms.map((t) => `${t}:*`).join(' & ');

  // Escape LIKE wildcards in the raw query for the filename substring fallback.
  const ilikePattern = `%${rawQuery.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

  let rawFiles: any[];

  if (rawQuery) {
    // Text query → raw SQL (Prisma has no native tsvector support). We match on
    // either the FTS vector OR a filename substring, so partial/odd-tokenized
    // names still surface even when full-text tokenization misses them.
    const params: any[] = [permittedFileIds];
    const conditions: string[] = [
      `"id" = ANY($1::text[])`,
      `"deletedAt" IS NULL`,
      `("expiresAt" IS NULL OR "expiresAt" > NOW())`,
    ];
    let paramIndex = 2;

    const ilikeIndex = paramIndex++;
    params.push(ilikePattern);

    let tsIndex: number | null = null;
    if (tsQuery) {
      tsIndex = paramIndex++;
      params.push(tsQuery);
      conditions.push(
        `("searchVector" @@ to_tsquery('english', $${tsIndex}) OR "displayName" ILIKE $${ilikeIndex})`
      );
    } else {
      // Query was only sigils/punctuation — fall back to filename substring.
      conditions.push(`"displayName" ILIKE $${ilikeIndex}`);
    }

    if (filters.uploaderId) {
      conditions.push(`"ownerId" = $${paramIndex++}`);
      params.push(filters.uploaderId);
    }

    if (filters.mimeType) {
      conditions.push(`"mimeType" = $${paramIndex++}`);
      params.push(filters.mimeType);
    }

    if (filters.dateRange?.start) {
      conditions.push(`"createdAt" >= $${paramIndex++}::timestamp`);
      params.push(filters.dateRange.start);
    }

    if (filters.dateRange?.end) {
      conditions.push(`"createdAt" <= $${paramIndex++}::timestamp`);
      params.push(filters.dateRange.end);
    }

    if (filters.tags && filters.tags.length > 0) {
      for (const tag of filters.tags) {
        conditions.push(`EXISTS (
          SELECT 1 FROM file_tag ft
          JOIN tag t ON ft."tagId" = t.id
          WHERE ft."fileId" = "file".id AND t.value = $${paramIndex++}
        )`);
        params.push(tag);
      }
    }

    let baseSql = `SELECT id FROM "file" WHERE ${conditions.join(' AND ')}`;
    baseSql += tsIndex
      ? ` ORDER BY ts_rank("searchVector", to_tsquery('english', $${tsIndex})) DESC, "createdAt" DESC LIMIT 50`
      : ` ORDER BY "createdAt" DESC LIMIT 50`;

    const result = await db.$queryRawUnsafe<{ id: string }[]>(baseSql, ...params);
    const matchingIds = result.map((r) => r.id);

    if (matchingIds.length === 0) {
      await setJSON(cacheKey, [], 300); // 5 min cache
      return [];
    }

    // Fetch full data using Prisma to ensure we get exactly what FileMetaRecord expects
    rawFiles = await db.file.findMany({
      where: { id: { in: matchingIds } },
      include: {
        owner: { select: { id: true, name: true, username: true } },
        tags: { include: { tag: true } },
      },
    });

    // Sort back to rank order
    rawFiles.sort((a, b) => matchingIds.indexOf(a.id) - matchingIds.indexOf(b.id));

  } else {
    // If there is no text query, we can just use Prisma's findMany directly.
    const where: any = {
      id: { in: permittedFileIds },
      deletedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    };

    if (filters.uploaderId) where.ownerId = filters.uploaderId;
    if (filters.mimeType) where.mimeType = filters.mimeType;
    if (filters.dateRange?.start || filters.dateRange?.end) {
      where.createdAt = {};
      if (filters.dateRange.start) where.createdAt.gte = new Date(filters.dateRange.start);
      if (filters.dateRange.end) where.createdAt.lte = new Date(filters.dateRange.end);
    }

    if (filters.tags && filters.tags.length > 0) {
      where.tags = {
        some: { tag: { value: { in: filters.tags } } },
      };
    }

    rawFiles = await db.file.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true, username: true } },
        tags: { include: { tag: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    } as any);
  }

  // Map to FileMetaRecord
  const results: FileMetaRecord[] = rawFiles.map((file) => ({
    id: file.id,
    ownerId: file.ownerId,
    objectKey: file.objectKey,
    displayName: file.displayName,
    mimeType: file.mimeType,
    size: file.size.toString(),
    owner: file.owner,
    tags: file.tags.map((ft: any) => ft.tag.value),
    visibility: file.visibility,
    folderPath: file.folderPath,
    guestAccess: file.guestAccess,
    isReadOnly: file.isReadOnly,
    isMentionRestricted: file.isMentionRestricted,
    permanentUrlToken: file.permanentUrlToken,
    expiresAt: file.expiresAt ? file.expiresAt.toISOString() : null,
    deletedAt: file.deletedAt ? file.deletedAt.toISOString() : null,
    createdAt: file.createdAt.toISOString(),
    updatedAt: file.updatedAt.toISOString(),
  }));

  // Cache results
  await setJSON(cacheKey, results, 300); // 5 min TTL

  return results;
}
