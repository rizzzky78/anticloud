"use server";

import { z } from "zod";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-context";
import { AppError } from "@/lib/result";
import { invalidatePermCache, requireAccess } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { invalidateUserSearchCache } from "@/lib/search";

type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>["user"];

export interface GroupSummary {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  isMember: boolean;
  isManager: boolean;
}

export interface GroupMemberItem {
  userId: string;
  name: string;
  username: string | null;
  email: string;
  image: string | null;
  isManager: boolean;
  joinedAt: string;
}

export interface GroupDetail extends GroupSummary {
  members: GroupMemberItem[];
  canManage: boolean;
}

function isSystemAdmin(user: SessionUser) {
  return user.role === "ADMIN" || user.role === "SUPERADMIN";
}

async function requireSession() {
  const session = await getCurrentUser();
  if (!session) throw AppError.unauthorized();
  return session;
}

/** System admins manage every group; group managers manage their own. */
async function requireGroupManager(user: SessionUser, groupId: string) {
  const group = await db.group.findUnique({ where: { id: groupId }, select: { id: true, name: true } });
  if (!group) throw AppError.notFound("Group not found");
  if (isSystemAdmin(user)) return group;

  const membership = await db.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: user.id } },
    select: { isManager: true },
  });
  if (!membership?.isManager) throw AppError.forbidden("Only group managers can do this");
  return group;
}

/** A membership change alters every file permission that user inherits. */
async function onMembershipChanged(userId: string) {
  await invalidatePermCache(userId, null);
  await invalidateUserSearchCache();
}

const groupNameSchema = z
  .string()
  .trim()
  .min(2, "Group name must be at least 2 characters")
  .max(64, "Group name must be at most 64 characters");

// ─── Queries ─────────────────────────────────────────────────────────────────

/** All groups (for sharing pickers and the groups page), alphabetical. */
export async function listGroups(): Promise<GroupSummary[]> {
  const session = await requireSession();

  const groups = await db.group.findMany({
    orderBy: { name: "asc" },
    take: 500,
    select: {
      id: true,
      name: true,
      description: true,
      _count: { select: { members: true } },
      members: { where: { userId: session.user.id }, select: { isManager: true } },
    },
  });
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    memberCount: g._count.members,
    isMember: g.members.length > 0,
    isManager: g.members[0]?.isManager ?? false,
  }));
}

/** One group with its member list. */
export async function getGroup(payload: unknown): Promise<GroupDetail> {
  const session = await requireSession();
  const { groupId } = z.object({ groupId: z.string().min(1) }).parse(payload);

  const group = await db.group.findUnique({
    where: { id: groupId },
    include: {
      members: {
        orderBy: [{ isManager: "desc" }, { createdAt: "asc" }],
        include: {
          user: { select: { id: true, name: true, username: true, email: true, image: true } },
        },
      },
    },
  });
  if (!group) throw AppError.notFound("Group not found");

  const mine = group.members.find((m) => m.userId === session.user.id);
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    memberCount: group.members.length,
    isMember: !!mine,
    isManager: mine?.isManager ?? false,
    canManage: isSystemAdmin(session.user) || !!mine?.isManager,
    members: group.members.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      username: m.user.username,
      email: m.user.email,
      image: m.user.image,
      isManager: m.isManager,
      joinedAt: m.createdAt.toISOString(),
    })),
  };
}

// ─── Group CRUD (system admins) ──────────────────────────────────────────────

const createGroupSchema = z.object({
  name: groupNameSchema,
  description: z.string().trim().max(280).optional().transform((v) => v || null),
});

export async function createGroup(payload: unknown) {
  const session = await requireSession();
  if (!isSystemAdmin(session.user)) throw AppError.forbidden("Only administrators can create groups");

  const { name, description } = createGroupSchema.parse(payload);
  const exists = await db.group.findUnique({ where: { name }, select: { id: true } });
  if (exists) throw AppError.conflict("A group with this name already exists");

  const group = await db.group.create({
    data: { name, description, createdById: session.user.id },
  });
  await recordAudit({
    actorId: session.user.id,
    action: "group.create",
    targetType: "group",
    targetId: group.id,
    metadata: { name },
  });
  return { groupId: group.id };
}

const updateGroupSchema = createGroupSchema.extend({ groupId: z.string().min(1) });

export async function updateGroup(payload: unknown) {
  const session = await requireSession();
  const { groupId, name, description } = updateGroupSchema.parse(payload);
  await requireGroupManager(session.user, groupId);

  const clash = await db.group.findFirst({
    where: { name, NOT: { id: groupId } },
    select: { id: true },
  });
  if (clash) throw AppError.conflict("A group with this name already exists");

  await db.group.update({ where: { id: groupId }, data: { name, description } });
  await recordAudit({
    actorId: session.user.id,
    action: "group.update",
    targetType: "group",
    targetId: groupId,
    metadata: { name },
  });
  return { groupId };
}

export async function deleteGroup(payload: unknown) {
  const session = await requireSession();
  if (!isSystemAdmin(session.user)) throw AppError.forbidden("Only administrators can delete groups");

  const { groupId } = z.object({ groupId: z.string().min(1) }).parse(payload);
  const group = await db.group.findUnique({
    where: { id: groupId },
    select: {
      name: true,
      members: { select: { userId: true } },
      permissions: { select: { fileId: true } },
    },
  });
  if (!group) throw AppError.notFound("Group not found");

  await db.group.delete({ where: { id: groupId } });
  for (const { fileId } of group.permissions) await invalidatePermCache(null, fileId);
  await invalidateUserSearchCache();

  await recordAudit({
    actorId: session.user.id,
    action: "group.delete",
    targetType: "group",
    targetId: groupId,
    metadata: { name: group.name, members: group.members.length },
  });
  return { groupId };
}

// ─── Membership (system admins + group managers) ─────────────────────────────

const memberSchema = z.object({ groupId: z.string().min(1), userId: z.string().min(1) });

export async function addGroupMember(payload: unknown) {
  const session = await requireSession();
  const { groupId, userId } = memberSchema.parse(payload);
  const group = await requireGroupManager(session.user, groupId);

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw AppError.notFound("User not found");

  const existing = await db.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { id: true },
  });
  if (existing) return { groupId };

  await db.groupMember.create({ data: { groupId, userId } });
  await onMembershipChanged(userId);
  if (userId !== session.user.id) {
    await db.notification.create({
      data: {
        userId,
        type: "GROUP",
        message: `${session.user.name} added you to the group "${group.name}".`,
      },
    });
  }
  await recordAudit({
    actorId: session.user.id,
    action: "group.member_add",
    targetType: "group",
    targetId: groupId,
    metadata: { userId },
  });
  return { groupId };
}

export async function removeGroupMember(payload: unknown) {
  const session = await requireSession();
  const { groupId, userId } = memberSchema.parse(payload);

  // Members may always leave; removing someone else needs manage rights.
  if (userId !== session.user.id) await requireGroupManager(session.user, groupId);

  const { count } = await db.groupMember.deleteMany({ where: { groupId, userId } });
  if (count > 0) {
    await onMembershipChanged(userId);
    await recordAudit({
      actorId: session.user.id,
      action: userId === session.user.id ? "group.leave" : "group.member_remove",
      targetType: "group",
      targetId: groupId,
      metadata: { userId },
    });
  }
  return { groupId };
}

export async function setGroupManager(payload: unknown) {
  const session = await requireSession();
  const { groupId, userId, isManager } = memberSchema
    .extend({ isManager: z.boolean() })
    .parse(payload);
  await requireGroupManager(session.user, groupId);

  const { count } = await db.groupMember.updateMany({
    where: { groupId, userId },
    data: { isManager },
  });
  if (count === 0) throw AppError.notFound("Member not found");

  await recordAudit({
    actorId: session.user.id,
    action: "group.member_manager",
    targetType: "group",
    targetId: groupId,
    metadata: { userId, isManager },
  });
  return { groupId };
}

// ─── File ↔ group sharing (file managers) ────────────────────────────────────

const shareRoleSchema = z.enum(["VIEWER", "EDITOR", "ADMIN"]);
const SHARE_LABEL: Record<z.infer<typeof shareRoleSchema>, string> = {
  VIEWER: "Viewer",
  EDITOR: "Editor",
  ADMIN: "Manager",
};
const MAX_NOTIFIED_MEMBERS = 500;

const grantGroupSchema = z.object({
  fileId: z.string().min(1),
  groupId: z.string().min(1),
  role: shareRoleSchema,
  expiresAt: z.iso
    .datetime()
    .nullable()
    .optional()
    .refine((v) => v == null || new Date(v).getTime() > Date.now(), {
      message: "Expiry must be in the future",
    }),
});

export interface FileGroupGrant {
  id: string;
  groupId: string;
  groupName: string;
  memberCount: number;
  role: string;
  expiresAt: string | null;
  grantedBy: string | null;
}

/** Group shares of a file (anyone who can read the file). */
export async function getFileGroupPermissions(payload: unknown): Promise<FileGroupGrant[]> {
  const session = await requireSession();
  const { fileId } = z.object({ fileId: z.string().min(1) }).parse(payload);
  await requireAccess({ id: session.user.id, role: session.user.role as Role }, fileId, "VIEWER");

  const rows = await db.fileGroupPermission.findMany({
    where: { fileId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    orderBy: { createdAt: "desc" },
    include: {
      group: { select: { id: true, name: true, _count: { select: { members: true } } } },
      grantedBy: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    groupId: r.group.id,
    groupName: r.group.name,
    memberCount: r.group._count.members,
    role: r.role,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    grantedBy: r.grantedBy?.name ?? null,
  }));
}

/** Share a file with a group, or change the group's level. */
export async function grantGroupRole(payload: unknown) {
  const session = await requireSession();
  const { fileId, groupId, role, expiresAt } = grantGroupSchema.parse(payload);
  await requireAccess({ id: session.user.id, role: session.user.role as Role }, fileId, "ADMIN");

  const [group, file, existing] = await Promise.all([
    db.group.findUnique({
      where: { id: groupId },
      select: { name: true, members: { select: { userId: true }, take: MAX_NOTIFIED_MEMBERS } },
    }),
    db.file.findUnique({ where: { id: fileId }, select: { displayName: true, ownerId: true } }),
    db.fileGroupPermission.findUnique({
      where: { fileId_groupId: { fileId, groupId } },
      select: { role: true },
    }),
  ]);
  if (!group) throw AppError.notFound("Group not found");
  if (!file) throw AppError.notFound("File not found");

  const expiry = expiresAt ? new Date(expiresAt) : null;
  await db.fileGroupPermission.upsert({
    where: { fileId_groupId: { fileId, groupId } },
    update: { role, expiresAt: expiry, grantedById: session.user.id },
    create: { fileId, groupId, role, expiresAt: expiry, grantedById: session.user.id },
  });

  await invalidatePermCache(null, fileId);
  await invalidateUserSearchCache();

  if (!existing || existing.role !== role) {
    const recipients = group.members
      .map((m) => m.userId)
      .filter((id) => id !== session.user.id && id !== file.ownerId);
    if (recipients.length > 0) {
      await db.notification.createMany({
        data: recipients.map((userId) => ({
          userId,
          fileId,
          type: "SHARE",
          message: `${session.user.name} shared "${file.displayName}" with ${group.name} as ${SHARE_LABEL[role]}.`,
        })),
      });
    }
  }

  await recordAudit({
    actorId: session.user.id,
    action: "role.grant_group",
    targetType: "file",
    targetId: fileId,
    metadata: { groupId, role, expiresAt: expiry?.toISOString() ?? null },
  });
  return { success: true };
}

/** Stop sharing a file with a group. */
export async function revokeGroupRole(payload: unknown) {
  const session = await requireSession();
  const { fileId, groupId } = z
    .object({ fileId: z.string().min(1), groupId: z.string().min(1) })
    .parse(payload);
  await requireAccess({ id: session.user.id, role: session.user.role as Role }, fileId, "ADMIN");

  const { count } = await db.fileGroupPermission.deleteMany({ where: { fileId, groupId } });
  if (count > 0) {
    await invalidatePermCache(null, fileId);
    await invalidateUserSearchCache();
    await recordAudit({
      actorId: session.user.id,
      action: "role.revoke_group",
      targetType: "file",
      targetId: fileId,
      metadata: { groupId },
    });
  }
  return { success: true };
}
