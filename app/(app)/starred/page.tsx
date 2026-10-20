import { redirect } from "next/navigation";
import { StarIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/auth-context";
import { listStarredFiles, listUserFolderPaths } from "@/lib/file-list";
import { FileList } from "@/components/file-list";
import { EmptyState } from "@/components/empty-state";

export const dynamic = "force-dynamic";

export default async function StarredPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/sign-in");

  const user = { id: session.user.id, role: session.user.role as string };
  const [buckets, folderPaths] = await Promise.all([
    listStarredFiles(user),
    listUserFolderPaths(user),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <StarIcon className="size-6 text-primary" /> Starred
        </h1>
        <p className="text-muted-foreground text-sm">Files you marked with a star for quick access.</p>
      </div>

      {buckets.length === 0 ? (
        <EmptyState
          icon={<StarIcon className="size-10 text-muted-foreground" />}
          title="No starred files"
          description="Star a file from its row or detail page to keep it here."
        />
      ) : (
        <FileList
          buckets={buckets}
          folderPaths={folderPaths}
          userId={user.id}
          userRole={user.role}
          currentFolderPath="/"
          title="Starred"
        />
      )}
    </div>
  );
}
