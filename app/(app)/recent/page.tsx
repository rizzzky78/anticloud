import { redirect } from "next/navigation";
import { ClockIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/auth-context";
import { listRecentFiles, listUserFolderPaths } from "@/lib/file-list";
import { FileList } from "@/components/file-list";
import { EmptyState } from "@/components/empty-state";

export const dynamic = "force-dynamic";

export default async function RecentPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/sign-in");

  const user = { id: session.user.id, role: session.user.role as string };
  const [buckets, folderPaths] = await Promise.all([
    listRecentFiles(user),
    listUserFolderPaths(user),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ClockIcon className="size-6 text-primary" /> Recent
        </h1>
        <p className="text-muted-foreground text-sm">
          Files you uploaded, opened or edited in the last 30 days.
        </p>
      </div>

      {buckets.length === 0 ? (
        <EmptyState
          icon={<ClockIcon className="size-10 text-muted-foreground" />}
          title="No recent activity"
          description="Files you work with will show up here."
        />
      ) : (
        <FileList
          buckets={buckets}
          folderPaths={folderPaths}
          userId={user.id}
          userRole={user.role}
          currentFolderPath="/"
          title="Recent"
        />
      )}
    </div>
  );
}
