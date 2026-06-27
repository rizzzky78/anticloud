import { getCurrentUser } from "@/lib/auth-context";
import { getUsers } from "@/actions/users";
import { UsersTableClient } from "./users-table-client";
import { UsersIcon } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await getCurrentUser();
  const currentUser = session?.user;
  const users = await getUsers();

  return (
    <div className="">
      <div className="flex-1 space-y-6 w-full mx-auto">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <UsersIcon className="size-6 text-primary" /> User Role Management
          </h1>
          <p className="text-muted-foreground text-sm">
            View all registered users and manage their system access roles.
          </p>
        </div>

        <UsersTableClient
          initialUsers={users}
          currentUserRole={currentUser?.role as string}
          currentUserId={currentUser?.id as string}
        />
      </div>
    </div>
  );
}
