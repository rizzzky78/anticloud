"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Crown,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserMinus,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { searchUsers } from "@/actions/users";
import {
  addGroupMember,
  createGroup,
  deleteGroup,
  getGroup,
  listGroups,
  removeGroupMember,
  setGroupManager,
  updateGroup,
  type GroupDetail,
  type GroupSummary,
} from "@/actions/groups";

interface GroupsClientProps {
  initialGroups: GroupSummary[];
  currentUserId: string;
  isAdmin: boolean;
}

interface UserHit {
  id: string;
  name: string;
  username: string | null;
  email: string;
  image: string | null;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

export function GroupsClient({ initialGroups, currentUserId, isAdmin }: GroupsClientProps) {
  const router = useRouter();
  const [groups, setGroups] = useState(initialGroups);
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initialGroups[0]?.id ?? null);
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Create / edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editMode, setEditMode] = useState<"create" | "edit">("create");
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);

  // Member search
  const [memberQuery, setMemberQuery] = useState("");
  const [memberHits, setMemberHits] = useState<UserHit[]>([]);

  const refreshGroups = useCallback(async () => {
    setGroups(await listGroups());
  }, []);

  const loadDetail = useCallback(async (groupId: string) => {
    setLoadingDetail(true);
    try {
      setDetail(await getGroup({ groupId }));
    } catch (err) {
      toast.error(errorMessage(err, "Failed to load group"));
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    const q = memberQuery.trim();
    if (q.length < 2) {
      setMemberHits([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const users = (await searchUsers(q)) as UserHit[];
        const memberIds = new Set(detail?.members.map((m) => m.userId));
        setMemberHits(users.filter((u) => !memberIds.has(u.id)));
      } catch {
        setMemberHits([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [memberQuery, detail]);

  const run = (fn: () => Promise<void>, fallback: string) => {
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        toast.error(errorMessage(err, fallback));
      }
    });
  };

  const openCreate = () => {
    setEditMode("create");
    setFormName("");
    setFormDescription("");
    setEditOpen(true);
  };

  const openEdit = () => {
    if (!detail) return;
    setEditMode("edit");
    setFormName(detail.name);
    setFormDescription(detail.description ?? "");
    setEditOpen(true);
  };

  const submitForm = () =>
    run(async () => {
      if (editMode === "create") {
        const { groupId } = await createGroup({ name: formName, description: formDescription });
        toast.success(`Group "${formName.trim()}" created`);
        await refreshGroups();
        setSelectedId(groupId);
      } else if (detail) {
        await updateGroup({ groupId: detail.id, name: formName, description: formDescription });
        toast.success("Group updated");
        await refreshGroups();
        await loadDetail(detail.id);
      }
      setEditOpen(false);
    }, "Failed to save group");

  const confirmDelete = () =>
    run(async () => {
      if (!detail) return;
      await deleteGroup({ groupId: detail.id });
      toast.success(`Group "${detail.name}" deleted`);
      setDeleteOpen(false);
      await refreshGroups();
      setSelectedId(null);
      router.refresh();
    }, "Failed to delete group");

  const addMember = (user: UserHit) =>
    run(async () => {
      if (!detail) return;
      await addGroupMember({ groupId: detail.id, userId: user.id });
      toast.success(`${user.name} added`);
      setMemberQuery("");
      setMemberHits([]);
      await Promise.all([loadDetail(detail.id), refreshGroups()]);
    }, "Failed to add member");

  const removeMember = (userId: string, name: string) =>
    run(async () => {
      if (!detail) return;
      await removeGroupMember({ groupId: detail.id, userId });
      const leaving = userId === currentUserId;
      toast.success(leaving ? `You left "${detail.name}"` : `${name} removed`);
      await refreshGroups();
      if (leaving && !detail.canManage) setSelectedId(null);
      else await loadDetail(detail.id);
    }, "Failed to remove member");

  const toggleManager = (userId: string, isManager: boolean) =>
    run(async () => {
      if (!detail) return;
      await setGroupManager({ groupId: detail.id, userId, isManager });
      await loadDetail(detail.id);
    }, "Failed to update member");

  const visibleGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Group list */}
      <Card className="lg:col-span-1 py-0 overflow-hidden">
        <CardHeader className="border-b py-4 space-y-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">All groups ({groups.length})</CardTitle>
            {isAdmin && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="size-4 mr-1" /> New
              </Button>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter groups..."
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {visibleGroups.length === 0 ? (
            <div className="flex flex-col items-center gap-1 p-8 text-center text-muted-foreground">
              <UsersRound className="size-8 text-muted-foreground/30" />
              <span className="text-sm">No groups yet</span>
              {isAdmin && <span className="text-xs">Create one to share files with a team.</span>}
            </div>
          ) : (
            <ul className="divide-y max-h-[60vh] overflow-y-auto">
              {visibleGroups.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(g.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-muted/40",
                      selectedId === g.id && "bg-muted/60",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{g.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {g.memberCount} member{g.memberCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    {g.isMember && (
                      <Badge variant={g.isManager ? "default" : "secondary"} className="text-[10px]">
                        {g.isManager ? "Manager" : "Member"}
                      </Badge>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Group detail */}
      <Card className="lg:col-span-2">
        {!selectedId ? (
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
            <UsersRound className="size-10 text-muted-foreground/30" />
            <span className="text-sm">Select a group to see its members.</span>
          </CardContent>
        ) : loadingDetail && !detail ? (
          <CardContent className="flex items-center gap-2 py-16 justify-center text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading group…
          </CardContent>
        ) : detail ? (
          <>
            <CardHeader className="border-b">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1 min-w-0">
                  <CardTitle className="text-lg">{detail.name}</CardTitle>
                  {detail.description && (
                    <p className="text-sm text-muted-foreground">{detail.description}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  {detail.canManage && (
                    <Button variant="outline" size="sm" onClick={openEdit} disabled={isPending}>
                      <Pencil className="size-3.5 mr-1" /> Edit
                    </Button>
                  )}
                  {detail.isMember && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeMember(currentUserId, "")}
                      disabled={isPending}
                    >
                      <LogOut className="size-3.5 mr-1" /> Leave
                    </Button>
                  )}
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteOpen(true)}
                      disabled={isPending}
                    >
                      <Trash2 className="size-3.5 mr-1" /> Delete
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {detail.canManage && (
                <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-1.5">
                    <UserPlus className="size-3.5" /> Add member
                  </Label>
                  <Input
                    value={memberQuery}
                    onChange={(e) => setMemberQuery(e.target.value)}
                    placeholder="Search people by name, email or username..."
                    disabled={isPending}
                  />
                  {memberHits.length > 0 && (
                    <ul className="divide-y rounded-lg border">
                      {memberHits.map((u) => (
                        <li key={u.id}>
                          <button
                            type="button"
                            onClick={() => addMember(u)}
                            disabled={isPending}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40"
                          >
                            <Avatar className="size-6">
                              {u.image && <AvatarImage src={u.image} alt={u.name} />}
                              <AvatarFallback className="text-[0.6rem]">{initials(u.name)}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium">{u.name}</span>
                            <span className="text-xs text-muted-foreground truncate">
                              {u.username ? `@${u.username}` : u.email}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Members ({detail.members.length})</h4>
                {detail.members.length === 0 ? (
                  <p className="text-sm text-muted-foreground">This group has no members yet.</p>
                ) : (
                  <ul className="divide-y rounded-lg border">
                    {detail.members.map((m) => (
                      <li key={m.userId} className="flex items-center justify-between gap-3 px-3 py-2.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar className="size-8">
                            {m.image && <AvatarImage src={m.image} alt={m.name} />}
                            <AvatarFallback className="text-xs">{initials(m.name)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 text-sm font-medium">
                              <span className="truncate">{m.name}</span>
                              {m.isManager && (
                                <Badge variant="secondary" className="gap-1 text-[10px]">
                                  <Crown className="size-3" /> Manager
                                </Badge>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {m.username ? `@${m.username}` : m.email}
                            </p>
                          </div>
                        </div>
                        {detail.canManage && m.userId !== currentUserId && (
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              title={m.isManager ? "Remove manager rights" : "Make manager"}
                              onClick={() => toggleManager(m.userId, !m.isManager)}
                              disabled={isPending}
                            >
                              <Crown className={cn("size-4", m.isManager && "text-primary")} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              title="Remove from group"
                              onClick={() => removeMember(m.userId, m.name)}
                              disabled={isPending}
                            >
                              <UserMinus className="size-4" />
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </>
        ) : null}
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editMode === "create" ? "New group" : "Edit group"}</DialogTitle>
            <DialogDescription>
              Groups let you share files with a whole team in one step.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="group-name">Name</Label>
              <Input
                id="group-name"
                value={formName}
                maxLength={64}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Finance"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="group-description">Description (optional)</Label>
              <Textarea
                id="group-description"
                value={formDescription}
                maxLength={280}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={submitForm} disabled={isPending || formName.trim().length < 2}>
              {isPending ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete group?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{detail?.name}&quot; will be removed, and its members lose every file
              access that was shared through this group.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={isPending}
            >
              {isPending ? "Deleting..." : "Delete group"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
