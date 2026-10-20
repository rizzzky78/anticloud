import { redirect } from "next/navigation";
import { UsersRoundIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/auth-context";
import { listGroups } from "@/actions/groups";
import { GroupsClient } from "./groups-client";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/sign-in");

  const groups = await listGroups();
  const role = session.user.role as string;

  return (
    <div className="flex-1 space-y-6 w-full mx-auto">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <UsersRoundIcon className="size-6 text-primary" /> Groups
        </h1>
        <p className="text-muted-foreground text-sm">
          Teams and departments. Share a file with a group to give every member access at once.
        </p>
      </div>

      <GroupsClient
        initialGroups={groups}
        currentUserId={session.user.id}
        isAdmin={role === "ADMIN" || role === "SUPERADMIN"}
      />
    </div>
  );
}
