import { redirect } from "next/navigation";
import { Share2Icon } from "lucide-react";
import { getCurrentUser } from "@/lib/auth-context";
import { listFoldersSharedWithMe, listSharedByMe, listSharedWithMe } from "@/lib/shares";
import { SharedClient } from "./shared-client";

export const dynamic = "force-dynamic";

export default async function SharedPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/sign-in");

  const [withMe, byMe, folders] = await Promise.all([
    listSharedWithMe(session.user.id),
    listSharedByMe(session.user.id),
    listFoldersSharedWithMe(session.user.id),
  ]);

  return (
    <div className="flex-1 space-y-6 w-full mx-auto">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Share2Icon className="size-6 text-primary" /> Shared
        </h1>
        <p className="text-muted-foreground text-sm">
          Files colleagues shared with you, and files you are sharing with others.
        </p>
      </div>

      <SharedClient withMe={withMe} byMe={byMe} folders={folders} />
    </div>
  );
}
