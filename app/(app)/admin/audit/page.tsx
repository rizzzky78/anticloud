import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, EyeOff, FileText, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  const session = await getCurrentUser();
  const currentUser = session?.user;

  // Audit dashboard is restricted to ADMIN/SUPERADMIN
  if (!currentUser || (currentUser.role !== "ADMIN" && currentUser.role !== "SUPERADMIN")) {
    notFound();
  }

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 max-w-4xl mx-auto">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <FileText className="size-6 text-primary" /> Security Audit Logs
        </h1>
        <p className="text-muted-foreground text-sm">
          Monitor access patterns, privilege changes, and file system mutations.
        </p>
      </div>

      <Card className="border border-border/80 shadow-md relative overflow-hidden bg-muted/5">
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
          <Lock className="size-48 text-foreground" />
        </div>
        <CardHeader className="text-center py-12">
          <div className="mx-auto p-4 bg-amber-500/10 text-amber-600 dark:text-amber-500 border border-amber-500/20 rounded-full w-fit mb-4">
            <EyeOff className="size-8" />
          </div>
          <CardTitle className="text-xl font-bold tracking-tight">⛔ Locked on Phase 10</CardTitle>
          <CardDescription className="max-w-md mx-auto mt-2">
            The append-only Audit Log engine is scheduled to unlock in UI implementation Phase 10 with the creation of the backend <code>actions/audit.ts</code> API.
          </CardDescription>
        </CardHeader>
        <CardContent className="max-w-lg mx-auto pb-12 space-y-6">
          <div className="border-t border-border/60 my-6" />
          
          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Planned Capabilities:</h3>
            <ul className="space-y-3 text-sm text-foreground/80 list-disc list-inside">
              <li><strong>Complete Traceability:</strong> Immutable audit logging of all system actions (logins, file downloads, sharing changes, system role mutations).</li>
              <li><strong>Superadmin Filters:</strong> Filter the append-only logs by specific user account, target resource, action category, or date ranges.</li>
              <li><strong>IP Access tracking:</strong> Log client IP addresses and user agents for audit reporting.</li>
              <li><strong>Exportable Logs:</strong> Ability to compile logs and export as CSV/JSON formats.</li>
            </ul>
          </div>

          <div className="bg-muted border border-border/65 rounded-lg p-4 flex items-start gap-3">
            <ShieldCheck className="size-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="text-xs font-semibold text-foreground">RBAC Guard Enabled</span>
              <p className="text-xs text-muted-foreground leading-normal">
                Rest assured, the API router layout already enforces proper server-side route guards ensuring only <strong>ADMIN</strong> and <strong>SUPERADMIN</strong> identities can access this path once unlocked.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
