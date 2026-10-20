"use client";

import { useState, useEffect, useTransition } from "react";
import {
  getFilePermissions,
  grantFileRole,
  revokeFileRole,
} from "@/actions/roles";
import { searchUsers } from "@/actions/users";
import { canManage } from "@/lib/ui-access";
import { ShareLinksPanel } from "@/components/share-links-panel";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Users,
  Search,
  UserPlus,
  Trash2,
  Lock,
  Globe,
  Loader2,
  Info,
  ExternalLink,
  ShieldAlert,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import { FileMetaRecord } from "@/lib/file-meta";

interface ShareGrantUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  username: string | null;
  role: string;
}

/** Share tiers offered to managers (ADMIN = "Manager"). */
type ShareRole = "VIEWER" | "EDITOR" | "ADMIN";

const SHARE_ROLES: { value: ShareRole; label: string; description: string }[] = [
  { value: "VIEWER", label: "Viewer", description: "View and download" },
  { value: "EDITOR", label: "Editor", description: "Upload new versions, notes and tags" },
  { value: "ADMIN", label: "Manager", description: "Full control, including sharing" },
];

function roleLabel(role: string): string {
  return SHARE_ROLES.find((r) => r.value === role)?.label ?? role.toLowerCase();
}

const GRANT_EXPIRY_OPTIONS = [
  { value: "never", label: "No expiry" },
  { value: "1", label: "1 day" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

interface SharePermission {
  id: string;
  fileId: string;
  userId: string;
  role: string;
  expiresAt: Date | string | null;
  user: ShareGrantUser;
  grantedBy: {
    id: string;
    name: string;
  } | null;
  createdAt: Date | string;
}

interface FileSharingPanelProps {
  fileId: string;
  file: Pick<
    FileMetaRecord,
    | "id"
    | "displayName"
    | "visibility"
    | "guestAccess"
    | "isMentionRestricted"
    | "ownerId"
    | "isReadOnly"
  >;
  currentUserRole: string;
  currentUserId: string;
  /** Server-resolved manage right; falls back to the display-only heuristic. */
  canManageSharing?: boolean;
  onOpenVisibility?: () => void;
  onOpenConfig?: () => void;
  onSuccess?: () => void;
}

export function FileSharingPanel({
  fileId,
  file,
  currentUserRole,
  currentUserId,
  canManageSharing,
  onOpenVisibility,
  onOpenConfig,
  onSuccess,
}: FileSharingPanelProps) {
  const [permissions, setPermissions] = useState<SharePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Search user selection state
  const [userQuery, setUserQuery] = useState("");
  const [userSearchResults, setUserSearchResults] = useState<ShareGrantUser[]>(
    [],
  );
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ShareGrantUser | null>(null);
  const [selectedRole, setSelectedRole] = useState<ShareRole>("VIEWER");
  const [selectedExpiry, setSelectedExpiry] = useState("never");
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Revoke state
  const [revokeTarget, setRevokeTarget] = useState<SharePermission | null>(
    null,
  );

  // Sharing is an access-control setting, so a read-only lock does not block it.
  const userCanManage =
    canManageSharing ?? canManage({ ...file, isReadOnly: false }, currentUserId, currentUserRole);

  // Fetch permissions
  const fetchPermissions = async () => {
    try {
      setLoading(true);
      const res = await getFilePermissions({ fileId });
      // Map/cast to local type safely
      setPermissions(res as any);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load sharing settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPermissions();
  }, [fileId]);

  // Debounced search for users
  useEffect(() => {
    if (!userQuery.trim()) {
      setUserSearchResults([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setSearchingUsers(true);
      try {
        const users = await searchUsers(userQuery.trim());
        // Filter out file owner and users who already have explicit permission
        const filtered = (users as ShareGrantUser[]).filter(
          (u) =>
            u.id !== file.ownerId &&
            !permissions.some((p) => p.userId === u.id),
        );
        setUserSearchResults(filtered);
      } catch (err) {
        console.error("Failed to search users", err);
      } finally {
        setSearchingUsers(false);
      }
    }, 200);

    return () => clearTimeout(delayDebounce);
  }, [userQuery, permissions, file.ownerId]);

  const handleGrantRole = () => {
    if (!selectedUser) return;

    startTransition(async () => {
      try {
        await grantFileRole({
          fileId,
          targetUserId: selectedUser.id,
          role: selectedRole,
          expiresAt:
            selectedExpiry === "never"
              ? null
              : new Date(
                  Date.now() + Number(selectedExpiry) * 24 * 60 * 60 * 1000,
                ).toISOString(),
        });
        toast.success(
          `Shared with ${selectedUser.name} as ${roleLabel(selectedRole)}`,
        );
        setSelectedUser(null);
        setUserQuery("");
        setIsSearchOpen(false);
        fetchPermissions();
        if (onSuccess) onSuccess();
      } catch (err: any) {
        toast.error(err?.message || "Failed to grant permission");
      }
    });
  };

  const handleChangeRole = (grant: SharePermission, role: ShareRole) => {
    if (grant.role === role) return;
    startTransition(async () => {
      try {
        await grantFileRole({
          fileId,
          targetUserId: grant.userId,
          role,
          expiresAt: grant.expiresAt ? new Date(grant.expiresAt).toISOString() : null,
        });
        toast.success(`${grant.user.name} is now ${roleLabel(role)}`);
        fetchPermissions();
        if (onSuccess) onSuccess();
      } catch (err: any) {
        toast.error(err?.message || "Failed to update access");
      }
    });
  };

  const handleRevokeRole = () => {
    if (!revokeTarget) return;

    startTransition(async () => {
      try {
        await revokeFileRole({
          fileId,
          targetUserId: revokeTarget.userId,
        });
        toast.success(`Revoked access for ${revokeTarget.user.name}`);
        setRevokeTarget(null);
        fetchPermissions();
        if (onSuccess) onSuccess();
      } catch (err: any) {
        toast.error(err?.message || "Failed to revoke permission");
      }
    });
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  return (
    <div className="space-y-6">
      {/* Access Summary Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border bg-muted/30">
        <div className="space-y-1">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            {file.visibility === "PUBLIC" ? (
              <>
                <Globe className="size-4 text-zinc-500" /> Public Access Link
              </>
            ) : (
              <>
                <Lock className="size-4 text-muted-foreground" /> Private Link
              </>
            )}
          </h4>
          <p className="text-xs text-muted-foreground leading-normal">
            {file.visibility === "PUBLIC"
              ? file.guestAccess
                ? "Anyone on the internet with the link can view and download this file."
                : "Any signed-in user with the link can view this file."
              : "Only the owner and people with explicit permission grants can access this file."}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant="outline" className="text-xs">
              {file.visibility === "PUBLIC" ? "Public" : "Private"}
            </Badge>
            {file.visibility === "PUBLIC" && file.guestAccess && (
              <Badge
                variant="secondary"
                className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-300 border-none text-[10px]"
              >
                Guest Allowed
              </Badge>
            )}
            {file.isMentionRestricted && (
              <Badge
                variant="secondary"
                className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-300 border-none text-[10px]"
              >
                Mention Gate On
              </Badge>
            )}
          </div>
        </div>

        {userCanManage && (onOpenVisibility || onOpenConfig) && (
          <div className="flex flex-wrap gap-2 shrink-0">
            {onOpenVisibility && (
              <Button variant="outline" size="sm" onClick={onOpenVisibility}>
                Change Visibility
              </Button>
            )}
            {onOpenConfig && (
              <Button
                variant="ghost"
                size="sm"
                className="border"
                onClick={onOpenConfig}
              >
                <Settings className="size-3.5 mr-1" /> Config Gating
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Grant Access Section (Owner & Admin only) */}
      {userCanManage && (
        <div className="space-y-3 p-4 rounded-xl border bg-card text-card-foreground shadow-xs">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <UserPlus className="size-4 text-primary" /> Grant Access
          </h4>

          <div className="flex flex-col md:flex-row gap-3">
            {/* User Search Combobox */}
            <div className="flex-1 relative">
              <Popover open={isSearchOpen} onOpenChange={setIsSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal h-10 px-3 border-b-input"
                    disabled={isPending}
                  >
                    <Search className="size-4 mr-2 text-muted-foreground" />
                    {selectedUser ? (
                      <span className="text-foreground font-medium">
                        {selectedUser.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        Search by name, email, or username...
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Type name or email..."
                      value={userQuery}
                      onValueChange={setUserQuery}
                    />
                    <CommandList>
                      {searchingUsers && (
                        <div className="flex items-center justify-center p-3 text-xs text-muted-foreground">
                          <Loader2 className="size-4 animate-spin mr-2" />{" "}
                          Searching...
                        </div>
                      )}

                      {!searchingUsers && userSearchResults.length > 0 && (
                        <CommandGroup heading="Suggestions">
                          {userSearchResults.map((user) => (
                            <CommandItem
                              key={user.id}
                              onSelect={() => {
                                setSelectedUser(user);
                                setIsSearchOpen(false);
                              }}
                              className="flex items-center gap-2 py-2 cursor-pointer"
                            >
                              <Avatar className="size-6">
                                {user.image && (
                                  <AvatarImage
                                    src={user.image}
                                    alt={user.name}
                                  />
                                )}
                                <AvatarFallback className="text-[0.65rem]">
                                  {getInitials(user.name)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs font-semibold truncate leading-none mb-0.5">
                                  {user.name}
                                </span>
                                <span className="text-[0.65rem] text-muted-foreground truncate">
                                  {user.username
                                    ? `@${user.username}`
                                    : user.email}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}

                      {!searchingUsers &&
                        userQuery.trim() &&
                        userSearchResults.length === 0 && (
                          <CommandEmpty className="p-3 text-xs text-muted-foreground text-center">
                            No users found
                          </CommandEmpty>
                        )}

                      {!userQuery.trim() && (
                        <CommandEmpty className="p-3 text-xs text-muted-foreground text-center">
                          Type to search...
                        </CommandEmpty>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Role select */}
            <div className="w-full md:w-36">
              <Select
                value={selectedRole}
                onValueChange={(val: ShareRole) => setSelectedRole(val)}
                disabled={isPending}
              >
                <SelectTrigger className="w-full h-10 border-b-input">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {SHARE_ROLES.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Expiry select */}
            <div className="w-full md:w-32">
              <Select
                value={selectedExpiry}
                onValueChange={setSelectedExpiry}
                disabled={isPending}
              >
                <SelectTrigger className="w-full h-10 border-b-input">
                  <SelectValue placeholder="Expiry" />
                </SelectTrigger>
                <SelectContent>
                  {GRANT_EXPIRY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Action button */}
            <Button
              onClick={handleGrantRole}
              disabled={!selectedUser || isPending}
              className="h-10 px-4 shrink-0 shadow-xs"
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : (
                <UserPlus className="size-4 mr-2" />
              )}
              Share
            </Button>
          </div>
          {selectedUser && (
            <p className="text-[10px] text-muted-foreground">
              Sharing with {selectedUser.name} as{" "}
              <strong>{roleLabel(selectedRole)}</strong> (
              {SHARE_ROLES.find((r) => r.value === selectedRole)?.description}).
              They will be notified.
            </p>
          )}
        </div>
      )}

      {/* Users list with access */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" /> Explicit Access
          Grants
        </h4>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="size-8 animate-spin text-muted-foreground/30 mb-2" />
            <span className="text-xs">Loading access grants...</span>
          </div>
        ) : permissions.length === 0 ? (
          <div className="text-center p-6 border border-dashed rounded-xl text-muted-foreground">
            <Users className="size-8 mx-auto text-muted-foreground/20 mb-2" />
            <p className="text-xs">
              No explicit user access grants exist for this file.
            </p>
            <p className="text-[10px] mt-0.5 text-muted-foreground/80">
              Only the owner has default full access.
            </p>
          </div>
        ) : (
          <div className="border rounded-xl overflow-hidden shadow-xs bg-card">
            <div className="divide-y">
              {permissions.map((grant) => {
                const grantUser = grant.user;
                return (
                  <div
                    key={grant.id}
                    className="flex items-center justify-between p-3.5 hover:bg-muted/10 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="size-8 shrink-0">
                        {grantUser.image && (
                          <AvatarImage
                            src={grantUser.image}
                            alt={grantUser.name}
                          />
                        )}
                        <AvatarFallback className="text-xs">
                          {getInitials(grantUser.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground truncate max-w-[150px] sm:max-w-xs">
                            {grantUser.name}
                          </span>
                          {!userCanManage && (
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1.5 py-0.5 border-zinc-200 text-zinc-700 bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:bg-zinc-900/50"
                            >
                              {roleLabel(grant.role)}
                            </Badge>
                          )}
                          {grant.expiresAt && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0.5">
                              until {new Date(grant.expiresAt).toLocaleDateString()}
                            </Badge>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground truncate">
                          {grantUser.username
                            ? `@${grantUser.username}`
                            : grantUser.email}
                        </span>
                        {grant.grantedBy && (
                          <span className="text-[9px] text-muted-foreground/70 mt-0.5">
                            Granted by {grant.grantedBy.name}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Level select + revoke (managers only) */}
                    {userCanManage && (
                      <div className="flex items-center gap-1 shrink-0">
                      <Select
                        value={grant.role}
                        onValueChange={(val: ShareRole) => handleChangeRole(grant, val)}
                        disabled={isPending}
                      >
                        <SelectTrigger className="h-8 w-28 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SHARE_ROLES.map((role) => (
                            <SelectItem key={role.value} value={role.value} className="text-xs">
                              {role.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                        onClick={() => setRevokeTarget(grant)}
                        disabled={isPending}
                        title={`Revoke access for ${grantUser.name}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Public share links (managers only; not for mention-restricted files) */}
      {userCanManage && !file.isMentionRestricted && <ShareLinksPanel fileId={fileId} />}

      {/* Revoke confirmation Dialog */}
      <AlertDialog
        open={!!revokeTarget}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke file access?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke{" "}
              <strong>{revokeTarget ? roleLabel(revokeTarget.role) : ""}</strong> access for{" "}
              <strong>{revokeTarget?.user.name}</strong>? They will lose
              explicit permission to view, download, or edit this file.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleRevokeRole}
              disabled={isPending}
            >
              {isPending ? "Revoking..." : "Revoke Access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
