import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-context";
import { listDeletedFilesForUser } from "@/lib/file-list";
import { TrashClient } from "./trash-client";
import { Trash2Icon } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TrashPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/sign-in");

  const files = await listDeletedFilesForUser({
    id: session.user.id,
    role: session.user.role as string,
  });

  return (
    <div className="flex-1 space-y-6 w-full mx-auto">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Trash2Icon className="size-6 text-primary" /> Recycle Bin
        </h1>
        <p className="text-muted-foreground text-sm">
          Files you deleted are kept here for 30 days. Restore them before they
          are permanently removed.
        </p>
      </div>

      <TrashClient initialFiles={files} />
    </div>
  );
}
