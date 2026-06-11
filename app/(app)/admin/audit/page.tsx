import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-context";
import { getAuditLogs } from "@/actions/audit";
import { AuditClient } from "./audit-client";
import { FileText } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  const session = await getCurrentUser();
  const currentUser = session?.user;

  // Audit dashboard is restricted strictly to SUPERADMIN
  if (!currentUser || currentUser.role !== "SUPERADMIN") {
    notFound();
  }

  // Fetch initial page of logs
  const result = await getAuditLogs({
    page: 1,
    limit: 25,
  });

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 max-w-6xl mx-auto">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <FileText className="size-6 text-primary" /> Security Audit Logs
        </h1>
        <p className="text-muted-foreground text-sm">
          SUPERADMIN Console: Monitor access patterns, privilege changes, and file system mutations.
        </p>
      </div>

      <AuditClient
        initialLogs={result.logs as any}
        initialTotal={result.total}
        initialTotalPages={result.totalPages}
        initialActionTypes={result.actionTypes}
      />
    </div>
  );
}
