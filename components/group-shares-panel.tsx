"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Loader2, Trash2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getFileGroupPermissions,
  grantGroupRole,
  listGroups,
  revokeGroupRole,
  type FileGroupGrant,
  type GroupSummary,
} from "@/actions/groups";

type ShareRole = "VIEWER" | "EDITOR" | "ADMIN";

const SHARE_ROLES: { value: ShareRole; label: string }[] = [
  { value: "VIEWER", label: "Viewer" },
  { value: "EDITOR", label: "Editor" },
  { value: "ADMIN", label: "Manager" },
];

const EXPIRY_OPTIONS = [
  { value: "never", label: "No expiry" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

function roleLabel(role: string) {
  return SHARE_ROLES.find((r) => r.value === role)?.label ?? role.toLowerCase();
}

interface GroupSharesPanelProps {
  fileId: string;
  canManage: boolean;
  onChanged?: () => void;
}

/** Share a file with whole groups and manage existing group shares. */
export function GroupSharesPanel({ fileId, canManage, onChanged }: GroupSharesPanelProps) {
  const [grants, setGrants] = useState<FileGroupGrant[] | null>(null);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [groupId, setGroupId] = useState("");
  const [role, setRole] = useState<ShareRole>("VIEWER");
  const [expiry, setExpiry] = useState("never");
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    try {
      const [g, all] = await Promise.all([
        getFileGroupPermissions({ fileId }),
        canManage ? listGroups() : Promise.resolve([]),
      ]);
      setGrants(g);
      setGroups(all);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load group shares");
      setGrants([]);
    }
  }, [fileId, canManage]);

  useEffect(() => {
    load();
  }, [load]);

  const share = (targetGroupId: string, targetRole: ShareRole, expiresAt: string | null) =>
    startTransition(async () => {
      try {
        await grantGroupRole({ fileId, groupId: targetGroupId, role: targetRole, expiresAt });
        toast.success("Group access updated");
        setGroupId("");
        await load();
        onChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to share with group");
      }
    });

  const revoke = (grant: FileGroupGrant) =>
    startTransition(async () => {
      try {
        await revokeGroupRole({ fileId, groupId: grant.groupId });
        toast.success(`Stopped sharing with ${grant.groupName}`);
        await load();
        onChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to revoke group access");
      }
    });

  const available = groups.filter((g) => !grants?.some((gr) => gr.groupId === g.id));

  if (!canManage && grants !== null && grants.length === 0) return null;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <UsersRound className="size-4 text-muted-foreground" /> Groups
      </h4>

      {canManage && (
        <div className="flex flex-col md:flex-row gap-2 p-3 rounded-xl border bg-card">
          <Select value={groupId} onValueChange={setGroupId} disabled={isPending || available.length === 0}>
            <SelectTrigger className="w-full md:flex-1 h-10">
              <SelectValue placeholder={available.length ? "Choose a group" : "No groups available"} />
            </SelectTrigger>
            <SelectContent>
              {available.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name} ({g.memberCount})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={role} onValueChange={(v: ShareRole) => setRole(v)} disabled={isPending}>
            <SelectTrigger className="w-full md:w-32 h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SHARE_ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={expiry} onValueChange={setExpiry} disabled={isPending}>
            <SelectTrigger className="w-full md:w-32 h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPIRY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            className="h-10"
            disabled={!groupId || isPending}
            onClick={() =>
              share(
                groupId,
                role,
                expiry === "never"
                  ? null
                  : new Date(Date.now() + Number(expiry) * 24 * 60 * 60 * 1000).toISOString(),
              )
            }
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : "Share"}
          </Button>
        </div>
      )}

      {grants === null ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="size-4 animate-spin" /> Loading group shares…
        </div>
      ) : grants.length === 0 ? (
        <p className="text-xs text-muted-foreground">Not shared with any group.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {grants.map((grant) => (
            <li key={grant.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">{grant.groupName}</p>
                <p className="text-[10px] text-muted-foreground">
                  {grant.memberCount} member{grant.memberCount === 1 ? "" : "s"}
                  {grant.grantedBy ? ` · shared by ${grant.grantedBy}` : ""}
                  {grant.expiresAt ? ` · until ${new Date(grant.expiresAt).toLocaleDateString()}` : ""}
                </p>
              </div>
              {canManage ? (
                <div className="flex items-center gap-1 shrink-0">
                  <Select
                    value={grant.role}
                    onValueChange={(v: ShareRole) => share(grant.groupId, v, grant.expiresAt)}
                    disabled={isPending}
                  >
                    <SelectTrigger className="h-8 w-28 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SHARE_ROLES.map((r) => (
                        <SelectItem key={r.value} value={r.value} className="text-xs">
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    title={`Stop sharing with ${grant.groupName}`}
                    onClick={() => revoke(grant)}
                    disabled={isPending}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ) : (
                <Badge variant="outline" className="text-[10px]">
                  {roleLabel(grant.role)}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
