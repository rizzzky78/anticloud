import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { RecycleBinClient } from "./recycle-bin-client";
import { Trash2Icon } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminRecycleBinPage() {
  const session = await getCurrentUser();
  const currentUser = session?.user;

  // Recycle bin is restricted to SUPERADMIN
  if (!currentUser || currentUser.role !== "SUPERADMIN") {
    notFound();
  }

  // Fetch soft-deleted files within the 30-day grace period
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const deletedFiles = await db.file.findMany({
    where: {
      deletedAt: {
        not: null,
        gt: thirtyDaysAgo,
      },
    },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      deletedAt: "desc",
    },
  });

  // Serialize BigInt and Dates
  const serializedFiles = deletedFiles.map((f) => ({
    id: f.id,
    displayName: f.displayName,
    mimeType: f.mimeType,
    size: f.size.toString(),
    deletedAt: f.deletedAt!.toISOString(),
    owner: f.owner ? { name: f.owner.name, email: f.owner.email } : null,
  }));

  return (
    <div className="">
      <div className="flex-1 space-y-6 w-full mx-auto xl:col-span-2">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Trash2Icon className="size-6 text-primary" /> Recycle Bin
          </h1>
          <p className="text-muted-foreground text-sm">
            SUPERADMIN Console: Recover soft-deleted files within their 30-day
            grace window.
          </p>
        </div>

        <RecycleBinClient initialFiles={serializedFiles} />
      </div>
    </div>
  );
}
