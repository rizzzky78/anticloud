"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Loader2, Trash2, User, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { searchUsers } from "@/actions/users";
import { listGroups, type GroupSummary } from "@/actions/groups";
import {
  listFolderShares,
  revokeFolderShare,
  shareFolder,
  type FolderShareItem,
} from "@/actions/folders";

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

interface UserHit {
  id: string;
  name: string;
  username: string | null;
  email: string;
}

type Target = { type: "user" | "group"; id: string; name: string };

interface FolderShareDialogProps {
  path: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function expiryIso(value: string): string | null {
  return value === "never"
    ? null
    : new Date(Date.now() + Number(value) * 24 * 60 * 60 * 1000).toISOString();
}

/** Share a folder (and everything inside it) with people or groups. */
export function FolderShareDialog({ path, open, onOpenChange }: FolderShareDialogProps) {
  const [shares, setShares] = useState<FolderShareItem[] | null>(null);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<UserHit[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [role, setRole] = useState<ShareRole>("VIEWER");
  const [expiry, setExpiry] = useState("never");
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    try {
      const [s, g] = await Promise.all([listFolderShares({ path }), listGroups()]);
      setShares(s);
      setGroups(g);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load folder shares");
      setShares([]);
    }
  }, [path]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || target) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setHits((await searchUsers(q)) as UserHit[]);
      } catch {
        setHits([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query, target]);

  const submit = (t: Target, r: ShareRole, expiresAt: string | null) =>
    startTransition(async () => {
      try {
        await shareFolder({ path, targetType: t.type, targetId: t.id, role: r, expiresAt });
        toast.success(`Shared with ${t.name}`);
        setTarget(null);
        setQuery("");
        await load();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to share folder");
      }
    });

  const revoke = (share: FolderShareItem) =>
    startTransition(async () => {
      try {
        await revokeFolderShare({ shareId: share.id });
        toast.success(`Stopped sharing with ${share.name}`);
        await load();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to revoke share");
      }
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Share folder</DialogTitle>
          <DialogDescription>
            People and groups you add get access to <span className="font-mono">{path}</span> and
            everything inside it, including files added later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            {target ? (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {target.type === "group" ? <UsersRound className="size-4" /> : <User className="size-4" />}
                  {target.name}
                </span>
                <Button variant="ghost" size="sm" onClick={() => setTarget(null)}>
                  Change
                </Button>
              </div>
            ) : (
              <>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search people by name, email or username..."
                  disabled={isPending}
                />
                {hits.length > 0 && (
                  <ul className="divide-y rounded-lg border max-h-40 overflow-y-auto">
                    {hits.map((u) => (
                      <li key={u.id}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40"
                          onClick={() => setTarget({ type: "user", id: u.id, name: u.name })}
                        >
                          <span className="font-medium">{u.name}</span>
                          <span className="text-xs text-muted-foreground truncate">
                            {u.username ? `@${u.username}` : u.email}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {groups.length > 0 && (
                  <Select
                    value=""
                    onValueChange={(id) => {
                      const g = groups.find((x) => x.id === id);
                      if (g) setTarget({ type: "group", id: g.id, name: g.name });
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="…or choose a group" />
                    </SelectTrigger>
                    <SelectContent>
                      {groups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name} ({g.memberCount})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={role} onValueChange={(v: ShareRole) => setRole(v)} disabled={isPending}>
              <SelectTrigger className="w-full sm:flex-1">
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
              <SelectTrigger className="w-full sm:flex-1">
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
              disabled={!target || isPending}
              onClick={() => target && submit(target, role, expiryIso(expiry))}
            >
              {isPending ? <Loader2 className="size-4 animate-spin" /> : "Share"}
            </Button>
          </div>

          <div className="space-y-2 pt-2">
            <h4 className="text-sm font-semibold">Who has access</h4>
            {shares === null ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading…
              </div>
            ) : shares.length === 0 ? (
              <p className="text-xs text-muted-foreground">This folder is not shared yet.</p>
            ) : (
              <ul className="divide-y rounded-lg border max-h-64 overflow-y-auto">
                {shares.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        {s.kind === "group" ? <UsersRound className="size-3.5" /> : <User className="size-3.5" />}
                        <span className="truncate">{s.name}</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {s.detail}
                        {s.expiresAt ? ` · until ${new Date(s.expiresAt).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Select
                        value={s.role}
                        onValueChange={(v: ShareRole) =>
                          submit({ type: s.kind, id: s.targetId, name: s.name }, v, s.expiresAt)
                        }
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
                        onClick={() => revoke(s)}
                        disabled={isPending}
                        title={`Stop sharing with ${s.name}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex justify-start">
            <Badge variant="outline" className="text-[10px] font-normal">
              Editors can add files; Managers can also rename, move, delete and share.
            </Badge>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
