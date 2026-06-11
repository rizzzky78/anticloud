"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Shield, ShieldAlert, User, ShieldCheck, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { setSystemRole } from "@/actions/roles";
import { formatDate } from "@/lib/format";
import { Role } from "@prisma/client";

interface UserItem {
  id: string;
  name: string;
  email: string;
  image: string | null;
  username: string | null;
  role: Role;
  createdAt: Date | string;
}

interface UsersTableClientProps {
  initialUsers: UserItem[];
  currentUserRole: string;
  currentUserId: string;
}

export function UsersTableClient({
  initialUsers,
  currentUserRole,
  currentUserId,
}: UsersTableClientProps) {
  const router = useRouter();
  const [users, setUsers] = useState<UserItem[]>(initialUsers);
  const [searchTerm, setSearchTerm] = useState("");
  const [isPending, startTransition] = useTransition();

  // Dialog State
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingChange, setPendingChange] = useState<{
    userId: string;
    userName: string;
    oldRole: Role;
    newRole: Role;
  } | null>(null);

  // Filter users by search term
  const filteredUsers = users.filter((u) => {
    const term = searchTerm.toLowerCase();
    return (
      u.name.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      (u.username && u.username.toLowerCase().includes(term))
    );
  });

  const getRoleBadge = (role: Role) => {
    switch (role) {
      case "SUPERADMIN":
        return (
          <Badge variant="destructive" className="gap-1 flex items-center w-fit text-[10px] uppercase font-bold tracking-wider">
            <ShieldAlert className="size-3" /> Superadmin
          </Badge>
        );
      case "ADMIN":
        return (
          <Badge variant="default" className="bg-amber-600 hover:bg-amber-600 gap-1 flex items-center w-fit text-[10px] uppercase font-bold tracking-wider">
            <ShieldCheck className="size-3" /> Admin
          </Badge>
        );
      case "VIEWER":
        return (
          <Badge variant="secondary" className="gap-1 flex items-center w-fit text-[10px] uppercase font-bold tracking-wider">
            <User className="size-3" /> Viewer
          </Badge>
        );
      case "GUEST":
        return (
          <Badge variant="outline" className="gap-1 flex items-center w-fit text-[10px] uppercase font-bold tracking-wider">
            <User className="size-3 text-muted-foreground" /> Guest
          </Badge>
        );
      default:
        return null;
    }
  };

  const handleRoleSelect = (userId: string, newRole: Role) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return;
    if (user.role === newRole) return;

    // Set dialog target and open alert dialog
    setPendingChange({
      userId,
      userName: user.name,
      oldRole: user.role,
      newRole,
    });
    setConfirmOpen(true);
  };

  const confirmRoleChange = () => {
    if (!pendingChange) return;
    const { userId, newRole, userName } = pendingChange;

    startTransition(async () => {
      try {
        await setSystemRole({ userId, newRole });
        
        // Update local state
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
        );

        toast.success(`Successfully updated ${userName}'s role to ${newRole}`);
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message || "Failed to update role");
      } finally {
        setPendingChange(null);
        setConfirmOpen(false);
      }
    });
  };

  // Check if current user is allowed to modify role of target user
  const canModifyRole = (targetUser: UserItem) => {
    // Cannot modify oneself
    if (targetUser.id === currentUserId) return false;

    // Only SUPERADMIN can modify a SUPERADMIN
    if (targetUser.role === "SUPERADMIN" && currentUserRole !== "SUPERADMIN") return false;

    // Only SUPERADMIN/ADMIN can modify system roles
    return currentUserRole === "SUPERADMIN" || currentUserRole === "ADMIN";
  };

  // Check if option is selectable
  const isOptionDisabled = (roleOption: Role) => {
    // Only SUPERADMIN can grant SUPERADMIN role
    if (roleOption === "SUPERADMIN" && currentUserRole !== "SUPERADMIN") return true;
    return false;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center relative max-w-sm">
        <Search className="absolute left-3 size-4 text-muted-foreground" />
        <Input
          placeholder="Search users by name, email or username..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card className="border border-border/80 shadow-md">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="w-[250px]">User</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Current Role</TableHead>
                <TableHead>Registered</TableHead>
                <TableHead className="text-right w-[180px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    No users found matching your search.
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => {
                  const isCurrent = user.id === currentUserId;
                  const editable = canModifyRole(user);

                  return (
                    <TableRow key={user.id} className={isCurrent ? "bg-muted/10" : ""}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          <Avatar className="size-9 border border-border">
                            <AvatarImage src={user.image ?? undefined} alt={user.name} />
                            <AvatarFallback className="font-semibold text-xs">
                              {user.name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col min-w-0">
                            <span className="truncate flex items-center gap-1.5">
                              {user.name}
                              {isCurrent && (
                                <Badge variant="secondary" className="px-1 py-0 text-[9px] font-medium leading-none">
                                  You
                                </Badge>
                              )}
                            </span>
                            <span className="text-xs text-muted-foreground truncate">
                              {user.email}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-mono text-muted-foreground">
                        {user.username ? `@${user.username}` : "—"}
                      </TableCell>
                      <TableCell>{getRoleBadge(user.role)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(user.createdAt.toString())}
                      </TableCell>
                      <TableCell className="text-right">
                        {editable ? (
                          <Select
                            defaultValue={user.role}
                            onValueChange={(val) => handleRoleSelect(user.id, val as Role)}
                            disabled={isPending}
                          >
                            <SelectTrigger className="w-[140px] h-8 text-xs inline-flex cursor-pointer">
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="SUPERADMIN" disabled={isOptionDisabled("SUPERADMIN")}>
                                Superadmin
                              </SelectItem>
                              <SelectItem value="ADMIN" disabled={isOptionDisabled("ADMIN")}>
                                Admin
                              </SelectItem>
                              <SelectItem value="VIEWER" disabled={isOptionDisabled("VIEWER")}>
                                Viewer
                              </SelectItem>
                              <SelectItem value="GUEST" disabled={isOptionDisabled("GUEST")}>
                                Guest
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-xs text-muted-foreground italic pr-4">
                            {isCurrent ? "Cannot change self" : "Insufficient access"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Shield className="size-5 text-amber-600" />
              Confirm Role Change
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to change <strong>{pendingChange?.userName}</strong>'s role
              from <strong className="uppercase">{pendingChange?.oldRole}</strong> to{" "}
              <strong className="uppercase text-amber-700">{pendingChange?.newRole}</strong>?
              <br />
              This will update their system-wide access permissions immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRoleChange}
              disabled={isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1.5 cursor-pointer"
            >
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Confirm Change
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
