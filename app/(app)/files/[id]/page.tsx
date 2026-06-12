import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-context";
import { getFileMeta } from "@/lib/file-meta";
import { getCachedAccess } from "@/lib/permissions";
import { db } from "@/lib/db";
import { listUserFolderPaths } from "@/lib/file-list";
import { FileDetailClient } from "@/components/file-detail-client";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function FileDetailPage({ params }: PageProps) {
  const session = await getCurrentUser();
  if (!session) {
    redirect("/sign-in");
  }

  const { id } = await params;
  const user = {
    id: session.user.id,
    role: session.user.role as any,
    email: session.user.email as string,
    name: session.user.name as string,
  };

  // 1. Fetch file metadata
  let file = await getFileMeta(id);

  // Superadmin bypass for soft-deleted files
  if (!file && user.role === "SUPERADMIN") {
    const rawFile = await db.file.findUnique({
      where: { id },
    });
    if (rawFile) {
      file = {
        id: rawFile.id,
        ownerId: rawFile.ownerId,
        displayName: rawFile.displayName,
        objectKey: rawFile.objectKey,
        mimeType: rawFile.mimeType,
        size: rawFile.size.toString(),
        visibility: rawFile.visibility,
        folderPath: rawFile.folderPath,
        guestAccess: rawFile.guestAccess,
        isReadOnly: rawFile.isReadOnly,
        isMentionRestricted: rawFile.isMentionRestricted,
        permanentUrlToken: rawFile.permanentUrlToken,
        expiresAt: rawFile.expiresAt?.toISOString() ?? null,
        deletedAt: rawFile.deletedAt?.toISOString() ?? null,
        createdAt: rawFile.createdAt.toISOString(),
        updatedAt: rawFile.updatedAt.toISOString(),
      };
    }
  }

  if (!file) {
    notFound();
  }

  // 2. Gate access - permissions check
  const level = await getCachedAccess(user, id);
  if (!level) {
    notFound(); // Prevent existence leaks
  }

  // 3. Fetch related details concurrently
  const [tags, mentions, folderPaths, ownerRecord] = await Promise.all([
    db.fileTag.findMany({
      where: { fileId: id },
      include: { tag: true },
    }),
    db.fileMention.findMany({
      where: { fileId: id },
      include: {
        mentionedUser: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            username: true,
          },
        },
      },
    }),
    listUserFolderPaths(user),
    file.ownerId
      ? db.user.findUnique({
          where: { id: file.ownerId },
          select: { name: true },
        })
      : null,
  ]);

  const ownerName = ownerRecord?.name ?? "Unowned";
  
  const mappedMentions = mentions.map((m) => ({
    id: m.mentionedUser.id,
    name: m.mentionedUser.name,
    email: m.mentionedUser.email,
    image: m.mentionedUser.image,
    username: m.mentionedUser.username,
  }));

  const mappedTags = tags.map((t) => t.tag.value);

  // Fetch derivatives and parent file
  const fileRecord = await db.file.findUnique({
    where: { id },
    select: { derivedFromId: true },
  });
  const derivedFromId = fileRecord?.derivedFromId ?? null;

  const [derivatives, parentFile] = await Promise.all([
    db.file.findMany({
      where: { derivedFromId: id, deletedAt: null },
      select: {
        id: true,
        displayName: true,
        size: true,
        mimeType: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    derivedFromId
      ? db.file.findUnique({
          where: { id: derivedFromId },
          select: {
            id: true,
            displayName: true,
            size: true,
            mimeType: true,
            createdAt: true,
          },
        })
      : null,
  ]);

  const serializedDerivatives = derivatives.map(d => ({
    id: d.id,
    displayName: d.displayName,
    size: d.size.toString(),
    mimeType: d.mimeType,
    createdAt: d.createdAt.toISOString(),
  }));

  const serializedParentFile = parentFile ? {
    id: parentFile.id,
    displayName: parentFile.displayName,
    size: parentFile.size.toString(),
    mimeType: parentFile.mimeType,
    createdAt: parentFile.createdAt.toISOString(),
  } : null;

  return (
    <FileDetailClient
      file={file}
      ownerName={ownerName}
      user={user}
      folderPaths={folderPaths}
      initialTags={mappedTags}
      initialMentions={mappedMentions}
      permissionLevel={level}
      initialDerivatives={serializedDerivatives}
      initialParentFile={serializedParentFile}
    />
  );
}
