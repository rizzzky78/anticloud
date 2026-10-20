"use server";

import { z } from "zod";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-context";
import { AppError } from "@/lib/result";
import { delByPrefix } from "@/lib/cache";
import { redisKey, NS } from "@/lib/redis";
import { invalidatePermCache } from "@/lib/permissions";
import { invalidateUserSearchCache } from "@/lib/search";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { folderPathSchema, sanitizeDisplayName } from "@/lib/paths";
import {
  assertCanUpload,
  folderName,
  getFolderAccess,
  parentPath,
  type FolderAccess,
} from "@/lib/folders";

type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>["user"];

async function requireSession() {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();
  return session;
}

function asAccessUser(user: SessionUser) {
  return { id: user.id, role: user.role as Role };
}

const pathInput = z.object({ path: folderPathSchema });

const folderNameSchema = z
  .string()
  .max(256)
  .transform((v) => sanitizeDisplayName(v).slice(0, 128))
  .pipe(
    z
      .string()
      .min(1, "Folder name is required")
      .refine((v) => v !== "." && v !== "..", "Invalid folder name"),
  );

/** Everything below `path` moved, renamed or deleted: flush derived caches. */
async function afterTreeChange() {
  await invalidatePermCache(null, null);
  await delByPrefix(redisKey(NS.filemeta, ""));
  await invalidateUserSearchCache();
}

/** Throw unless the user may rename/move/delete/share `path`. */
async function requireFolderManager(user: SessionUser, path: string): Promise<FolderAccess> {
  if (path === "/") throw AppError.badRequest("The root folder cannot be changed");
  const access = await getFolderAccess(asAccessUser(user), path);
  if (!access.canManage) throw AppError.forbidden("You cannot manage this folder");
  return access;
}

/**
 * Make sure a Folder row exists for a manageable legacy folder (one derived
 * only from file paths), owned by the caller, so it can carry shares.
 */
async function ensureFolderRow(path: string, ownerId: string) {
  return db.folder.upsert({
    where: { path },
    update: {},
    create: { path, name: folderName(path), ownerId },
  });
}

/** True if any folder row or live file already occupies `path` or below. */
async function pathOccupied(path: string): Promise<boolean> {
  const rows = await db.$queryRaw<{ taken: boolean }[]>`
    SELECT (
      EXISTS (SELECT 1 FROM folder WHERE path = ${path} OR starts_with(path, ${path + "/"}))
      OR EXISTS (
        SELECT 1 FROM "file"
        WHERE "deletedAt" IS NULL
          AND ("folderPath" = ${path} OR starts_with("folderPath", ${path + "/"}))
      )
    ) AS taken
  `;
  return rows[0]?.taken ?? false;
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export type FolderInfo = FolderAccess;

/** What the caller may do with a folder (drives the folder toolbar). */
export async function getFolderInfo(payload: unknown): Promise<FolderInfo> {
  const session = await requireSession();
  const { path } = pathInput.parse(payload);
  return getFolderAccess(asAccessUser(session.user), path);
}

// ─── Create / rename / move / delete ─────────────────────────────────────────

export async function createFolder(payload: unknown) {
  const session = await requireSession();
  const { parentPath: parent, name } = z
    .object({ parentPath: folderPathSchema, name: folderNameSchema })
    .parse(payload);

  await assertCanUpload(asAccessUser(session.user), parent);
  const path = parent === "/" ? `/${name}` : `${parent}/${name}`;

  const existing = await db.folder.findUnique({ where: { path }, select: { id: true } });
  if (existing) throw AppError.conflict("A folder with this name already exists here");

  await db.folder.create({ data: { path, name, ownerId: session.user.id } });
  await recordAudit({
    actorId: session.user.id,
    action: "folder.create",
    targetType: "folder",
    targetId: path,
  });
  return { path };
}

async function relocate(user: SessionUser, from: string, to: string, action: string) {
  if (to === from) return { path: from };
  if (to.startsWith(from + "/")) {
    throw AppError.badRequest("A folder cannot be moved inside itself");
  }
  if (await pathOccupied(to)) {
    throw AppError.conflict("A folder or files already exist at the destination");
  }

  const access = await requireFolderManager(user, from);
  if (!access.exists) await ensureFolderRow(from, user.id);

  const oldLength = from.length;
  await db.$transaction([
    db.$executeRaw`
      UPDATE folder
      SET path = ${to} || substr(path, ${oldLength + 1}), "updatedAt" = NOW()
      WHERE path = ${from} OR starts_with(path, ${from + "/"})
    `,
    db.$executeRaw`
      UPDATE folder SET name = ${folderName(to)} WHERE path = ${to}
    `,
    db.$executeRaw`
      UPDATE "file"
      SET "folderPath" = ${to} || substr("folderPath", ${oldLength + 1})
      WHERE "folderPath" = ${from} OR starts_with("folderPath", ${from + "/"})
    `,
  ]);

  await afterTreeChange();
  await recordAudit({
    actorId: user.id,
    action,
    targetType: "folder",
    targetId: to,
    metadata: { from, to },
  });
  return { path: to };
}

export async function renameFolder(payload: unknown) {
  const session = await requireSession();
  const { path, name } = z.object({ path: folderPathSchema, name: folderNameSchema }).parse(payload);
  const parent = parentPath(path);
  const to = parent === "/" ? `/${name}` : `${parent}/${name}`;
  return relocate(session.user, path, to, "folder.rename");
}

export async function moveFolder(payload: unknown) {
  const session = await requireSession();
  const { path, newParentPath } = z
    .object({ path: folderPathSchema, newParentPath: folderPathSchema })
    .parse(payload);

  await assertCanUpload(asAccessUser(session.user), newParentPath);
  const name = folderName(path);
  const to = newParentPath === "/" ? `/${name}` : `${newParentPath}/${name}`;
  return relocate(session.user, path, to, "folder.move");
}

/**
 * Delete a folder: every live file in its subtree goes to the recycle bin and
 * the folder rows are removed. Restored files reappear at their old path.
 */
export async function deleteFolder(payload: unknown) {
  const session = await requireSession();
  const { path } = pathInput.parse(payload);
  await requireFolderManager(session.user, path);

  const now = new Date();
  const [trashed] = await db.$transaction([
    db.$executeRaw`
      UPDATE "file" SET "deletedAt" = ${now}
      WHERE "deletedAt" IS NULL
        AND ("folderPath" = ${path} OR starts_with("folderPath", ${path + "/"}))
    `,
    db.$executeRaw`
      DELETE FROM folder WHERE path = ${path} OR starts_with(path, ${path + "/"})
    `,
  ]);

  await afterTreeChange();
  await recordAudit({
    actorId: session.user.id,
    action: "folder.delete",
    targetType: "folder",
    targetId: path,
    metadata: { filesTrashed: trashed },
  });
  return { path, filesTrashed: trashed };
}

// ─── Folder sharing ──────────────────────────────────────────────────────────

const shareRoleSchema = z.enum(["VIEWER", "EDITOR", "ADMIN"]);
const SHARE_LABEL: Record<z.infer<typeof shareRoleSchema>, string> = {
  VIEWER: "Viewer",
  EDITOR: "Editor",
  ADMIN: "Manager",
};

export interface FolderShareItem {
  id: string;
  kind: "user" | "group";
  targetId: string;
  name: string;
  detail: string | null;
  role: string;
  expiresAt: string | null;
  grantedBy: string | null;
}

/** Shares on a folder (anyone who can manage it). */
export async function listFolderShares(payload: unknown): Promise<FolderShareItem[]> {
  const session = await requireSession();
  const { path } = pathInput.parse(payload);
  await requireFolderManager(session.user, path);

  const folder = await db.folder.findUnique({
    where: { path },
    select: {
      permissions: {
        where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, name: true, username: true, email: true } },
          group: { select: { id: true, name: true, _count: { select: { members: true } } } },
          grantedBy: { select: { name: true } },
        },
      },
    },
  });
  if (!folder) return [];

  return folder.permissions.map((p) =>
    p.user
      ? {
          id: p.id,
          kind: "user" as const,
          targetId: p.user.id,
          name: p.user.name,
          detail: p.user.username ? `@${p.user.username}` : p.user.email,
          role: p.role,
          expiresAt: p.expiresAt?.toISOString() ?? null,
          grantedBy: p.grantedBy?.name ?? null,
        }
      : {
          id: p.id,
          kind: "group" as const,
          targetId: p.group!.id,
          name: p.group!.name,
          detail: `${p.group!._count.members} members`,
          role: p.role,
          expiresAt: p.expiresAt?.toISOString() ?? null,
          grantedBy: p.grantedBy?.name ?? null,
        },
  );
}

const shareFolderSchema = z.object({
  path: folderPathSchema,
  targetType: z.enum(["user", "group"]),
  targetId: z.string().min(1),
  role: shareRoleSchema,
  expiresAt: z.iso
    .datetime()
    .nullable()
    .optional()
    .refine((v) => v == null || new Date(v).getTime() > Date.now(), {
      message: "Expiry must be in the future",
    }),
});

/** Share a folder (and everything in it) with a user or a group. */
export async function shareFolder(payload: unknown) {
  const session = await requireSession();
  const input = shareFolderSchema.parse(payload);
  const access = await requireFolderManager(session.user, input.path);
  const folder = access.exists
    ? await db.folder.findUniqueOrThrow({ where: { path: input.path } })
    : await ensureFolderRow(input.path, session.user.id);

  const expiry = input.expiresAt ? new Date(input.expiresAt) : null;
  let recipients: string[] = [];
  let targetName: string;

  if (input.targetType === "user") {
    if (input.targetId === session.user.id) throw AppError.badRequest("You cannot share with yourself");
    const user = await db.user.findUnique({ where: { id: input.targetId }, select: { id: true, name: true } });
    if (!user) throw AppError.notFound("User not found");
    targetName = user.name;

    const existing = await db.folderPermission.findUnique({
      where: { folderId_userId: { folderId: folder.id, userId: user.id } },
      select: { role: true },
    });
    await db.folderPermission.upsert({
      where: { folderId_userId: { folderId: folder.id, userId: user.id } },
      update: { role: input.role, expiresAt: expiry, grantedById: session.user.id },
      create: {
        folderId: folder.id,
        userId: user.id,
        role: input.role,
        expiresAt: expiry,
        grantedById: session.user.id,
      },
    });
    if (!existing || existing.role !== input.role) recipients = [user.id];
  } else {
    const group = await db.group.findUnique({
      where: { id: input.targetId },
      select: { id: true, name: true, members: { select: { userId: true }, take: 500 } },
    });
    if (!group) throw AppError.notFound("Group not found");
    targetName = group.name;

    const existing = await db.folderPermission.findUnique({
      where: { folderId_groupId: { folderId: folder.id, groupId: group.id } },
      select: { role: true },
    });
    await db.folderPermission.upsert({
      where: { folderId_groupId: { folderId: folder.id, groupId: group.id } },
      update: { role: input.role, expiresAt: expiry, grantedById: session.user.id },
      create: {
        folderId: folder.id,
        groupId: group.id,
        role: input.role,
        expiresAt: expiry,
        grantedById: session.user.id,
      },
    });
    if (!existing || existing.role !== input.role) {
      recipients = group.members.map((m) => m.userId).filter((id) => id !== session.user.id);
    }
  }

  await invalidatePermCache(null, null);
  await invalidateUserSearchCache();

  await notify(recipients, {
    type: "SHARE",
    message: `${session.user.name} shared the folder "${folder.name}" with ${
      input.targetType === "group" ? targetName : "you"
    } as ${SHARE_LABEL[input.role]}.`,
  });

  await recordAudit({
    actorId: session.user.id,
    action: "folder.share",
    targetType: "folder",
    targetId: input.path,
    metadata: {
      targetType: input.targetType,
      targetId: input.targetId,
      role: input.role,
      expiresAt: expiry?.toISOString() ?? null,
    },
  });
  return { success: true };
}

/** Remove one folder share. */
export async function revokeFolderShare(payload: unknown) {
  const session = await requireSession();
  const { shareId } = z.object({ shareId: z.string().min(1) }).parse(payload);

  const share = await db.folderPermission.findUnique({
    where: { id: shareId },
    select: { id: true, folder: { select: { path: true } } },
  });
  if (!share) throw AppError.notFound("Share not found");
  await requireFolderManager(session.user, share.folder.path);

  await db.folderPermission.delete({ where: { id: share.id } });
  await invalidatePermCache(null, null);
  await invalidateUserSearchCache();
  await recordAudit({
    actorId: session.user.id,
    action: "folder.unshare",
    targetType: "folder",
    targetId: share.folder.path,
    metadata: { shareId },
  });
  return { success: true };
}
