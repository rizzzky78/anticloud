"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { redis, redisKey } from "@/lib/redis";
import { getCurrentUser } from "@/lib/auth-context";
import { AppError } from "@/lib/result";
import { getCachedAccess, requireAccess } from "@/lib/permissions";

// ─── Redis key ────────────────────────────────────────────────────────────────
// `note:<fileId>` → JSON-serialised current note (body + version + authorId).
// Kept separate from `filemeta:` to allow independent invalidation.
const NOTE_TTL_SECONDS = 60 * 10; // 10 minutes

function noteKey(fileId: string): string {
  return `note:${fileId}`;
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const fileIdSchema = z.object({ fileId: z.string().min(1) });

const saveNoteSchema = z.object({
  fileId: z.string().min(1),
  body: z.string().max(100_000), // generous cap; blank body is a valid clear
});

const historySchema = z.object({
  fileId: z.string().min(1),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NoteSnapshot {
  id: string;
  version: number;
  body: string;
  authorId: string | null;
  authorName: string | null;
  createdAt: Date;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Write the current note snapshot to Redis. */
async function cacheNote(fileId: string, note: NoteSnapshot): Promise<void> {
  await redis.set(noteKey(fileId), JSON.stringify(note), "EX", NOTE_TTL_SECONDS);
}

/** Remove cached note — must be called before every write returns. */
async function bustNoteCache(fileId: string): Promise<void> {
  await redis.del(noteKey(fileId));
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * 7.2 — Get the current (highest-version) note for a file.
 *
 * - Requires at least VIEWER access.
 * - Returns `null` if no note has been written yet.
 * - Hot path: served from Redis when cached.
 */
export async function getCurrentNote(
  payload: z.infer<typeof fileIdSchema>,
): Promise<NoteSnapshot | null> {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const { fileId } = fileIdSchema.parse(payload);

  // Permission gate.
  const level = await getCachedAccess(session.user as any, fileId);
  if (!level) throw AppError.forbidden();

  // ── Cache hit ──────────────────────────────────────────────────────────────
  const cached = await redis.get(noteKey(fileId));
  if (cached) {
    const parsed = JSON.parse(cached) as NoteSnapshot;
    // Rehydrate the Date (JSON serialises it as string).
    parsed.createdAt = new Date(parsed.createdAt);
    return parsed;
  }

  // ── DB fetch ───────────────────────────────────────────────────────────────
  const note = await db.fileNote.findFirst({
    where: { fileId },
    orderBy: { version: "desc" },
    select: {
      id: true,
      version: true,
      body: true,
      authorId: true,
      createdAt: true,
      author: { select: { name: true } },
    },
  });

  if (!note) return null;

  const snapshot: NoteSnapshot = {
    id: note.id,
    version: note.version,
    body: note.body,
    authorId: note.authorId,
    authorName: note.author?.name ?? null,
    createdAt: note.createdAt,
  };

  await cacheNote(fileId, snapshot);
  return snapshot;
}

/**
 * 7.2 / 7.3 — Save a new note version.
 *
 * Each call inserts a new row (version = max(existing) + 1).
 * Busts the note cache **before** returning so no stale read can occur.
 *
 * - Requires at least VIEWER access.
 * - Rejects if the file is `isReadOnly`.
 */
export async function saveNote(
  payload: z.infer<typeof saveNoteSchema>,
): Promise<NoteSnapshot> {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const { fileId, body } = saveNoteSchema.parse(payload);

  // Permission gate.
  await requireAccess(session.user as any, fileId, "VIEWER");

  // Read-only guard.
  const file = await db.file.findUnique({
    where: { id: fileId },
    select: { isReadOnly: true },
  });
  if (!file) throw AppError.notFound("File not found");
  if (file.isReadOnly) throw AppError.readOnly("Cannot edit notes on a read-only file");

  // Determine next version atomically.
  const newNote = await db.$transaction(async (tx) => {
    const latest = await tx.fileNote.findFirst({
      where: { fileId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const nextVersion = (latest?.version ?? 0) + 1;

    return tx.fileNote.create({
      data: {
        fileId,
        version: nextVersion,
        body,
        authorId: session.user.id,
      },
      select: {
        id: true,
        version: true,
        body: true,
        authorId: true,
        createdAt: true,
        author: { select: { name: true } },
      },
    });
  });

  const snapshot: NoteSnapshot = {
    id: newNote.id,
    version: newNote.version,
    body: newNote.body,
    authorId: newNote.authorId,
    authorName: newNote.author?.name ?? null,
    createdAt: newNote.createdAt,
  };

  // Bust cache BEFORE returning so no reader can see a stale version.
  await bustNoteCache(fileId);
  // Warm the cache with the fresh snapshot.
  await cacheNote(fileId, snapshot);

  // Phase 8 Search refresh
  const { updateSearchVector, invalidateUserSearchCache } = await import("@/lib/search");
  await updateSearchVector(fileId);
  
  const fileForOwner = await db.file.findUnique({ where: { id: fileId }, select: { ownerId: true }});
  if (fileForOwner?.ownerId) await invalidateUserSearchCache(fileForOwner.ownerId);

  return snapshot;
}

/**
 * 7.4 — Retrieve the full version history for a file's note.
 *
 * Restricted to the file owner and ADMIN+ users; plain VIEWER access is
 * insufficient (history may contain sensitive authorship data).
 */
export async function getNoteHistory(
  payload: z.input<typeof historySchema>,
): Promise<NoteSnapshot[]> {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();

  const { fileId, limit } = historySchema.parse(payload);

  // Requires ADMIN or higher.
  await requireAccess(session.user as any, fileId, "ADMIN");

  const rows = await db.fileNote.findMany({
    where: { fileId },
    orderBy: { version: "desc" },
    take: limit,
    select: {
      id: true,
      version: true,
      body: true,
      authorId: true,
      createdAt: true,
      author: { select: { name: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    version: r.version,
    body: r.body,
    authorId: r.authorId,
    authorName: r.author?.name ?? null,
    createdAt: r.createdAt,
  }));
}
